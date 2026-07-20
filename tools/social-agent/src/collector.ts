import path from "node:path";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { z } from "zod";
import { PlaywrightCollector, type CollectionBrowser, type DetailSupplementalEvidence } from "./browser.js";
import { DeepSeekClient, type StructuredModel } from "./deepseek.js";
import { appendJsonLine, atomicWriteJson, ensureDir, safeSegment } from "./storage.js";
import {
  CandidateSchema, CommentSchema, InputSchema, ItemSchema, PlatformSchema, RunSummarySchema,
  SearchPlanSchema, WebsiteSchema, type Candidate, type CollectedItem, type Comment,
  type BrowserConfig, type CollectionInput, type Platform, type RunSummary, type SearchPlan, type ValidatedInput, type WebsiteData
} from "./schemas.js";

const WebsiteExtractionSchema = WebsiteSchema.omit({
  officialWebsiteUrl: true,
  collectedAt: true,
  screenshotPath: true,
  rawPageText: true,
  officialPages: true,
  pricingPlans: true,
  officialPromotions: true
});
const WorthinessDecisionSchema = z.object({
  externalId: z.string().min(1),
  shouldCollect: z.boolean(),
  relevanceScore: z.number().min(0).max(40),
  reason: z.string().min(2),
  evidence: z.array(z.string()).max(8),
  evidenceAnalysis: z.object({
    detail: z.object({
      extractedFacts: z.array(z.string()).max(12),
      summary: z.string().nullable()
    }),
    poster: z.object({
      available: z.boolean(),
      viewpoint: z.string().nullable(),
      extractedFacts: z.array(z.string()).max(12),
      summary: z.string().nullable()
    }),
    captions: z.object({
      available: z.boolean(),
      extractedFacts: z.array(z.string()).max(12),
      summary: z.string().nullable()
    })
  })
});
const BatchWorthinessDecisionSchema = z.object({
  decisions: z.array(WorthinessDecisionSchema).min(1).max(5)
});
const platformCollectionDeadlineMs = 25 * 60_000;

type WorthinessDecision = z.infer<typeof WorthinessDecisionSchema>;
type PendingDetail = {
  candidate: Candidate;
  itemDirectory: string;
  item: CollectedItem;
  comments: Comment[];
  supplementalEvidence: DetailSupplementalEvidence | null;
  detailStatus: "completed" | "partial" | "blocked";
};

export interface CollectionResult {
  runId: string;
  runDirectory: string;
  summary: RunSummary;
}

export interface CollectorDependencies {
  model?: StructuredModel;
  browserFactory?: (sessionName: string, runDirectory: string, browserConfig: BrowserConfig, allowedHosts: string[]) => CollectionBrowser;
  dataRoot?: string;
  now?: () => Date;
}

export class CollectionAgent {
  private readonly model: StructuredModel;
  private readonly browserFactory: (sessionName: string, runDirectory: string, browserConfig: BrowserConfig, allowedHosts: string[]) => CollectionBrowser;
  private readonly dataRoot: string;
  private readonly now: () => Date;

  constructor(dependencies: CollectorDependencies = {}) {
    this.model = dependencies.model ?? new DeepSeekClient();
    this.browserFactory = dependencies.browserFactory ?? ((sessionName, runDirectory, browserConfig, allowedHosts) => new PlaywrightCollector({ sessionName, runDirectory, browserConfig, allowedHosts }));
    this.dataRoot = path.resolve(dependencies.dataRoot ?? "data/runs");
    this.now = dependencies.now ?? (() => new Date());
  }

  async run(rawInput: CollectionInput): Promise<CollectionResult> {
    const input = InputSchema.parse(rawInput);
    const startedAt = this.now().toISOString();
    const runId = `${startedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
    const runDirectory = path.join(this.dataRoot, runId);
    await ensureDir(runDirectory);
    await atomicWriteJson(path.join(runDirectory, "input.json"), input);

    const summary: RunSummary = {
      runId, appName: input.appName, status: "completed", platforms: {},
      deepSeekUsage: { ...this.model.usage }, startedAt, completedAt: startedAt
    };

    try {
      const website = input.skipOfficialWebsiteCollection
        ? this.websiteFromExistingEvidence(input)
        : await this.collectWebsite(input, runDirectory, runId);
      await atomicWriteJson(path.join(runDirectory, "website.json"), WebsiteSchema.parse(website));
      const searchPlan = await this.generateSearchPlan(website, input);
      await atomicWriteJson(path.join(runDirectory, "search-plan.json"), SearchPlanSchema.parse(searchPlan));

      for (const platform of input.platforms) {
        summary.platforms[platform] = await this.collectPlatform(platform, input, searchPlan, runDirectory, runId);
        await this.saveSummary(summary, runDirectory, false);
      }
      summary.status = Object.values(summary.platforms).some((x) => x?.status !== "completed") ? "partial" : "completed";
    } catch (error) {
      summary.status = "failed";
      await this.logError(runDirectory, { stage: "run", error: String(error) });
    }

    await this.saveSummary(summary, runDirectory, true);
    return { runId, runDirectory, summary: RunSummarySchema.parse(summary) };
  }

  private async collectWebsite(input: ValidatedInput, runDirectory: string, runId: string): Promise<WebsiteData> {
    const screenshotPath = path.join(runDirectory, "website.png");
    const browser = this.makeBrowser(`website-${runId}`, runDirectory, [new URL(input.officialWebsite).hostname], input.browser);
    try {
      const evidence = await browser.collectWebsite(input, screenshotPath);
      const extracted = await this.model.generate(
        "Extract a product context using only the supplied visible official-website evidence. Do not add outside knowledge. Missing singular fields are null and missing list fields are empty arrays.",
        `Target app: ${input.appName}. Visited official URLs: ${JSON.stringify(evidence.visitedUrls)}. Official evidence:\n${evidence.rawPageText.slice(0, 100_000)}\nReturn JSON matching: ${JSON.stringify(z.toJSONSchema(WebsiteExtractionSchema))}`,
        WebsiteExtractionSchema
      );
      return WebsiteSchema.parse({
        ...extracted,
        rawPageText: evidence.rawPageText,
        officialPages: evidence.officialPages,
        pricingPlans: evidence.pricingPlans,
        officialPromotions: evidence.officialPromotions,
        officialWebsiteUrl: input.officialWebsite,
        collectedAt: this.now().toISOString(),
        screenshotPath
      });
    } finally {
      await browser.close();
    }
  }

  private websiteFromExistingEvidence(input: ValidatedInput): WebsiteData {
    if (!input.officialWebsiteEvidence?.trim()) throw new Error("Existing official website evidence is required when website collection is skipped");
    return WebsiteSchema.parse({
      officialProductName: null,
      brandAliases: [],
      positioning: null,
      categories: [],
      targetUsers: [],
      coreFeatures: [],
      useCases: [],
      supportedPlatforms: [],
      pricingModel: null,
      keySellingPoints: [],
      mentionedCompetitorsOrAlternatives: [],
      officialWebsiteUrl: input.officialWebsite,
      collectedAt: this.now().toISOString(),
      rawPageText: input.officialWebsiteEvidence,
      officialPages: [],
      pricingPlans: [],
      officialPromotions: [],
      screenshotPath: ""
    });
  }

  private async generateSearchPlan(website: WebsiteData, input: ValidatedInput): Promise<SearchPlan> {
    const generatedAt = this.now().toISOString();
    const plan = await this.model.generate(
      "Generate search queries solely from the supplied official-website evidence. Do not introduce unsupported product facts. Produce exactly five queries for each of youtube, reddit, and tiktok. Each platform must include at least one query for each intent: review_experience, problems_pricing_alternatives, comparison. Use the two additional queries to broaden useful retrieval around alternatives, competitor recommendations, real user pain points, use cases, or audience-specific discussions.",
      `Target app: ${input.appName}; country=${input.country}; language=${input.language}. Official evidence JSON: ${JSON.stringify({ ...website, rawPageText: website.rawPageText.slice(0, 30_000) })}. Return JSON matching: ${JSON.stringify(z.toJSONSchema(SearchPlanSchema))}`,
      SearchPlanSchema
    );
    for (const platform of PlatformSchema.options) {
      plan[platform] = plan[platform].map((entry) => ({ ...entry, platform, generatedAt }));
      const intents = new Set(plan[platform].map((entry) => entry.intent));
      if (intents.size !== 3) throw new Error(`${platform} search plan must cover all three intents`);
    }
    return SearchPlanSchema.parse(plan);
  }

  private async collectPlatform(platform: Platform, input: ValidatedInput, plan: SearchPlan, runDirectory: string, runId: string) {
    const platformHosts: Record<Platform, string[]> = {
      youtube: ["youtube.com", "youtu.be"],
      reddit: ["reddit.com", "redd.it"],
      tiktok: ["tiktok.com"]
    };
    const browser = this.makeBrowser(`${platform}-${runId}`, runDirectory, platformHosts[platform], input.browser);
    const deadline = Date.now() + platformCollectionDeadlineMs;
    let candidates: Candidate[] = [];
    const candidateGroups: Array<{ query: string; intent: string; candidates: Candidate[] }> = [];
    let selectedCount = 0;
    let commentCount = 0;
    let status: "completed" | "partial" | "blocked" | "failed" = "completed";
    let reason: string | undefined;
    let reasonCode: string | undefined;

    try {
      for (const query of plan[platform]) {
        try {
          assertBeforeDeadline(deadline, platform);
          const result = await browser.search(platform, query.query, input);
          if (result.status !== "completed") {
            status = result.status;
            reason = result.reason ?? `Public ${platform} search was restricted`;
            reasonCode = result.reasonCode ?? reasonCode;
            if (result.status === "blocked") break;
          }
          const parsedCandidates = result.candidates.map((candidate, index) => CandidateSchema.parse({
            ...candidate, platform, matchedQuery: query.query,
            searchPosition: candidate.searchPosition || index + 1,
            collectedAt: this.now().toISOString()
          })).slice(0, candidatePoolSize(input));
          candidateGroups.push({ query: query.query, intent: query.intent, candidates: parsedCandidates });
          candidates.push(...parsedCandidates);
        } catch (error) {
          status = "partial";
          reason = `Query failed: ${String(error)}`;
          await this.logError(runDirectory, { platform, stage: "search", query: query.query, error: String(error) });
        }
      }

      candidates = usesGroupedSearchAndSave(platform)
        ? flattenSearchGroups(candidateGroups)
        : deduplicateBySearchOrder(candidates);
      await atomicWriteJson(path.join(runDirectory, "candidates", `${platform}.json`), candidates.map((x) => CandidateSchema.parse(x)));
      if (platform === "reddit" && candidates.length === 0) {
        status = status === "blocked" ? "blocked" : "partial";
        reasonCode = reasonCode ?? "REDDIT_DOM_NO_CANDIDATES";
        reason = reason ?? "Reddit search pages were opened, but no valid post links were extracted from the DOM.";
      }
      let rejectedCount = 0;
      const collectPendingDetail = async (candidate: Candidate): Promise<PendingDetail | "blocked" | "failed" | "skipped"> => {
        const itemDirectory = path.join(runDirectory, "items", platform, safeSegment(candidate.externalId));
        await ensureDir(itemDirectory);
        try {
          assertBeforeDeadline(deadline, platform);
          const result = await browser.collectDetail(platform, candidate, input);
          if (result.status === "blocked") {
            status = "blocked";
            reason = result.reason ?? `Public ${platform} detail page was restricted`;
            return "blocked";
          }
          if (!result.item) {
            status = "partial";
            reason = result.reason ?? "Detail extraction was unavailable";
            return "skipped";
          }
          const extractedItem = ItemSchema.parse({ ...result.item, platform, externalId: candidate.externalId, sourceUrl: candidate.sourceUrl, collectedAt: this.now().toISOString() });
          const comments = result.comments.slice(0, input.maxCommentsPerItem).map((comment) => CommentSchema.parse(comment));
          const lowCommentThreshold = lowCommentCountThreshold(input);
          if (comments.length < lowCommentThreshold) {
            await appendJsonLine(path.join(runDirectory, "actions.jsonl"), {
              at: this.now().toISOString(),
              engine: "collector",
              action: "skip_detail_low_comment_count",
              platform,
              externalId: candidate.externalId,
              commentCandidateCount: comments.length,
              threshold: lowCommentThreshold
            });
            await rm(itemDirectory, { recursive: true, force: true }).catch(() => undefined);
            return "skipped";
          }
          const supplementalEvidence = await browser.collectDetailSupplement(platform, candidate, input);
          if (result.status === "partial") status = "partial";
          return { candidate, itemDirectory, item: extractedItem, comments, supplementalEvidence, detailStatus: result.status };
        } catch (error) {
          status = "partial";
          reason = `A detail page failed: ${String(error)}`;
          await this.logError(runDirectory, { platform, stage: "detail", externalId: candidate.externalId, error: String(error) });
          return "failed";
        }
      };

      const flushPendingDetails = async (
        pendingDetails: Array<{ detail: PendingDetail; group?: { saved: number; target: number } }>,
        maxTotalSaved: number
      ): Promise<"ok" | "failed"> => {
        if (!pendingDetails.length) return "ok";
        if (pendingDetails.length > 5) {
          for (let index = 0; index < pendingDetails.length; index += 5) {
            const outcome = await flushPendingDetails(pendingDetails.slice(index, index + 5), maxTotalSaved);
            if (outcome === "failed") return "failed";
          }
          return "ok";
        }
        try {
          const decisions = await this.evaluateWorthinessBatch(input, pendingDetails.map((entry) => entry.detail));
          for (const entry of pendingDetails) {
            const { detail, group } = entry;
            const decision = decisions.get(detail.candidate.externalId);
            const canSave = selectedCount < maxTotalSaved && (!group || group.saved < group.target);
            if (!decision?.shouldCollect || !canSave) {
              rejectedCount += 1;
              await appendJsonLine(path.join(runDirectory, "actions.jsonl"), {
                at: this.now().toISOString(),
                engine: decision ? "deepseek" : "collector",
                action: decision ? "reject_detail" : "reject_detail_missing_batch_decision",
                platform,
                externalId: detail.candidate.externalId,
                decision: decision ?? null
              });
              await rm(detail.itemDirectory, { recursive: true, force: true }).catch(() => undefined);
              continue;
            }
            const item: CollectedItem = ItemSchema.parse({
              ...detail.item,
              supplementalEvidence: detail.supplementalEvidence ?? undefined,
              collectionDecision: decision
            });
            await atomicWriteJson(path.join(detail.itemDirectory, "item.json"), item);
            await atomicWriteJson(path.join(detail.itemDirectory, "comments.json"), detail.comments);
            selectedCount += 1;
            if (group) group.saved += 1;
            commentCount += detail.comments.length;
            if (detail.detailStatus === "partial") status = "partial";
          }
          return "ok";
        } catch (error) {
          status = "partial";
          reason = `Batch detail decision failed: ${String(error)}`;
          await this.logError(runDirectory, { platform, stage: "batch_decision", error: String(error) });
          for (const entry of pendingDetails) {
            await rm(entry.detail.itemDirectory, { recursive: true, force: true }).catch(() => undefined);
          }
          return "failed";
        }
      };

      if (usesGroupedSearchAndSave(platform)) {
        const groupStates = buildRoundRobinGroups(candidates, input.maxItemsPerPlatform);
        const attempted = new Set<string>();
        let blocked = false;
        while (!blocked && groupStates.some((group) => group.saved < group.target && group.cursor < group.candidates.length)) {
          let attemptedThisRound = false;
          const batch: Array<{ detail: PendingDetail; group: { saved: number; target: number } }> = [];
          for (const group of groupStates) {
            if (group.saved >= group.target) continue;
            let candidate: Candidate | undefined;
            while (group.cursor < group.candidates.length) {
              const next = group.candidates[group.cursor++];
              if (!next || attempted.has(candidateKey(next))) continue;
              candidate = next;
              break;
            }
            if (!candidate) continue;
            attempted.add(candidateKey(candidate));
            attemptedThisRound = true;
            const outcome = await collectPendingDetail(candidate);
            if (outcome === "blocked") {
              blocked = true;
              break;
            }
            if (typeof outcome === "object") batch.push({ detail: outcome, group });
          }
          if (batch.length) await flushPendingDetails(batch, Number.POSITIVE_INFINITY);
          if (!attemptedThisRound) break;
        }
        const incompleteGroups = groupStates.filter((group) => group.saved < group.target);
        if (!reason && incompleteGroups.length) {
          status = "partial";
          reason = `${platform} saved per query: ${groupStates.map((group) => `"${group.query}" ${group.saved}/${group.target}`).join("; ")}.`;
        }
      } else {
        const batch: Array<{ detail: PendingDetail }> = [];
        for (const candidate of candidates) {
          if (selectedCount >= input.maxItemsPerPlatform) break;
          const outcome = await collectPendingDetail(candidate);
          if (outcome === "blocked") break;
          if (typeof outcome === "object") batch.push({ detail: outcome });
          if (batch.length >= 5) {
            await flushPendingDetails(batch.splice(0), input.maxItemsPerPlatform);
          }
        }
        if (batch.length && selectedCount < input.maxItemsPerPlatform) await flushPendingDetails(batch, input.maxItemsPerPlatform);
      }
      if (!reason && selectedCount < input.maxItemsPerPlatform && rejectedCount > 0) {
        reason = `Saved ${selectedCount}/${input.maxItemsPerPlatform}; ${rejectedCount} candidate detail pages were rejected by DeepSeek.`;
      }
    } catch (error) {
      status = /login|captcha|blocked|access|time limit/i.test(String(error)) ? "blocked" : "failed";
      reason = String(error);
      await this.logError(runDirectory, { platform, stage: "platform", error: String(error) });
    } finally {
      await browser.close();
    }
    return { status, candidateCount: candidates.length, selectedCount, commentCount, ...(reasonCode ? { reasonCode } : {}), ...(reason ? { reason } : {}) };
  }

  private async evaluateWorthinessBatch(input: ValidatedInput, details: PendingDetail[]) {
    const batch = details.slice(0, 5).map((detail, index) => ({
      index: index + 1,
      commentCountToSaveDirectly: detail.comments.length,
      visibleItemEvidence: visibleItemEvidenceForDecision(detail.item, detail.candidate),
      commentsForPageDecision: detail.comments.map((comment, commentIndex) => ({
        index: commentIndex + 1,
        author: comment.author,
        content: comment.content.slice(0, 700),
        publishedAt: comment.publishedAt,
        likeCount: comment.likeCount,
        replyCount: comment.replyCount
      })),
      supplementalPublicEvidence: {
        youtubeCaptions: detail.supplementalEvidence?.youtubeCaptions
          ? {
            captionTrackUrl: detail.supplementalEvidence.youtubeCaptions.captionTrackUrl,
            captionLanguage: detail.supplementalEvidence.youtubeCaptions.captionLanguage,
            captionText: detail.supplementalEvidence.youtubeCaptions.captionText?.slice(0, 6_000) ?? null,
            reason: detail.supplementalEvidence.youtubeCaptions.reason,
            collectedAt: detail.supplementalEvidence.youtubeCaptions.collectedAt
          }
          : null
      }
    }));
    const payload = await this.model.generate(
      "Decide from up to five supplied public detail-page evidence objects which items should be saved for downstream community analysis of the target app. Make one decision per externalId. Reject unrelated namesakes, listicles with only a brief mention, pure reposts without useful detail, and content with no meaningful product discussion. Do not use outside knowledge. Comments are provided only as supporting evidence for whether the page itself is relevant and valuable enough to save. Do not select, rank, filter, summarize, or assign labels to individual comments; comments are saved directly by collection order outside this model call. Extract and summarize only valid information that is actually present in each detail evidence object, captions evidence, and the comments insofar as they support the page-level save decision. For Reddit, posterViewpoint is the already-merged post title plus body: extract one unified poster viewpoint from it, covering the author's core claim, complaint, recommendation, comparison, use case, or question in evidenceAnalysis.poster.viewpoint. Do not split title and body into separate findings. For non-Reddit items, set poster.available=false unless the visible detail clearly contains a creator/post author viewpoint separate from comments. If captions are unavailable or contain no useful target-app information, set captions.available=false or use empty facts/null summary; do not invent caption content. If detail evidence and comments have no useful target-app information, use empty facts/null summary and usually reject. Never invent externalIds.",
      `Target app: ${input.appName}. Platform=${details[0]?.candidate.platform ?? "unknown"}. The collector will directly save the first ${input.maxCommentsPerItem} collected comments for every accepted item; your output must not include selected comment IDs or any comment-level filtering decision. Candidate detail batch: ${JSON.stringify(batch)}. Return JSON matching: ${JSON.stringify(z.toJSONSchema(BatchWorthinessDecisionSchema))}`,
      BatchWorthinessDecisionSchema
    );
    return new Map(payload.decisions.map((decision) => [decision.externalId, decision]));
  }

  private makeBrowser(sessionName: string, runDirectory: string, allowedHosts: string[], browserConfig: BrowserConfig): CollectionBrowser {
    return this.browserFactory(sessionName, runDirectory, browserConfig, allowedHosts);
  }

  private async logError(runDirectory: string, error: object): Promise<void> {
    await appendJsonLine(path.join(runDirectory, "errors.jsonl"), { at: this.now().toISOString(), ...error });
  }

  private async saveSummary(summary: RunSummary, runDirectory: string, complete: boolean): Promise<void> {
    summary.deepSeekUsage = { ...this.model.usage };
    if (complete) summary.completedAt = this.now().toISOString();
    await atomicWriteJson(path.join(runDirectory, "run-summary.json"), RunSummarySchema.parse(summary));
  }
}

function assertBeforeDeadline(deadline: number, platform: Platform): void {
  if (Date.now() >= deadline) throw new Error(`${platform} time limit exceeded`);
}

function candidateKey(candidate: Candidate): string {
  return `${candidate.platform}:${candidate.externalId}`;
}

function usesGroupedSearchAndSave(platform: Platform): boolean {
  return platform === "youtube" || platform === "reddit" || platform === "tiktok";
}

function candidatePoolSize(input: ValidatedInput): number {
  return input.maxItemsPerPlatform * 3;
}

function lowCommentCountThreshold(input: ValidatedInput): number {
  return 1;
}

function visibleItemEvidenceForDecision(item: CollectedItem, candidate: Candidate) {
  const posterViewpoint = [item.title, item.body || item.description]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 6_000) || null;
  if (candidate.platform === "reddit") {
    return {
      platform: item.platform,
      externalId: item.externalId,
      author: item.author,
      publishedAt: item.publishedAt,
      posterViewpoint,
      tags: item.tags,
      sourceUrl: item.sourceUrl,
      subreddit: item.subreddit,
      flair: item.flair,
      commentCount: item.commentCount,
      postScore: item.postScore,
      relatedLinks: item.relatedLinks
    };
  }
  return {
    platform: item.platform,
    externalId: item.externalId,
    title: item.title,
    author: item.author,
    publishedAt: item.publishedAt,
    description: item.description,
    body: item.body,
    tags: item.tags,
    sourceUrl: item.sourceUrl,
    subreddit: item.subreddit,
    flair: item.flair,
    viewCount: item.viewCount,
    likeCount: item.likeCount,
    commentCount: item.commentCount,
    shareCount: item.shareCount,
    postScore: item.postScore,
    relatedLinks: item.relatedLinks
  };
}

function deduplicateBySearchOrder(candidates: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const output: Candidate[] = [];
  for (const candidate of candidates.sort((left, right) => left.searchPosition - right.searchPosition)) {
    const key = candidateKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(candidate);
  }
  return output;
}

function flattenSearchGroups(
  groups: Array<{ query: string; intent: string; candidates: Candidate[] }>
): Candidate[] {
  const seen = new Set<string>();
  const output: Candidate[] = [];
  groups.forEach((group, groupIndex) => {
    for (const candidate of group.candidates.sort((left, right) => left.searchPosition - right.searchPosition)) {
      const key = candidateKey(candidate);
      if (seen.has(key)) continue;
      seen.add(key);
      output.push({
        ...candidate,
        matchedQuery: group.query,
        matchedQueries: candidate.matchedQueries ?? [group.query],
        searchGroupIndex: groupIndex,
        searchGroupQuery: group.query
      });
    }
  });
  return output;
}

function buildRoundRobinGroups(candidates: Candidate[], target: number): Array<{
  query: string;
  target: number;
  saved: number;
  cursor: number;
  candidates: Candidate[];
}> {
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const query = candidate.searchGroupQuery ?? candidate.matchedQuery;
    const values = groups.get(query) ?? [];
    values.push(candidate);
    groups.set(query, values);
  }
  return [...groups.entries()].map(([query, values]) => ({
    query,
    target,
    saved: 0,
    cursor: 0,
    candidates: values.sort((left, right) => left.searchPosition - right.searchPosition)
  }));
}
