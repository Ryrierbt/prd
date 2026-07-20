import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Locator, type Page, type Response } from "playwright";
import { appendJsonLine, ensureDir } from "./storage.js";
import type { BrowserConfig, Candidate, CollectedItem, Comment, Platform, ValidatedInput } from "./schemas.js";

export interface WebsiteEvidence {
  rawPageText: string;
  screenshotPath: string;
  visitedUrls: string[];
  officialPages: OfficialWebsitePageEvidence[];
  pricingPlans: PricingPlanEvidence[];
  officialPromotions: OfficialPromotionEvidence[];
}

export interface OfficialWebsitePageEvidence {
  url: string;
  label: string;
  title: string | null;
  description: string | null;
  textSnippet: string;
  sellingPoints: string[];
  targetAudience: string[];
  useCases: string[];
  collectedAt: string;
}

export interface PricingPlanEvidence {
  name: string;
  monthlyPrice: string | null;
  annualPrice: string | null;
  currency: string | null;
  billingPeriod: string | null;
  features: string[];
  sourceUrl: string;
  collectedAt: string;
}

export interface OfficialPromotionEvidence {
  title: string | null;
  content: string;
  targetAudience: string[];
  useCases: string[];
  sellingPoints: string[];
  sourceUrl: string;
  collectedAt: string;
}

export interface SearchPageResult {
  status: "completed" | "partial" | "blocked";
  reason: string | null;
  reasonCode?: string;
  candidates: Candidate[];
}

export interface DetailPageResult {
  status: "completed" | "partial" | "blocked";
  reason: string | null;
  item: CollectedItem | null;
  comments: Comment[];
}

export interface DetailSupplementalEvidence {
  youtubeCaptions?: {
    captionTrackUrl: string | null;
    captionLanguage: string | null;
    captionText: string | null;
    reason: string | null;
    collectedAt: string;
  } | null;
}

export interface CollectionBrowser {
  collectWebsite(input: ValidatedInput, screenshotPath: string): Promise<WebsiteEvidence>;
  search(platform: Platform, query: string, input: ValidatedInput): Promise<SearchPageResult>;
  collectDetail(platform: Platform, candidate: Candidate, input: ValidatedInput): Promise<DetailPageResult>;
  collectDetailSupplement(platform: Platform, candidate: Candidate, input: ValidatedInput): Promise<DetailSupplementalEvidence | null>;
  close(): Promise<void>;
}

interface PlaywrightCollectorOptions {
  sessionName: string;
  runDirectory: string;
  browserConfig: BrowserConfig;
  allowedHosts: string[];
}

export class PlaywrightCollector implements CollectionBrowser {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private ownsBrowser = false;
  private ownsPage = false;
  private readonly actionsLogPath: string;

  constructor(private readonly options: PlaywrightCollectorOptions) {
    this.actionsLogPath = path.join(options.runDirectory, "actions.jsonl");
  }

  async collectWebsite(input: ValidatedInput, screenshotPath: string): Promise<WebsiteEvidence> {
    const origin = new URL(input.officialWebsite).origin;
    const httpEvidence = await collectOfficialWebsiteByHttp(input.officialWebsite, origin);
    const visitedUrls: string[] = [];
    const sections: string[] = [];
    const officialPages: OfficialWebsitePageEvidence[] = [...httpEvidence.officialPages];
    for (const evidence of officialPages) {
      visitedUrls.push(evidence.url);
      sections.push(formatOfficialPageEvidence(evidence));
    }
    await this.log("website_http_collect", {
      origin,
      pageCount: httpEvidence.officialPages.length,
      pricingPlanCount: httpEvidence.pricingPlans.length,
      promotionCount: httpEvidence.officialPromotions.length
    });

    const page = await this.getPage(new URL(input.officialWebsite).hostname);
    await this.navigate(page, input.officialWebsite);
    await this.settle(page, httpEvidence.officialPages.length ? 250 : 750);
    await this.capture(page, screenshotPath);
    const dynamicHomeEvidence = await this.officialPageEvidence(page, "/", true);
    mergeOfficialPageEvidence(officialPages, dynamicHomeEvidence);
    mergeUnique(visitedUrls, page.url());
    sections.push(formatOfficialPageEvidence(dynamicHomeEvidence));

    const candidates = officialPages.length >= 4 ? [] : await this.discoverOfficialPages(page, origin);
    for (const candidate of candidates.filter((candidate) => !officialPages.some((pageEvidence) => canonicalPageUrl(pageEvidence.url) === canonicalPageUrl(candidate.url))).slice(0, 7)) {
      await this.navigate(page, candidate.url);
      await this.settle(page, 250);
      mergeUnique(visitedUrls, page.url());
      const evidence = await this.officialPageEvidence(page, candidate.label, false);
      mergeOfficialPageEvidence(officialPages, evidence);
      sections.push(formatOfficialPageEvidence(evidence));
    }
    const pricingPlans = httpEvidence.pricingPlans.length ? httpEvidence.pricingPlans : extractPricingPlans(officialPages, origin);
    const officialPromotions = officialPages.map((pageEvidence) => ({
      title: pageEvidence.title,
      content: pageEvidence.textSnippet,
      targetAudience: pageEvidence.targetAudience,
      useCases: pageEvidence.useCases,
      sellingPoints: pageEvidence.sellingPoints,
      sourceUrl: pageEvidence.url,
      collectedAt: pageEvidence.collectedAt
    })).filter((promotion) => promotion.content || promotion.sellingPoints.length);
    return {
      rawPageText: sections.join("\n\n--- PAGE ---\n\n").slice(0, 120_000),
      screenshotPath,
      visitedUrls: uniqueValues(visitedUrls),
      officialPages,
      pricingPlans,
      officialPromotions: officialPromotions.length ? officialPromotions : httpEvidence.officialPromotions
    };
  }

  private async officialPageEvidence(page: Page, label: string, isHome: boolean): Promise<OfficialWebsitePageEvidence> {
    const title = await page.title().catch(() => null);
    const description = await attr(page.locator('meta[name="description"]').first(), "content")
      ?? await attr(page.locator('meta[property="og:description"]').first(), "content");
    const bodyText = await page.locator("body").innerText({ timeout: 10_000 }).catch(() => "");
    const textSnippet = compactText([description, ...splitSentences(bodyText, 80)].filter(Boolean).join(" "), 8_000);
    return {
      url: page.url(),
      label: isHome ? "/" : label,
      title: title || null,
      description: description || null,
      textSnippet,
      sellingPoints: inferSellingPoints(bodyText),
      targetAudience: inferAudience(bodyText),
      useCases: inferUseCases(bodyText),
      collectedAt: new Date().toISOString()
    };
  }

  private async discoverOfficialPages(page: Page, origin: string): Promise<OfficialPageCandidate[]> {
    const homeLinks = await page.locator("a[href]").evaluateAll((anchors) => anchors.map((anchor) => ({
      href: anchor.getAttribute("href") ?? "",
      text: (anchor.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80)
    }))).catch(() => []);
    const linkCandidates = homeLinks.flatMap(({ href, text }) => {
      const url = normalizeOfficialLink(origin, href);
      if (!url) return [];
      const score = officialLinkScore(url, text);
      return score > 0 ? [{ url, label: linkLabel(origin, url, text), score }] : [];
    });
    return uniquePageCandidates([
      { url: new URL("/", origin).toString(), label: "/", score: 100, isHome: true },
      ...linkCandidates,
      ...fallbackPromotionPaths.map((pathname, index) => ({ url: new URL(pathname, origin).toString(), label: pathname, score: 30 - index }))
    ]).slice(0, 8);
  }

  async search(platform: Platform, query: string, input: ValidatedInput): Promise<SearchPageResult> {
    const candidateLimit = input.maxItemsPerPlatform * 3;
    if (platform === "youtube") {
      try {
        const candidates = await collectYouTubeCandidatesByPrdPython(query, candidateLimit);
        await this.log("extract_search_results", { platform, query, source: "youtube_prd_python", candidateCount: candidates.length });
        return { status: "completed", reason: null, candidates: candidates.slice(0, candidateLimit) };
      } catch (error) {
        await this.log("extract_search_results_failed", { platform, query, source: "youtube_prd_python", error: String(error) });
        return { status: "partial", reason: `YouTube PRD Python search failed: ${String(error)}`, candidates: [] };
      }
    }
    const page = await this.getPage(platformHost(platform));
    if (platform === "reddit") {
      const url = searchUrl(platform, query);
      await this.navigate(page, url);
      await this.settle(page, 500);
      await page.locator('a[href*="/comments/"]').first().waitFor({ state: "attached", timeout: 8_000 }).catch(() => undefined);
      const candidates = await this.extractRedditCandidates(page, query, candidateLimit);
      if (candidates.length) {
        await this.log("extract_search_results", { platform, query, source: "reddit_dom_post_links", candidateCount: candidates.length });
        return { status: "completed", reason: null, candidates: candidates.slice(0, candidateLimit) };
      }
      const diagnosis = await diagnoseRedditPage(page);
      const reasonCode = redditReasonCode(diagnosis);
      const reason = redditReasonFromCode(reasonCode);
      await this.log("reddit_page_diagnosis", { platform, query, reasonCode, ...diagnosis, bodyPreview: diagnosis.bodyPreview.slice(0, 300) });
      await this.log("extract_search_results", { platform, query, source: "reddit_dom_post_links", candidateCount: 0, reasonCode });
      return { status: reasonCode === "REDDIT_BLOCKED" || reasonCode === "REDDIT_LOGIN_REQUIRED" ? "blocked" : "partial", reason, reasonCode, candidates: [] };
    }
    const tiktokSearchCapture = platform === "tiktok" ? attachTikTokSearchCapture(page, query) : null;
    const url = searchUrl(platform, query);
    try {
      await this.navigate(page, url);
      await this.settle(page, 2_000);
      const restriction = await restrictionReason(page);
      if (restriction) return { status: "blocked", reason: restriction, candidates: [] };
      await this.loadSearchResults(page, platform, candidateLimit);

      const apiCandidates = tiktokSearchCapture?.candidates() ?? [];
      const candidates = apiCandidates.length
          ? apiCandidates
          : await this.extractTikTokCandidates(page, query);
      const source = platform === "tiktok"
          ? apiCandidates.length ? "tiktok_search_response" : "tiktok_dom_fallback"
          : "playwright_dom";
      await this.log("extract_search_results", {
        platform,
        query,
        candidateCount: candidates.length,
        source,
        tiktokSearchResponseCount: tiktokSearchCapture?.responseCount()
      });
      return { status: "completed", reason: null, candidates: candidates.slice(0, candidateLimit) };
    } finally {
      tiktokSearchCapture?.dispose();
    }
  }

  private async loadSearchResults(page: Page, platform: Platform, candidateLimit: number): Promise<void> {
    const selector = platform === "youtube" ? "ytd-video-renderer" : platform === "reddit" ? "shreddit-post" : 'a[href*="/video/"]';
    const results = page.locator(selector);
    let previous = -1;
    let unchanged = 0;
    for (let scroll = 0; scroll < 5; scroll += 1) {
      const count = await results.count();
      unchanged = count === previous ? unchanged + 1 : 0;
      if (count >= candidateLimit || unchanged >= 3) break;
      previous = count;
      await page.mouse.wheel(0, 1_200);
      await page.waitForTimeout(800);
      await this.log("scroll_search_results", { platform, scroll: scroll + 1, visibleCount: count });
    }
  }

  async collectDetail(platform: Platform, candidate: Candidate, input: ValidatedInput): Promise<DetailPageResult> {
    if (platform === "youtube") return this.collectYouTubeDetailByHttp(candidate, input.maxCommentsPerItem);
    const page = await this.getPage(platformHost(platform));
    const tiktokCommentCapture = platform === "tiktok" ? attachTikTokCommentCapture(page) : null;
    try {
      await this.navigate(page, candidate.sourceUrl);
      await this.settle(page, 2_000);
      const restriction = await restrictionReason(page);
      if (restriction) return { status: "blocked", reason: restriction, item: null, comments: [] };
      const item = platform === "reddit"
        ? await this.extractRedditDetail(page, candidate)
        : await this.extractTikTokDetail(page, candidate);
      const comments = await this.extractComments(page, platform, candidate, tiktokCommentCapture);
      await this.log("extract_detail", { platform, externalId: candidate.externalId, commentCandidateCount: comments.length, tiktokCommentResponseCount: tiktokCommentCapture?.responseCount() });
      return { status: "completed", reason: null, item, comments };
    } finally {
      tiktokCommentCapture?.dispose();
    }
  }

  async collectDetailSupplement(platform: Platform, candidate: Candidate, _input: ValidatedInput): Promise<DetailSupplementalEvidence | null> {
    if (platform !== "youtube") return null;
    try {
      const page = await this.getPage(platformHost(platform));
      const captionCapture = attachYouTubeCaptionNetworkCapture(page);
      try {
        await this.navigate(page, candidate.sourceUrl);
        await this.settle(page, 1_000);
        const restriction = await restrictionReason(page);
        if (restriction) {
          await this.log("youtube_caption_extract", { platform, externalId: candidate.externalId, status: "blocked", reason: restriction });
          return {
            youtubeCaptions: {
              captionTrackUrl: null,
              captionLanguage: null,
              captionText: null,
              reason: restriction,
              collectedAt: new Date().toISOString()
            }
          };
        }
        const evidence = await this.collectYouTubeCaptionEvidenceFromNetwork(page, candidate, captionCapture);
        await this.log("youtube_caption_extract", {
          platform,
          externalId: candidate.externalId,
          captionTrackUrl: evidence.youtubeCaptions?.captionTrackUrl ?? null,
          captionLanguage: evidence.youtubeCaptions?.captionLanguage ?? null,
          captionTextLength: evidence.youtubeCaptions?.captionText?.length ?? 0,
          reason: evidence.youtubeCaptions?.reason ?? null
        });
        return evidence;
      } finally {
        captionCapture.dispose();
      }
    } catch (error) {
      await this.log("youtube_caption_extract", { platform, externalId: candidate.externalId, status: "partial", reason: String(error) });
      return {
        youtubeCaptions: {
          captionTrackUrl: null,
          captionLanguage: null,
          captionText: null,
          reason: `Caption extraction failed: ${String(error)}`,
          collectedAt: new Date().toISOString()
        }
      };
    }
  }

  private async collectYouTubeCaptionEvidenceFromNetwork(page: Page, _candidate: Candidate, captionCapture: CaptionNetworkCapture): Promise<DetailSupplementalEvidence> {
    const captionResponse = await waitForYouTubeCaptionResponse(page, captionCapture, 6_000);
    if (!captionResponse) {
      return {
        youtubeCaptions: {
          captionTrackUrl: null,
          captionLanguage: null,
          captionText: null,
          reason: "No public subtitle network response was observed on the video page",
          collectedAt: new Date().toISOString()
        }
      };
    }
    const captionText = captionResponse.bodyText ? parseCaptionBodyText(captionResponse.bodyText) : "";
    return {
      youtubeCaptions: {
        captionTrackUrl: captionResponse.url,
        captionLanguage: captionResponse.languageCode,
        captionText: captionText || null,
        reason: captionText ? null : "A subtitle network response was observed but returned no readable subtitle text",
        collectedAt: new Date().toISOString()
      }
    };
  }

  private async collectYouTubeDetailByHttp(candidate: Candidate, maxComments: number): Promise<DetailPageResult> {
    let status: "completed" | "partial" | "blocked" = "completed";
    let reason: string | null = null;
    let item: CollectedItem | null = null;
    let comments: Comment[] = [];
    try {
      const detail = await collectYouTubeDetailAndCommentsByPrdPython(candidate, maxComments);
      item = detail.item;
      comments = detail.comments;
      if (detail.reason && !isNoPublicCommentsReason(detail.reason)) {
        status = "partial";
        reason = detail.reason;
      }
    } catch (error) {
      status = "partial";
      reason = `YouTube PRD Python detail extraction failed: ${String(error)}`;
      item = itemBase("youtube", candidate, {
        title: candidate.title || null,
        author: candidate.author,
        publishedAt: candidate.publishedAt,
        description: candidate.snippet,
        viewCount: candidate.viewCount,
        likeCount: candidate.likeCount,
        commentCount: candidate.commentCount,
        duration: candidate.duration,
        thumbnailUrl: candidate.thumbnailUrl
      });
    }

    await this.log("extract_detail", { platform: "youtube", externalId: candidate.externalId, source: "youtube_prd_python", commentCandidateCount: comments.length, status, reason });
    return { status, reason, item, comments };
  }

  async close(): Promise<void> {
    if (this.ownsPage && this.page && !this.page.isClosed()) await this.page.close().catch(() => undefined);
    if (this.ownsBrowser && this.browser) await this.browser.close().catch(() => undefined);
    this.page = undefined;
    this.context = undefined;
    this.browser = undefined;
  }

  private async getPage(targetHost: string): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    const config = this.options.browserConfig;
    if (config.mode === "existing") {
      const endpoint = await resolveCdpEndpoint(config);
      this.browser = await chromium.connectOverCDP(endpoint, { timeout: 30_000 });
      this.context = this.browser.contexts()[0];
      if (!this.context) throw new Error("Connected browser has no usable context");
      if (config.reuseOpenPages) {
        this.page = this.context.pages().find((page) => hostMatches(page.url(), targetHost));
      }
      if (!this.page) {
        this.page = await this.context.newPage();
        this.ownsPage = true;
      }
    } else {
      this.browser = await chromium.launch({ headless: true });
      this.ownsBrowser = true;
      this.context = await this.browser.newContext({ locale: "en-US" });
      this.page = await this.context.newPage();
      this.ownsPage = true;
    }
    this.page.setDefaultTimeout(15_000);
    this.page.setDefaultNavigationTimeout(30_000);
    await this.installEvaluateCompatibilityHelper(this.page);
    await this.log("browser_session_ready", { sessionName: this.options.sessionName, mode: config.mode, targetHost, reusedPage: !this.ownsPage });
    return this.page;
  }

  private async installEvaluateCompatibilityHelper(page: Page): Promise<void> {
    const script = "globalThis.__name = globalThis.__name || ((target) => target)";
    await page.addInitScript(script).catch(() => undefined);
    await page.evaluate(script).catch(() => undefined);
  }

  private async navigate(page: Page, url: string): Promise<void> {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol) || !this.options.allowedHosts.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) {
      throw new Error(`Navigation denied outside allowed domains: ${parsed.hostname}`);
    }
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await this.log("open", { url: page.url() });
  }

  private async settle(page: Page, extraWait = 750): Promise<void> {
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    if (extraWait > 0) await page.waitForTimeout(extraWait);
  }

  private async capture(page: Page, screenshotPath: string): Promise<void> {
    await ensureDir(path.dirname(screenshotPath));
    await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" });
    await this.log("screenshot", { path: screenshotPath, url: page.url() });
  }

  private async pageEvidence(page: Page): Promise<string> {
    const title = await page.title().catch(() => "");
    const text = await page.locator("body").innerText({ timeout: 10_000 }).catch(() => "");
    return `URL: ${page.url()}\nTITLE: ${title}\nVISIBLE TEXT:\n${text.slice(0, 40_000)}`;
  }

  private async extractYouTubeCandidates(page: Page, query: string): Promise<Candidate[]> {
    const rows = page.locator("ytd-video-renderer");
    const count = Math.min(await rows.count(), 30);
    const output: Candidate[] = [];
    for (let index = 0; index < count; index += 1) {
      const row = rows.nth(index);
      const link = row.locator("a#video-title").first();
      const href = await attr(link, "href");
      const externalId = href ? new URL(href, "https://www.youtube.com").searchParams.get("v") : null;
      if (!href || !externalId) continue;
      const metadata = await texts(row.locator("#metadata-line span"));
      const thumbnail = await attr(row.locator("img").first(), "src");
      output.push(makeCandidate({ platform: "youtube", externalId, title: await text(link) ?? "", author: await text(row.locator("#channel-name").first()), publishedAt: parseVisibleDate(metadata[1]), visibleEngagement: metadata.join(" | ") || null, viewCount: parseCount(metadata[0]), likeCount: null, commentCount: null, duration: await text(row.locator("ytd-thumbnail-overlay-time-status-renderer").first()), snippet: await text(row.locator("#description-text").first()), sourceUrl: new URL(href, "https://www.youtube.com").toString(), thumbnailUrl: httpUrlOrNull(thumbnail), matchedQuery: query, searchPosition: index + 1 }));
    }
    return output;
  }

  private async extractRedditCandidates(page: Page, query: string, limit = 15): Promise<Candidate[]> {
    const posts = new Map<string, RedditPostCandidate>();
    for (const post of await extractRedditPostsFromDom(page, limit)) posts.set(post.id, post);
    for (let round = 0; round < 3 && posts.size < limit; round += 1) {
      await page.evaluate(() => {
        window.scrollBy(0, Math.max(window.innerHeight * 0.8, 700));
      });
      await page.waitForTimeout(800);
      for (const post of await extractRedditPostsFromDom(page, limit)) posts.set(post.id, post);
      await this.log("scroll_search_results", { platform: "reddit", scroll: round + 1, visibleCount: posts.size });
    }
    return [...posts.values()].slice(0, limit).map((post, index) => makeCandidate({
      platform: "reddit",
      externalId: post.id,
      title: post.title,
      author: post.author ?? null,
      publishedAt: post.publishedAt ?? null,
      visibleEngagement: [
        post.score !== undefined ? `${post.score} score` : null,
        post.commentCount !== undefined ? `${post.commentCount} comments` : null,
        post.subreddit ? `r/${post.subreddit}` : null,
        `extractor:${post.sourceExtractor}`
      ].filter(Boolean).join(" | ") || null,
      viewCount: null,
      likeCount: post.score ?? null,
      score: post.score ?? null,
      commentCount: post.commentCount ?? null,
      duration: null,
      snippet: post.snippet ?? null,
      sourceUrl: post.permalink,
      thumbnailUrl: httpUrlOrNull(post.thumbnailUrl ?? null),
      matchedQuery: query,
      searchPosition: index + 1
    }));
  }

  private async extractTikTokCandidates(page: Page, query: string): Promise<Candidate[]> {
    const links = page.locator('a[href*="/video/"]');
    const count = Math.min(await links.count(), 80);
    const output: Candidate[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < count && output.length < 30; index += 1) {
      const link = links.nth(index);
      const href = await attr(link, "href");
      const externalId = href ? /\/video\/(\d+)/.exec(href)?.[1] : undefined;
      if (!href || !externalId || seen.has(externalId)) continue;
      seen.add(externalId);
      const card = link.locator('xpath=ancestor::*[@data-e2e="search-card-video-container"][1]');
      const scope = await card.count() ? card : link.locator("..");
      const raw = await text(scope);
      const image = link.locator("img").first();
      const author = /\/@([^/]+)\/video\//.exec(href)?.[1] ?? null;
      output.push(makeCandidate({ platform: "tiktok", externalId, title: (await attr(image, "alt")) ?? firstUsefulLine(raw) ?? "", author, publishedAt: parseVisibleDate(raw), visibleEngagement: raw || null, viewCount: parseMetric(raw, /([\d.,]+\s*[KMB]?)\s*(?:views?|播放)/i), likeCount: parseMetric(raw, /([\d.,]+\s*[KMB]?)\s*(?:likes?|点赞)/i), commentCount: parseMetric(raw, /([\d.,]+\s*[KMB]?)\s*(?:comments?|评论)/i), duration: null, snippet: raw || null, sourceUrl: new URL(href, "https://www.tiktok.com").toString(), thumbnailUrl: httpUrlOrNull(await attr(image, "src")), matchedQuery: query, searchPosition: output.length + 1 }));
    }
    return output;
  }

  private async extractYouTubeDetail(page: Page, candidate: Candidate): Promise<CollectedItem> {
    const description = await text(page.locator("#description-inline-expander").first());
    return itemBase("youtube", candidate, { title: await text(page.locator("h1 yt-formatted-string").first()) || candidate.title, author: await text(page.locator("#owner #channel-name").first()) || candidate.author, description: description || null, viewCount: parseCount(await text(page.locator("#info span").first())), likeCount: parseCount(await attr(page.locator('like-button-view-model button').first(), "aria-label")), commentCount: parseCount(await text(page.locator("#count").first())), duration: candidate.duration, tags: hashtags(description ?? ""), relatedLinks: await publicLinks(page.locator("#description-inline-expander a[href]")) });
  }

  private async extractRedditDetail(page: Page, candidate: Candidate): Promise<CollectedItem> {
    const post = page.locator('shreddit-post, article, [data-testid="post-container"], faceplate-tracker').first();
    const pageText = await text(post) ?? await text(page.locator("body"));
    const title = await attr(post, "post-title")
      ?? await text(page.locator("h1,h2").first())
      ?? candidate.title;
    const body = await text(post.locator('[slot="text-body"], .md, [data-testid="post-content"], p').first())
      ?? (pageText && pageText !== title ? compactText(pageText, 3_000) : null);
    const subreddit = await attr(post, "subreddit-prefixed-name")
      ?? /\/r\/([^/]+)\//i.exec(candidate.sourceUrl)?.[1]?.replace(/^/, "r/")
      ?? null;
    return itemBase("reddit", candidate, {
      title,
      author: await attr(post, "author") ?? candidate.author,
      publishedAt: await attr(post, "created-timestamp") ?? await attr(page.locator("time").first(), "datetime") ?? candidate.publishedAt,
      description: null,
      body,
      postScore: parseCount(await attr(post, "score")) ?? parseMetric(pageText ?? "", /(\d+(?:[.,]\d+)?\s*[KMB]?)\s*(?:upvotes?|points?|score)/i),
      commentCount: parseCount(await attr(post, "comment-count")) ?? candidate.commentCount,
      subreddit,
      flair: await attr(post, "post-flair-text"),
      relatedLinks: await publicLinks(post.locator("a[href]"))
    });
  }

  private async extractTikTokDetail(page: Page, candidate: Candidate): Promise<CollectedItem> {
    const activeVideo = page.locator('[data-e2e="feed-video"]').first();
    const visibleDetailText = await text(activeVideo) ?? await text(page.locator("body"));
    const description = await text(page.locator('[data-e2e="browse-video-desc"], [data-e2e="video-desc"]').first()) || candidate.snippet;
    const author = await text(page.locator('[data-e2e="browse-username"], [data-e2e="video-author-uniqueid"]').first()) || firstUsefulLine(visibleDetailText) || candidate.author;
    return itemBase("tiktok", candidate, {
      title: description || candidate.title,
      author,
      publishedAt: parseVisibleDate(visibleDetailText) ?? candidate.publishedAt,
      description: description || null,
      likeCount: parseCount(await text(page.locator('[data-e2e="browse-like-count"], [data-e2e="like-count"]').first())) ?? candidate.likeCount,
      commentCount: parseCount(await text(page.locator('[data-e2e="browse-comment-count"], [data-e2e="comment-count"]').first())) ?? candidate.commentCount,
      shareCount: parseCount(await text(page.locator('[data-e2e="browse-share-count"], [data-e2e="share-count"]').first())) ?? candidate.shareCount ?? null,
      tags: hashtags(description ?? ""),
      thumbnailUrl: candidate.thumbnailUrl
    });
  }

  private async extractComments(page: Page, platform: Platform, candidate: Candidate, tiktokCommentCapture: TikTokCommentCapture | null = null): Promise<Comment[]> {
    if (platform === "tiktok") {
      const openedComments = await clickFirstVisible(page.locator('button:has-text("Comments"), [role="tab"]:has-text("Comments"), span:has-text("Comments")'));
      await this.log("open_comments_tab", { platform, externalId: candidate.externalId, openedComments });
      await page.waitForTimeout(800);
    }
    if (platform === "reddit") return this.extractRedditVisibleComments(page, candidate);
    const selector = platform === "youtube" ? "ytd-comment-thread-renderer" : '[data-e2e="comment-item"], [data-e2e="comment-level-1"], [data-e2e="comment-text"]';
    const nodes = page.locator(selector);
    let previousCount = -1;
    let unchanged = 0;
    for (let scroll = 0; scroll < 10; scroll += 1) {
      const count = await nodes.count();
      unchanged = count === previousCount ? unchanged + 1 : 0;
      if (count >= 50 || unchanged >= 3) break;
      previousCount = count;
      await page.mouse.wheel(0, 1_200);
      if (platform === "tiktok") await scrollTikTokCommentPanel(page);
      await page.waitForTimeout(900);
      await this.log("scroll_comments", { platform, externalId: candidate.externalId, scroll: scroll + 1, visibleCount: platform === "tiktok" ? tiktokCommentCapture?.comments().length ?? count : count });
    }
    if (platform === "tiktok") {
      const apiComments = tiktokCommentCapture?.comments() ?? [];
      return apiComments.length ? apiComments.map((comment) => tiktokApiCommentToComment(candidate, comment)) : extractTikTokVisibleComments(page, candidate);
    }
    const count = Math.min(await nodes.count(), 50);
    const comments: Comment[] = [];
    for (let index = 0; index < count; index += 1) {
      const node = nodes.nth(index);
      const extracted = platform === "youtube" ? await youtubeComment(node) : await tiktokComment(node);
      if (!extracted.content) continue;
      comments.push({ commentId: extracted.commentId ?? stableCommentId(platform, candidate.externalId, extracted.author, extracted.content), author: extracted.author, content: extracted.content, publishedAt: extracted.publishedAt, likeCount: extracted.likeCount, replyCount: extracted.replyCount, commentUrl: extracted.commentUrl, parentCommentId: extracted.parentCommentId, sentiment: "neutral", selectedReasons: [], matchedThemes: [], collectedAt: new Date().toISOString() });
    }
    return comments;
  }

  private async extractRedditVisibleComments(page: Page, candidate: Candidate): Promise<Comment[]> {
    const deadline = Date.now() + 8_000;
    const comments = new Map<string, Comment>();
    let unchanged = 0;
    while (Date.now() < deadline && comments.size < 30 && unchanged < 2) {
      const before = comments.size;
      for (const comment of await extractRedditCommentsFromDom(page, candidate, 30)) {
        if (!comments.has(comment.commentId)) comments.set(comment.commentId, comment);
      }
      unchanged = comments.size === before ? unchanged + 1 : 0;
      if (comments.size >= 30 || unchanged >= 2 || Date.now() >= deadline) break;
      await page.evaluate(() => {
        window.scrollBy(0, Math.max(window.innerHeight * 0.8, 700));
      });
      await page.waitForTimeout(700);
      await this.log("scroll_comments", { platform: "reddit", externalId: candidate.externalId, visibleCount: comments.size });
    }
    return [...comments.values()]
      .sort((left, right) => redditCommentHeuristic(right) - redditCommentHeuristic(left))
      .slice(0, 30);
  }

  private async log(action: string, data: object): Promise<void> {
    await appendJsonLine(this.actionsLogPath, { at: new Date().toISOString(), engine: "playwright", action, ...data });
  }
}

type JsonRecord = Record<string, unknown>;

interface RedditPostCandidate {
  id: string;
  title: string;
  subreddit?: string;
  permalink: string;
  score?: number;
  commentCount?: number;
  publishedAt?: string;
  sourceExtractor: string;
  author?: string;
  snippet?: string;
  thumbnailUrl?: string;
}

interface RedditPageDiagnosis {
  url: string;
  title: string;
  commentsLinkCount: number;
  blocked: boolean;
  rateLimited: boolean;
  loginRequired: boolean;
  loadError: boolean;
  bodyPreview: string;
}

interface RedditDomComment {
  id: string;
  text: string;
  author?: string;
  score?: number;
  publishedAt?: string;
  parentId?: string;
  depth?: number;
  commentUrl?: string;
}

async function extractRedditPostsFromDom(page: Page, limit = 15): Promise<RedditPostCandidate[]> {
  return page.evaluate((maxCount) => {
    const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
    const parseMetric = (value: string | null | undefined): number | undefined => {
      const raw = clean(value).match(/(\d+(?:[.,]\d+)?\s*[KMB]?)/i)?.[1];
      if (!raw) return undefined;
      const normalized = raw.replace(/,/g, "").toLowerCase();
      const numeric = Number.parseFloat(normalized);
      if (!Number.isFinite(numeric)) return undefined;
      if (normalized.endsWith("k")) return Math.round(numeric * 1_000);
      if (normalized.endsWith("m")) return Math.round(numeric * 1_000_000);
      if (normalized.endsWith("b")) return Math.round(numeric * 1_000_000_000);
      return Math.round(numeric);
    };
    const parsePostUrl = (value: string | null | undefined) => {
      if (!value) return null;
      let url: URL;
      try {
        url = new URL(value, location.origin);
      } catch {
        return null;
      }
      const match = url.pathname.match(/^\/r\/([^/]+)\/comments\/([a-z0-9]+)(?:\/([^/]+))?/i);
      if (!match?.[1] || !match[2]) return null;
      return { subreddit: match[1], id: match[2], permalink: url.href };
    };
    const nearestContainer = (link: Element) =>
      link.closest('[data-testid="search-sdui-post"]') ||
      link.closest('[data-testid="search-post-unit"]') ||
      link.closest('[data-testid="sdui-post-unit"]') ||
      link.closest("search-telemetry-tracker") ||
      link.closest("shreddit-post") ||
      link.closest("article") ||
      link.closest('[data-testid="post-container"]') ||
      link.closest("faceplate-tracker") ||
      link.parentElement;
    const titleFrom = (link: Element, container: Element | null) => {
      const candidates = [
        link.getAttribute("aria-label"),
        link.querySelector("h1,h2,h3")?.textContent,
        container?.querySelector('[data-testid="post-title-text"]')?.textContent,
        container?.querySelector('[data-testid="post-title"]')?.getAttribute("aria-label"),
        container?.querySelector("h1,h2,h3")?.textContent,
        link.textContent
      ].map(clean).filter(Boolean);
      return candidates.sort((a, b) => b.length - a.length)[0] || "";
    };
    const postFromLink = (link: HTMLAnchorElement, sourceExtractor: string): RedditPostCandidate | null => {
      const href = link.getAttribute("href");
      const parsed = parsePostUrl(href);
      if (!parsed) return null;
      const container = nearestContainer(link);
      const title = titleFrom(link, container);
      if (title.length < 8 || /^\d+\s*(comments?|replies?|votes?)$/i.test(title)) return null;
      const containerText = clean(container?.textContent);
      const image = container?.querySelector<HTMLImageElement>("img");
      const authorLink = container?.querySelector<HTMLAnchorElement>('a[href^="/user/"], a[href*="/user/"]');
      const commentMetric = Array.from(container?.querySelectorAll<HTMLAnchorElement>('a[href*="/comments/"]') ?? [])
        .map((anchor) => clean(anchor.textContent))
        .find((value) => /\b(comments?|replies?)\b/i.test(value));
      const scoreMetric = containerText.match(/(\d+(?:[.,]\d+)?\s*[KMB]?)\s*(votes?|upvotes?|points?|score)/i)?.[0];
      return {
        id: parsed.id,
        subreddit: parsed.subreddit,
        title,
        permalink: parsed.permalink,
        score: parseMetric(scoreMetric),
        commentCount: parseMetric(commentMetric),
        publishedAt: container?.querySelector("time")?.getAttribute("datetime") || undefined,
        sourceExtractor,
        author: clean(authorLink?.textContent).replace(/^u\//i, "") || undefined,
        snippet: containerText && containerText !== title ? containerText.slice(0, 800) : undefined,
        thumbnailUrl: image?.src || undefined
      };
    };
    const extractByCommentPermalinks = () =>
      Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/comments/"]'))
        .map((link) => postFromLink(link, "comment_permalink"))
        .filter((value): value is RedditPostCandidate => Boolean(value));
    const extractBySemanticAttributes = () =>
      Array.from(document.querySelectorAll<HTMLAnchorElement>('a[aria-label][href*="/comments/"], a[data-testid*="title"][href*="/comments/"]'))
        .map((link) => postFromLink(link, "semantic_attributes"))
        .filter((value): value is RedditPostCandidate => Boolean(value));
    const extractByCurrentRedditComponent = () =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-testid="search-sdui-post"], [data-testid="search-post-unit"], [data-testid="sdui-post-unit"], search-telemetry-tracker[data-thingid^="t3_"]'))
        .flatMap((container) => Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href*="/comments/"]')).map((link) => postFromLink(link, "current_reddit_component")))
        .filter((value): value is RedditPostCandidate => Boolean(value));
    const extractByEmbeddedPageData = () => {
      const output: RedditPostCandidate[] = [];
      const text = document.documentElement.innerHTML.slice(0, 2_000_000);
      const pattern = new RegExp('"permalink"\\\\s*:\\\\s*"([^"]*/r/[^"]+/comments/[^"]+)"', "gi");
      for (const match of text.matchAll(pattern)) {
        const raw = match[1]?.replace(/\\u0026/g, "&").replace(/\\\//g, "/");
        const parsed = parsePostUrl(raw);
        if (!parsed) continue;
        output.push({
          ...parsed,
          title: parsed.permalink.split("/comments/")[1]?.split("/")[1]?.replace(/_/g, " ").slice(0, 200) || parsed.id,
          sourceExtractor: "embedded_page_data"
        });
        if (output.length >= maxCount) break;
      }
      return output;
    };
    const results = new Map<string, RedditPostCandidate>();
    for (const post of [
      ...extractByCommentPermalinks(),
      ...extractBySemanticAttributes(),
      ...extractByCurrentRedditComponent(),
      ...extractByEmbeddedPageData()
    ]) {
      const key = post.id || post.permalink.replace(/[?#].*$/, "");
      const current = results.get(key);
      if (!current || post.title.length > current.title.length) results.set(key, post);
      if (results.size >= maxCount) break;
    }
    return Array.from(results.values());
  }, limit);
}

async function diagnoseRedditPage(page: Page): Promise<RedditPageDiagnosis> {
  return page.evaluate(() => {
    const text = document.body?.innerText?.slice(0, 2_000) || "";
    const lower = text.toLowerCase();
    return {
      url: location.href,
      title: document.title,
      commentsLinkCount: document.querySelectorAll('a[href*="/comments/"]').length,
      blocked: lower.includes("you've been blocked") || lower.includes("whoa there"),
      rateLimited: lower.includes("too many requests"),
      loginRequired: lower.includes("log in to continue"),
      loadError: lower.includes("something went wrong") || lower.includes("server error"),
      bodyPreview: text.slice(0, 500)
    };
  });
}

async function extractRedditCommentsFromDom(page: Page, candidate: Candidate, limit = 30): Promise<Comment[]> {
  const rows = await page.evaluate(({ maxCount, sourceUrl }) => {
    const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
    const parseMetricText = (value: string) => {
      const match = value.match(/(\d+(?:[.,]\d+)?\s*[KMB]?)\s*(upvotes?|points?|score|likes?)/i);
      return match?.[1] ?? null;
    };
    const metricToNumber = (value: string | null | undefined) => {
      const raw = clean(value);
      if (!raw) return undefined;
      const normalized = raw.replace(/,/g, "").toLowerCase();
      const number = Number.parseFloat(normalized);
      if (!Number.isFinite(number)) return undefined;
      if (normalized.endsWith("k")) return Math.round(number * 1_000);
      if (normalized.endsWith("m")) return Math.round(number * 1_000_000);
      if (normalized.endsWith("b")) return Math.round(number * 1_000_000_000);
      return Math.round(number);
    };
    const commentUrlFromNode = (node: Element) => {
      const link = node.querySelector<HTMLAnchorElement>('a[href*="/comments/"][href*="comment"]')
        ?? node.querySelector<HTMLAnchorElement>('a[href*="/comments/"]');
      if (!link?.href) return null;
      try {
        return new URL(link.href, location.origin).href;
      } catch {
        return null;
      }
    };
    const depthFromNode = (node: Element) => {
      const label = node.closest('details[role="article"]')?.getAttribute("aria-label") || "";
      const match = label.match(/level\s+(\d+)/i);
      return match?.[1] ? Number(match[1]) : undefined;
    };
    const nodes = Array.from(document.querySelectorAll<Element>('shreddit-comment, details[role="article"], article, [data-testid="comment"]'));
    const output: RedditDomComment[] = [];
    const seen = new Set<string>();
    for (const node of nodes) {
      const content = clean(
        node.querySelector('[slot="comment"]')?.textContent ||
        node.querySelector('[data-testid="comment"]')?.textContent ||
        node.querySelector(".md")?.textContent ||
        Array.from(node.querySelectorAll("p")).map((p) => p.textContent).join(" ")
      );
      if (content.length < 8 || /^(reply|share|award|upvote|downvote)$/i.test(content)) continue;
      const key = content.slice(0, 240);
      if (seen.has(key)) continue;
      seen.add(key);
      const author = clean(node.getAttribute("author") || node.querySelector('a[href^="/user/"], a[href*="/user/"]')?.textContent).replace(/^u\//i, "") || null;
      const publishedAt = node.getAttribute("created-timestamp") || node.querySelector("time")?.getAttribute("datetime") || null;
      const nodeText = clean(node.textContent);
      const thingId = clean(node.getAttribute("thingid")).replace(/^t1_/, "");
      output.push({
        id: thingId || "",
        text: content,
        author: author || undefined,
        publishedAt: publishedAt || undefined,
        score: metricToNumber(clean(node.getAttribute("score")) || parseMetricText(nodeText)),
        commentUrl: commentUrlFromNode(node) || sourceUrl,
        parentId: clean(node.getAttribute("parentid")).replace(/^t1_/, "") || undefined,
        depth: depthFromNode(node)
      });
      if (output.length >= maxCount) break;
    }
    return output;
  }, { maxCount: limit, sourceUrl: candidate.sourceUrl });
  return rows.map((row) => {
    const content = compactText(row.text, 1_200);
    return CommentSchemaLike({
      commentId: row.id || stableCommentId("reddit", candidate.externalId, row.author ?? null, content),
      author: row.author ?? null,
      content,
      publishedAt: row.publishedAt ?? null,
      likeCount: row.score ?? null,
      replyCount: null,
      commentUrl: httpUrlOrNull(row.commentUrl ?? null),
      parentCommentId: row.parentId ?? null,
      sentiment: "neutral" as const,
      selectedReasons: [],
      matchedThemes: row.depth ? [`depth:${row.depth}`] : [],
      collectedAt: new Date().toISOString()
    });
  });
}

function redditCommentHeuristic(comment: Comment): number {
  const content = comment.content.toLowerCase();
  const infoSignals = ["use", "used", "price", "pricing", "cancel", "alternative", "problem", "issue", "better", "worse", "fireflies", "fathom", "granola", "gong", "chorus", "transcript", "meeting"];
  return Math.min(comment.content.length, 800) / 8
    + (comment.likeCount ?? 0) * 2
    + infoSignals.filter((signal) => content.includes(signal)).length * 15;
}

function CommentSchemaLike(comment: Comment): Comment {
  return comment;
}

function redditReasonCode(diagnosis: RedditPageDiagnosis): string {
  if (diagnosis.blocked) return "REDDIT_BLOCKED";
  if (diagnosis.rateLimited) return "REDDIT_RATE_LIMITED";
  if (diagnosis.loginRequired) return "REDDIT_LOGIN_REQUIRED";
  if (diagnosis.loadError) return "REDDIT_LOAD_ERROR";
  return "REDDIT_DOM_NO_CANDIDATES";
}

function redditReasonFromCode(reasonCode: string): string {
  const reasons: Record<string, string> = {
    REDDIT_BLOCKED: "Reddit search page indicated that access was blocked.",
    REDDIT_RATE_LIMITED: "Reddit search page indicated too many requests.",
    REDDIT_LOGIN_REQUIRED: "Reddit search page required login before results could be viewed.",
    REDDIT_LOAD_ERROR: "Reddit search page showed a loading or server error.",
    REDDIT_DOM_NO_CANDIDATES: "Reddit search pages were opened, but no valid post links were extracted from the DOM."
  };
  return reasons[reasonCode] ?? "Reddit search pages were opened, but no valid post links were extracted from the DOM.";
}

interface CaptionNetworkResponse {
  url: string;
  languageCode: string | null;
  bodyText: string;
}

interface CaptionNetworkCapture {
  first(timeoutMs: number): Promise<CaptionNetworkResponse | null>;
  dispose(): void;
}

function attachYouTubeCaptionNetworkCapture(page: Page): CaptionNetworkCapture {
  let settled = false;
  let resolveFirst: (value: CaptionNetworkResponse | null) => void = () => undefined;
  const firstResponse = new Promise<CaptionNetworkResponse | null>((resolve) => {
    resolveFirst = resolve;
  });
  const onResponse = (response: Response) => {
    if (settled || !isYouTubeCaptionResponseUrl(response.url())) return;
    settled = true;
    void response.text()
      .then((bodyText) => resolveFirst({ url: response.url(), languageCode: captionLanguageFromUrl(response.url()), bodyText }))
      .catch(() => resolveFirst({ url: response.url(), languageCode: captionLanguageFromUrl(response.url()), bodyText: "" }));
  };
  page.on("response", onResponse);
  return {
    first: async (timeoutMs) => Promise.race([
      firstResponse,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
    ]),
    dispose: () => page.off("response", onResponse)
  };
}

async function waitForYouTubeCaptionResponse(page: Page, captionCapture: CaptionNetworkCapture, timeoutMs: number): Promise<CaptionNetworkResponse | null> {
  const existingResponse = await captionCapture.first(500);
  if (existingResponse) return existingResponse;
  await triggerPossibleCaptionNetworkActivity(page);
  return captionCapture.first(timeoutMs);
}

async function triggerPossibleCaptionNetworkActivity(page: Page): Promise<void> {
  const video = page.locator("video").first();
  await video.click({ position: { x: 20, y: 20 }, timeout: 1_500 }).catch(() => undefined);
  await video.hover({ timeout: 1_500 }).catch(() => undefined);

  const subtitleButton = page.locator(
    '.ytp-subtitles-button, button[aria-label*="Captions" i], button[aria-label*="Subtitles" i], button[title*="Captions" i], button[title*="Subtitles" i], button[aria-label*="字幕"]'
  ).filter({ visible: true }).first();
  const buttonState = await subtitleButton.evaluate((element) => ({
    pressed: element.getAttribute("aria-pressed"),
    label: element.getAttribute("aria-label") || element.getAttribute("title") || "",
    className: element.className
  })).catch(() => null);
  const label = buttonState?.label.toLowerCase() ?? "";
  const isEnabled = buttonState?.pressed === "true"
    || /turn off|disable|关闭|隐藏字幕/.test(label)
    || /ytp-subtitles-button-on/.test(String(buttonState?.className ?? ""));
  if (!isEnabled) {
    if (buttonState) {
      const clicked = await subtitleButton.click({ timeout: 1_500 }).then(() => true).catch(() => false);
      if (!clicked) await page.keyboard.press("c").catch(() => undefined);
    } else {
      await page.keyboard.press("c").catch(() => undefined);
    }
  }
  await page.waitForTimeout(1_200).catch(() => undefined);
}

function isYouTubeCaptionResponseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const pathname = url.pathname.toLowerCase();
    return (url.hostname.endsWith("youtube.com") || url.hostname.endsWith("googlevideo.com"))
      && (pathname.includes("/api/timedtext") || pathname.includes("/timedtext"))
      && url.searchParams.has("v");
  } catch {
    return false;
  }
}

function captionLanguageFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.searchParams.get("lang") ?? url.searchParams.get("tlang") ?? null;
  } catch {
    return null;
  }
}

function parseCaptionBodyText(body: string): string {
  const jsonText = parseJson3CaptionText(body);
  if (jsonText) return compactText(jsonText, 30_000);
  return compactText(htmlToVisibleText(body), 30_000);
}

function parseJson3CaptionText(body: string): string {
  try {
    const parsed = JSON.parse(body);
    if (!isRecord(parsed) || !Array.isArray(parsed.events)) return "";
    return parsed.events.map((event) => {
      if (!isRecord(event) || !Array.isArray(event.segs)) return "";
      return event.segs.map((segment) => isRecord(segment) ? cleanVisibleText(segment.utf8, 500) : "").join("");
    }).join(" ");
  } catch {
    return "";
  }
}

async function collectYouTubeCandidatesByPrdPython(query: string, limit: number): Promise<Candidate[]> {
  const payload = await runYouTubePrdScript(["--mode", "search", "--query", query, "--limit", String(limit)]);
  if (payload.status !== "SUCCESS") throw new Error(cleanVisibleText(payload.error, 300) || "YouTube PRD search failed");
  const items = Array.isArray(payload.items) ? payload.items : [];
  return items.flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const externalId = cleanVisibleText(item.externalId, 40);
    const sourceUrl = httpUrlOrNull(cleanVisibleText(item.sourceUrl, 1_000));
    if (!externalId || !sourceUrl) return [];
    return [makeCandidate({
      platform: "youtube",
      externalId,
      title: cleanVisibleText(item.title, 240),
      author: cleanVisibleText(item.author, 160) || null,
      publishedAt: cleanVisibleText(item.publishedAt, 80) || null,
      visibleEngagement: cleanVisibleText(item.visibleEngagement, 300) || null,
      viewCount: finiteInteger(item.viewCount),
      likeCount: finiteInteger(item.likeCount),
      commentCount: finiteInteger(item.commentCount),
      duration: cleanVisibleText(item.duration, 80) || null,
      snippet: cleanVisibleText(item.snippet, 1_000) || null,
      sourceUrl,
      thumbnailUrl: httpUrlOrNull(cleanVisibleText(item.thumbnailUrl, 1_000)),
      matchedQuery: query,
      searchPosition: finiteInteger(item.searchPosition) ?? index + 1
    })];
  });
}

async function collectYouTubeDetailAndCommentsByPrdPython(candidate: Candidate, maxComments: number): Promise<{ item: CollectedItem; comments: Comment[]; reason: string | null }> {
  const payload = await runYouTubePrdScript(["--mode", "detail", "--video-id", candidate.externalId, "--comments-limit", String(maxComments)]);
  if (payload.status !== "SUCCESS" && !isRecord(payload.item)) throw new Error(cleanVisibleText(payload.error, 300) || "YouTube PRD detail failed");
  const rawItem = isRecord(payload.item) ? payload.item : {};
  const item = itemBase("youtube", candidate, {
    title: cleanVisibleText(rawItem.title, 240) || candidate.title || null,
    author: cleanVisibleText(rawItem.author, 160) || candidate.author,
    publishedAt: cleanVisibleText(rawItem.publishedAt, 80) || candidate.publishedAt,
    description: cleanVisibleText(rawItem.description, 8_000) || candidate.snippet,
    viewCount: finiteInteger(rawItem.viewCount) ?? candidate.viewCount,
    likeCount: finiteInteger(rawItem.likeCount) ?? candidate.likeCount,
    commentCount: finiteInteger(rawItem.commentCount) ?? candidate.commentCount,
    duration: cleanVisibleText(rawItem.duration, 80) || candidate.duration,
    tags: arrayOfStrings(rawItem.tags),
    sourceUrl: httpUrlOrNull(cleanVisibleText(rawItem.sourceUrl, 1_000)) ?? candidate.sourceUrl,
    thumbnailUrl: httpUrlOrNull(cleanVisibleText(rawItem.thumbnailUrl, 1_000)) ?? candidate.thumbnailUrl,
    relatedLinks: arrayOfStrings(rawItem.relatedLinks).map((url) => httpUrlOrNull(url)).filter((url): url is string => Boolean(url))
  });
  const rawComments = Array.isArray(payload.comments) ? payload.comments : [];
  const comments = rawComments.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const content = cleanVisibleText(entry.content, 1_200);
    if (!content) return [];
    const rawCommentId = cleanVisibleText(entry.commentId, 160);
    return [{
      commentId: rawCommentId || stableCommentId("youtube", candidate.externalId, cleanVisibleText(entry.author, 160) || null, content),
      author: cleanVisibleText(entry.author, 160) || null,
      content,
      publishedAt: cleanVisibleText(entry.publishedAt, 80) || null,
      likeCount: finiteInteger(entry.likeCount),
      replyCount: finiteInteger(entry.replyCount),
      commentUrl: httpUrlOrNull(cleanVisibleText(entry.commentUrl, 1_000)),
      parentCommentId: cleanVisibleText(entry.parentCommentId, 160) || null,
      sentiment: "neutral" as const,
      selectedReasons: [],
      matchedThemes: [],
      collectedAt: new Date().toISOString()
    }];
  });
  const error = cleanVisibleText(payload.error, 300);
  return { item, comments, reason: error || (comments.length ? null : "YouTube PRD Python returned no public comments") };
}

async function runYouTubePrdScript(args: string[]): Promise<JsonRecord> {
  const scriptPath = path.resolve("scripts", "youtube_community.py");
  const errors: string[] = [];
  for (const attempt of pythonCommandCandidates()) {
    try {
      return await runJsonProcess(attempt.command, [...attempt.prefixArgs, scriptPath, ...args], 75_000);
    } catch (error) {
      errors.push(`${attempt.command}: ${String(error)}`);
    }
  }
  throw new Error(errors.join(" | "));
}

function pythonCommandCandidates(): Array<{ command: string; prefixArgs: string[] }> {
  const configured = process.env.YOUTUBE_PYTHON_BIN || process.env.PYTHON;
  const bundledPython = "C:\\Users\\hi\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";
  return [
    ...(configured ? [{ command: configured, prefixArgs: [] }] : []),
    { command: bundledPython, prefixArgs: [] },
    { command: "python", prefixArgs: [] },
    { command: "py", prefixArgs: ["-3"] },
    { command: "python3", prefixArgs: [] }
  ];
}

function isNoPublicCommentsReason(reason: string): boolean {
  return /returned no public comments/i.test(reason);
}

function runJsonProcess(command: string, args: string[], timeoutMs: number): Promise<JsonRecord> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1"
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(compactText(stderr || stdout || `exit ${code}`, 1_000)));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        if (!isRecord(parsed)) throw new Error("stdout JSON is not an object");
        resolve(parsed);
      } catch (error) {
        reject(new Error(`invalid JSON from Python: ${String(error)}; stderr=${compactText(stderr, 500)}`));
      }
    });
  });
}

function recordAt(value: unknown, pathSegments: string[]): JsonRecord | null {
  let current: unknown = value;
  for (const segment of pathSegments) {
    if (!isRecord(current)) return null;
    current = current[segment];
  }
  return isRecord(current) ? current : null;
}

function valueAt(value: unknown, pathSegments: string[]): unknown {
  let current: unknown = value;
  for (const segment of pathSegments) {
    if (!isRecord(current)) return null;
    current = current[segment];
  }
  return current;
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => cleanVisibleText(item, 120)).filter(Boolean) : [];
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function resolveCdpEndpoint(config: BrowserConfig): Promise<string> {
  if (config.connection === "cdp" && config.cdpEndpoint !== undefined) {
    const value = String(config.cdpEndpoint);
    return /^wss?:\/\//i.test(value) || /^https?:\/\//i.test(value) ? value : `http://127.0.0.1:${value}`;
  }
  for (const port of [9222, 9229, 9333]) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return `http://127.0.0.1:${port}`;
    } catch { /* try next */ }
  }
  throw new Error("No standard CDP browser found; set browser.connection=cdp and cdpEndpoint");
}

function platformHost(platform: Platform): string { return platform === "youtube" ? "youtube.com" : platform === "reddit" ? "reddit.com" : "tiktok.com"; }
function searchUrl(platform: Platform, query: string): string { return platform === "youtube" ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` : platform === "reddit" ? `https://www.reddit.com/search/?q=${encodeURIComponent(query)}&sort=relevance` : `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`; }
function hostMatches(url: string, target: string): boolean { try { const host = new URL(url).hostname; return host === target || host.endsWith(`.${target}`) || target.endsWith(`.${host}`); } catch { return false; } }

interface OfficialPageCandidate { url: string; label: string; score: number; isHome?: boolean; }

const fallbackPromotionPaths = ["/pricing", "/solutions", "/integrations", "/customers", "/case-studies", "/blog", "/resources", "/features"];
const highValuePathKeywords = ["pricing", "solutions", "solution", "integrations", "integration", "customers", "customer", "case-studies", "case-study", "stories", "enterprise", "business", "school", "schools", "education", "learn", "plans", "teams", "sales", "marketing", "resources", "blog", "features", "feature", "product", "use-cases", "use-case", "compare", "demo"];
const lowValuePathKeywords = ["login", "signin", "sign-in", "signup", "sign-up", "privacy", "terms", "security", "careers", "jobs", "contact", "download", "help", "support", "docs", "documentation", "legal"];
const planNames = ["Free", "Basic", "Pro", "Business", "Enterprise"];

async function collectOfficialWebsiteByHttp(officialWebsite: string, origin: string): Promise<{
  officialPages: OfficialWebsitePageEvidence[];
  pricingPlans: PricingPlanEvidence[];
  officialPromotions: OfficialPromotionEvidence[];
}> {
  const pages: OfficialWebsitePageEvidence[] = [];
  const home = await fetchOfficialPageEvidenceWithHtml(officialWebsite, origin, "/").catch(() => null);
  if (home) pages.push(home.evidence);
  const candidates = uniquePageCandidates([
    ...(home ? discoverOfficialLinksFromHtml(home.html, origin) : []),
    ...fallbackPromotionPaths.map((pathname, index) => ({ url: new URL(pathname, origin).toString(), label: pathname, score: 30 - index }))
  ]).slice(0, 8);
  for (const candidate of candidates) {
    if (pages.some((page) => canonicalPageUrl(page.url) === canonicalPageUrl(candidate.url))) continue;
    const evidence = await fetchOfficialPageEvidence(candidate.url, origin, candidate.label).catch(() => null);
    if (!evidence || evidence.textSnippet.length < 80) continue;
    pages.push(evidence);
  }
  const pricingPlans = extractPricingPlans(pages, origin);
  const officialPromotions = pages.map((page) => ({
    title: page.title,
    content: page.textSnippet,
    targetAudience: page.targetAudience,
    useCases: page.useCases,
    sellingPoints: page.sellingPoints,
    sourceUrl: page.url,
    collectedAt: page.collectedAt
  })).filter((promotion) => promotion.content || promotion.sellingPoints.length);
  return { officialPages: pages, pricingPlans, officialPromotions };
}

async function fetchOfficialPageEvidence(url: string, origin: string, label: string): Promise<OfficialWebsitePageEvidence | null> {
  return (await fetchOfficialPageEvidenceWithHtml(url, origin, label))?.evidence ?? null;
}

async function fetchOfficialPageEvidenceWithHtml(url: string, origin: string, label: string): Promise<{ evidence: OfficialWebsitePageEvidence; html: string } | null> {
  const response = await fetch(url, {
    headers: {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) return null;
  const finalUrl = response.url || url;
  if (new URL(finalUrl).origin !== new URL(origin).origin) return null;
  const html = await response.text();
  const title = htmlMetaOrTitle(html, "title");
  const description = htmlMetaOrTitle(html, "description");
  const bodyText = htmlToVisibleText(html);
  const textSnippet = compactText([description, ...splitSentences(bodyText, 100)].filter(Boolean).join(" "), 10_000);
  return {
    html,
    evidence: {
      url: finalUrl,
      label,
      title: title || null,
      description: description || null,
      textSnippet,
      sellingPoints: inferSellingPoints(bodyText),
      targetAudience: inferAudience(bodyText),
      useCases: inferUseCases(bodyText),
      collectedAt: new Date().toISOString()
    }
  };
}

function discoverOfficialLinksFromHtml(textValue: string, origin: string): OfficialPageCandidate[] {
  return [...textValue.matchAll(/href=["']([^"']+)["'][^>]*>([^<]{0,120})/gi)].flatMap((match) => {
    const url = normalizeOfficialLink(origin, decodeHtml(match[1] ?? ""));
    if (!url) return [];
    const label = linkLabel(origin, url, decodeHtml(match[2] ?? ""));
    const score = officialLinkScore(url, label);
    return score > 0 ? [{ url, label, score }] : [];
  });
}

function htmlMetaOrTitle(html: string, name: "title" | "description"): string | null {
  if (name === "title") {
    return decodeHtml(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").trim() || null;
  }
  const patterns = [
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i,
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["'][^>]*>/i
  ];
  for (const pattern of patterns) {
    const value = decodeHtml(pattern.exec(html)?.[1] ?? "").trim();
    if (value) return value;
  }
  return null;
}

function htmlToVisibleText(html: string): string {
  return decodeHtml(html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " "))
    .trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function mergeOfficialPageEvidence(pages: OfficialWebsitePageEvidence[], incoming: OfficialWebsitePageEvidence): void {
  const index = pages.findIndex((page) => canonicalPageUrl(page.url) === canonicalPageUrl(incoming.url));
  if (index < 0) {
    pages.push(incoming);
    return;
  }
  const existing = pages[index];
  if (!existing || incoming.textSnippet.length > existing.textSnippet.length) {
    pages[index] = {
      ...incoming,
      sellingPoints: uniqueValues([...(existing?.sellingPoints ?? []), ...incoming.sellingPoints]),
      targetAudience: uniqueValues([...(existing?.targetAudience ?? []), ...incoming.targetAudience]),
      useCases: uniqueValues([...(existing?.useCases ?? []), ...incoming.useCases])
    };
  }
}

function mergeUnique(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

function normalizeOfficialLink(origin: string, href: string | undefined): string | null {
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return null;
  try {
    const url = new URL(href, origin);
    if (url.origin !== new URL(origin).origin) return null;
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return null;
  }
}

function officialLinkScore(url: string, textValue: string): number {
  const parsed = new URL(url);
  const haystack = `${parsed.pathname.toLowerCase()} ${textValue.toLowerCase()}`;
  if (parsed.pathname === "/" || parsed.pathname === "") return 100;
  if (lowValuePathKeywords.some((keyword) => haystack.includes(keyword))) return -10;
  let score = 0;
  for (const keyword of highValuePathKeywords) if (haystack.includes(keyword)) score += 20;
  const depth = parsed.pathname.split("/").filter(Boolean).length;
  if (depth <= 2) score += 8;
  if (textValue) score += Math.min(textValue.length, 30) / 10;
  return score;
}

function uniquePageCandidates(candidates: OfficialPageCandidate[]): OfficialPageCandidate[] {
  const seen = new Set<string>();
  return candidates.sort((left, right) => right.score - left.score).filter((candidate) => {
    const key = canonicalPageUrl(candidate.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function canonicalPageUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "") || "/"}`;
}

function linkLabel(origin: string, url: string, textValue: string): string {
  const pathname = new URL(url).pathname.replace(/\/+$/, "") || "/";
  return pathname === "/" ? "/" : pathname || textValue || origin;
}

function formatOfficialPageEvidence(page: OfficialWebsitePageEvidence): string {
  return `URL: ${page.url}\nTITLE: ${page.title ?? ""}\nDESCRIPTION: ${page.description ?? ""}\nSELLING POINTS: ${page.sellingPoints.join(", ")}\nTARGET AUDIENCE: ${page.targetAudience.join(", ")}\nUSE CASES: ${page.useCases.join(", ")}\nVISIBLE TEXT:\n${page.textSnippet}`;
}

function splitSentences(textValue: string, limit: number): string[] {
  return textValue.split(/(?<=[.!?。！？])\s+|\n+/).map((line) => line.trim()).filter(Boolean).slice(0, limit);
}

function compactText(value: string, limit: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

function uniqueValues(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())).map((value) => value.trim()))];
}

function inferSellingPoints(textValue: string): string[] {
  const points: Array<[string, string]> = [
    ["AI", "AI capability"],
    ["summary", "automatic summaries"],
    ["summaries", "automatic summaries"],
    ["transcription", "transcription"],
    ["productivity", "productivity"],
    ["collabor", "collaboration"],
    ["security", "security"],
    ["privacy", "privacy"],
    ["accurate", "accuracy"],
    ["free", "free plan or trial"],
    ["integration", "integrations"],
    ["automation", "automation"]
  ];
  const lower = textValue.toLowerCase();
  return uniqueValues(points.filter(([keyword]) => lower.includes(keyword.toLowerCase())).map(([, label]) => label));
}

function inferAudience(textValue: string): string[] {
  const audiences: Array<[string, string]> = [["sales", "sales teams"], ["business", "business users"], ["enterprise", "enterprise customers"], ["student", "students"], ["journalist", "journalists or researchers"], ["team", "teams"], ["education", "education users"]];
  const lower = textValue.toLowerCase();
  return uniqueValues(audiences.filter(([keyword]) => lower.includes(keyword)).map(([, label]) => label));
}

function inferUseCases(textValue: string): string[] {
  const useCases: Array<[string, string]> = [["meeting", "meetings"], ["interview", "interviews"], ["lecture", "lectures"], ["conversation", "conversation records"], ["webinar", "webinars"], ["podcast", "audio content"], ["notes", "note taking"]];
  const lower = textValue.toLowerCase();
  return uniqueValues(useCases.filter(([keyword]) => lower.includes(keyword)).map(([, label]) => label));
}

function extractPricingPlans(pages: OfficialWebsitePageEvidence[], origin: string): PricingPlanEvidence[] {
  const pricingPage = pages.find((page) => /pricing|plans/i.test(new URL(page.url).pathname)) ?? pages.find((page) => page.url === new URL("/pricing", origin).toString());
  if (!pricingPage) return [];
  return extractFlatPricingCards(pricingPage.textSnippet, pricingPage.url, pricingPage.collectedAt);
}

function extractFlatPricingCards(textValue: string, sourceUrl: string, collectedAt: string): PricingPlanEvidence[] {
  const cardArea = textValue.split(/USED ACROSS|UsageTranscript|Frequently Asked Questions|FAQ/i)[0] ?? textValue;
  const matches = Array.from(cardArea.matchAll(/(Free|Basic|Pro|Business|Enterprise)(?=For|Best Value|\s|$)/gi)).map((match) => ({
    name: canonicalPlanName(match[1] ?? ""),
    index: match.index ?? -1
  }));
  const positions: Array<{ name: string; index: number }> = [];
  const seen = new Set<string>();
  for (const match of matches) {
    if (!match.name || seen.has(match.name)) continue;
    seen.add(match.name);
    positions.push(match);
  }
  return positions.flatMap((position, index) => {
    const nextIndex = positions[index + 1]?.index ?? cardArea.length;
    const window = cardArea.slice(position.index, nextIndex);
    const prices = priceTokensInOrder(window);
    const monthlyPrice = inferMonthlyPrice(position.name, window, prices);
    const annualPrice = inferAnnualPrice(position.name, window, prices, monthlyPrice);
    if (!monthlyPrice && !annualPrice && !/contact sales|custom|schedule a demo/i.test(window)) return [];
    return [{
      name: position.name,
      monthlyPrice: monthlyPrice ?? (/contact sales|custom|schedule a demo/i.test(window) ? "Custom" : null),
      annualPrice,
      currency: prices.length || /free/i.test(window) ? "USD" : null,
      billingPeriod: monthlyPrice && annualPrice ? "month/year" : monthlyPrice ? "month" : annualPrice ? "year" : null,
      features: extractFeatureSnippets(window),
      sourceUrl,
      collectedAt
    }];
  });
}

function canonicalPlanName(name: string): string {
  return planNames.find((planName) => planName.toLowerCase() === name.toLowerCase()) ?? name;
}

function priceTokensInOrder(textValue: string): string[] {
  return uniqueValues(textValue.match(/\$[0-9]+(?:\.[0-9]+)?(?:\*?\/user\/month)?/gi) ?? []);
}

function inferMonthlyPrice(planName: string, window: string, prices: string[]): string | null {
  if (/free|basic/i.test(planName) && /free/i.test(window)) return prices[0] ?? "$0";
  return prices[0] ?? null;
}

function inferAnnualPrice(planName: string, window: string, prices: string[], monthlyPrice: string | null): string | null {
  if (/free|basic/i.test(planName) && /free/i.test(window)) return prices[1] ?? monthlyPrice;
  return prices[1] ?? (/annual only/i.test(window) ? monthlyPrice : null);
}

function extractFeatureSnippets(textValue: string): string[] {
  return uniqueValues([
    /Unlimited transcription[^.。!！?？]{0,120}/i.exec(textValue)?.[0],
    /Unlimited AI summaries[^.。!！?？]{0,120}/i.exec(textValue)?.[0],
    /[\d,]+ mins of storage\/(?:team|seat)[^.。!！?？]{0,80}/i.exec(textValue)?.[0],
    /Unlimited storage[^.。!！?？]{0,120}/i.exec(textValue)?.[0],
    /\d+ AI credits[^.。!！?？]{0,120}/i.exec(textValue)?.[0],
    /Transcription in 100\+ languages[^.。!！?？]{0,120}/i.exec(textValue)?.[0],
    /Real-time notes[^.。!！?？]{0,120}/i.exec(textValue)?.[0],
    /Meeting search[^.。!！?？]{0,120}/i.exec(textValue)?.[0],
    /AskFred[^.。!！?？]{0,120}/i.exec(textValue)?.[0],
    /Upload audio\/video file[^.。!！?？]{0,120}/i.exec(textValue)?.[0],
    /Video recording[^.。!！?？]{0,120}/i.exec(textValue)?.[0],
    /Download transcripts[^.。!！?？]{0,120}/i.exec(textValue)?.[0],
    /SSO \+ SCIM[^.。!！?？]{0,120}/i.exec(textValue)?.[0],
    /HIPAA compliance[^.。!！?？]{0,120}/i.exec(textValue)?.[0],
    /transcription[^.。!！?？]{0,120}/i.exec(textValue)?.[0],
    /summary[^.。!！?？]{0,120}/i.exec(textValue)?.[0],
    /AI[^.。!！?？]{0,120}/i.exec(textValue)?.[0],
    /team[^.。!！?？]{0,120}/i.exec(textValue)?.[0],
    /minutes?[^.。!！?？]{0,120}/i.exec(textValue)?.[0],
    /storage[^.。!！?？]{0,120}/i.exec(textValue)?.[0]
  ]);
}

async function restrictionReason(page: Page): Promise<string | null> {
  const body = (await page.locator("body").innerText({ timeout: 10_000 }).catch(() => "")).slice(0, 20_000);
  if (/captcha|verify you are human|access denied|too many requests|unusual traffic/i.test(body)) return "Public page is blocked by CAPTCHA or access restriction";
  return null;
}

async function text(locator: Locator): Promise<string | null> { const value = await locator.innerText({ timeout: 3_000 }).catch(() => null); return value?.trim() || null; }
async function attr(locator: Locator, name: string): Promise<string | null> { return locator.getAttribute(name, { timeout: 3_000 }).catch(() => null); }
async function texts(locator: Locator): Promise<string[]> { const count = Math.min(await locator.count(), 10); const values: string[] = []; for (let i = 0; i < count; i += 1) { const value = await text(locator.nth(i)); if (value) values.push(value); } return values; }
async function clickFirstVisible(locator: Locator): Promise<boolean> {
  const count = Math.min(await locator.count(), 20);
  for (let i = 0; i < count; i += 1) {
    const target = locator.nth(i);
    const box = await target.boundingBox({ timeout: 1_000 }).catch(() => null);
    if (!box || box.width <= 1 || box.height <= 1) continue;
    await target.click({ timeout: 2_000, force: true }).catch(() => undefined);
    return true;
  }
  return false;
}

function parseCount(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/([\d.]+)\s*([KMB万亿]?)/i);
  if (!match?.[1]) return null;
  const suffix = match[2]?.toUpperCase();
  const multiplier = suffix === "K" ? 1e3 : suffix === "M" ? 1e6 : suffix === "B" ? 1e9 : suffix === "万" ? 1e4 : suffix === "亿" ? 1e8 : 1;
  return Math.round(Number(match[1]) * multiplier);
}
function parseMetric(textValue: string | null, pattern: RegExp): number | null { return parseCount(textValue?.match(pattern)?.[1]); }
function parseVisibleDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const textValue = value.trim();
  const absolute = textValue.match(/\b((?:19|20)\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (absolute?.[1] && absolute[2] && absolute[3]) {
    return new Date(Date.UTC(Number(absolute[1]), Number(absolute[2]) - 1, Number(absolute[3]))).toISOString();
  }
  const iso = textValue.match(/\b((?:19|20)\d{2}-\d{2}-\d{2}(?:T[0-9:.]+Z?)?)\b/);
  if (iso?.[1]) {
    const parsed = Date.parse(iso[1]);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  const monthDate = textValue.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+(?:19|20)\d{2}\b/i)?.[0];
  if (monthDate) {
    const parsed = Date.parse(monthDate);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  const relative = textValue.match(/\b(\d+)\s*(second|sec|s|minute|min|m|hour|hr|h|day|d|week|w|month|mo|year|yr|y)s?\s+ago\b/i);
  if (relative?.[1] && relative[2]) {
    const amount = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    const multipliers: Record<string, number> = {
      second: 1_000, sec: 1_000, s: 1_000,
      minute: 60_000, min: 60_000, m: 60_000,
      hour: 3_600_000, hr: 3_600_000, h: 3_600_000,
      day: 86_400_000, d: 86_400_000,
      week: 604_800_000, w: 604_800_000,
      month: 2_629_746_000, mo: 2_629_746_000,
      year: 31_556_952_000, yr: 31_556_952_000, y: 31_556_952_000
    };
    const multiplier = multipliers[unit];
    return multiplier ? new Date(Date.now() - amount * multiplier).toISOString() : null;
  }
  return null;
}
function firstUsefulLine(value: string | null): string | null { return value?.split(/\r?\n/).map((x) => x.trim()).find((x) => x.length > 5) ?? null; }
function httpUrlOrNull(value: string | null): string | null { if (!value) return null; try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.toString() : null; } catch { return null; } }
function hashtags(value: string): string[] { return [...new Set(value.match(/#[\p{L}\p{N}_]+/gu) ?? [])]; }

function makeCandidate(value: Omit<Candidate, "collectedAt" | "shareCount" | "score"> & { shareCount?: number | null; score?: number | null }): Candidate {
  return { ...value, shareCount: value.shareCount ?? null, score: value.score ?? null, collectedAt: new Date().toISOString() };
}

function itemBase(platform: Platform, candidate: Candidate, overrides: Partial<CollectedItem>): CollectedItem {
  return { platform, externalId: candidate.externalId, title: candidate.title || null, author: candidate.author, publishedAt: candidate.publishedAt, description: candidate.snippet, viewCount: candidate.viewCount, likeCount: candidate.likeCount, commentCount: candidate.commentCount, shareCount: candidate.shareCount ?? null, duration: candidate.duration, tags: [], sourceUrl: candidate.sourceUrl, thumbnailUrl: candidate.thumbnailUrl, relatedLinks: [], subreddit: null, postScore: null, flair: null, body: null, collectedAt: new Date().toISOString(), ...overrides };
}

async function publicLinks(locator: Locator): Promise<string[]> {
  const count = Math.min(await locator.count(), 30); const links: string[] = [];
  for (let i = 0; i < count; i += 1) { const value = httpUrlOrNull(await attr(locator.nth(i), "href")); if (value) links.push(value); }
  return [...new Set(links)];
}

interface ExtractedComment { commentId: string | null; author: string | null; content: string; publishedAt: string | null; likeCount: number | null; replyCount: number | null; commentUrl: string | null; parentCommentId: string | null; }
interface TikTokApiComment {
  id: string;
  text: string;
  author: string | null;
  createTime: number | null;
  likes: number | null;
  replyCount: number | null;
  commentUrl: string | null;
  parentCommentId: string | null;
}
interface TikTokCommentCapture {
  comments(): TikTokApiComment[];
  responseCount(): number;
  dispose(): void;
}
interface TikTokApiVideo {
  id: string;
  title: string;
  author: string | null;
  authorDisplayName: string | null;
  createTime: number | null;
  playCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  duration: string | null;
  sourceUrl: string | null;
  thumbnailUrl: string | null;
}
interface TikTokSearchCapture {
  candidates(): Candidate[];
  responseCount(): number;
  dispose(): void;
}
async function youtubeComment(node: Locator): Promise<ExtractedComment> { const link = await attr(node.locator("#published-time-text a").first(), "href"); return { commentId: link ? new URL(link, "https://www.youtube.com").searchParams.get("lc") : null, author: await text(node.locator("#author-text").first()), content: await text(node.locator("#content-text").first()) ?? "", publishedAt: await text(node.locator("#published-time-text").first()), likeCount: parseCount(await text(node.locator("#vote-count-middle").first())), replyCount: parseCount(await text(node.locator("#replies #text").first())), commentUrl: link ? httpUrlOrNull(new URL(link, "https://www.youtube.com").toString()) : null, parentCommentId: null }; }
async function tiktokComment(node: Locator): Promise<ExtractedComment> {
  return {
    commentId: null,
    author: null,
    content: await text(node) ?? "",
    publishedAt: null,
    likeCount: null,
    replyCount: null,
    commentUrl: null,
    parentCommentId: null
  };
}
async function extractTikTokVisibleComments(page: Page, candidate: Candidate): Promise<Comment[]> {
  const rows = await page.locator('[data-e2e="comment-item"], [data-e2e="comment-level-1"], [data-e2e="comment-text"]').evaluateAll((elements) => {
    const isVisible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1;
    };
    const clean = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";
    const output: Array<{ content: string; likeText: string | null }> = [];
    const seen = new Set<string>();

    for (const element of elements) {
      if (!isVisible(element)) continue;
      const container = element.closest('[data-e2e="comment-item"]') ?? element;
      const contentElement = container.querySelector('[data-e2e="comment-level-1"], [data-e2e="comment-text"]') ?? element;
      const content = clean((contentElement as HTMLElement).innerText || contentElement.textContent);
      if (!content) continue;
      const likeElement = container.querySelector('[data-e2e="comment-like-count"]');
      const likeText = clean((likeElement as HTMLElement | null)?.innerText || likeElement?.textContent);
      const key = `${content}\n${likeText}`;
      if (seen.has(key)) continue;
      seen.add(key);
      output.push({ content, likeText: likeText || null });
      if (output.length >= 50) break;
    }
    return output;
  });
  return rows.map((row) => ({
    commentId: stableCommentId("tiktok", candidate.externalId, null, row.content),
    author: null,
    content: row.content,
    publishedAt: null,
    likeCount: parseCount(row.likeText),
    replyCount: null,
    commentUrl: null,
    parentCommentId: null,
    sentiment: "neutral",
    selectedReasons: [],
    matchedThemes: [],
    collectedAt: new Date().toISOString()
  }));
}
function attachTikTokCommentCapture(page: Page): TikTokCommentCapture {
  const captured: TikTokApiComment[] = [];
  let responses = 0;
  const onResponse = async (response: Response) => {
    if (!response.url().includes("/api/comment/list")) return;
    responses += 1;
    try {
      for (const comment of extractTikTokApiComments(await response.json())) captured.push(comment);
    } catch {
      // Ignore response bodies that Playwright cannot read.
    }
  };
  page.on("response", onResponse);
  return {
    comments: () => dedupeTikTokApiComments(captured).slice(0, 50),
    responseCount: () => responses,
    dispose: () => page.off("response", onResponse)
  };
}
function extractTikTokApiComments(payload: unknown): TikTokApiComment[] {
  const value = payload as {
    comments?: unknown;
    commentList?: unknown;
    data?: { comments?: unknown };
  } | null;
  const source = Array.isArray(value?.comments)
    ? value.comments
    : Array.isArray(value?.commentList)
      ? value.commentList
      : Array.isArray(value?.data?.comments)
        ? value.data.comments
        : [];
  return source.map((item) => {
    const row = item as {
      cid?: unknown;
      id?: unknown;
      comment_id?: unknown;
      text?: unknown;
      commentText?: unknown;
      content?: unknown;
      user?: { unique_id?: unknown; uniqueId?: unknown; nickname?: unknown; nickName?: unknown };
      author?: { unique_id?: unknown; uniqueId?: unknown; nickname?: unknown; nickName?: unknown };
      digg_count?: unknown;
      diggCount?: unknown;
      like_count?: unknown;
      reply_comment_total?: unknown;
      replyCommentTotal?: unknown;
      reply_count?: unknown;
      replyCount?: unknown;
      create_time?: unknown;
      createTime?: unknown;
      createTimeStamp?: unknown;
      url?: unknown;
      share_url?: unknown;
      comment_url?: unknown;
      reply_id?: unknown;
      replyId?: unknown;
      parent_id?: unknown;
      parentId?: unknown;
    };
    return {
      id: String(row.cid ?? row.id ?? row.comment_id ?? ""),
      text: cleanVisibleText(row.text ?? row.commentText ?? row.content, 1000),
      author: cleanVisibleText(row.user?.unique_id ?? row.user?.uniqueId ?? row.user?.nickname ?? row.user?.nickName ?? row.author?.unique_id ?? row.author?.uniqueId ?? row.author?.nickname ?? row.author?.nickName, 160) || null,
      createTime: finiteInteger(row.create_time ?? row.createTime ?? row.createTimeStamp),
      likes: finiteInteger(row.digg_count ?? row.diggCount ?? row.like_count),
      replyCount: finiteInteger(row.reply_comment_total ?? row.replyCommentTotal ?? row.reply_count ?? row.replyCount),
      commentUrl: httpUrlOrNull(cleanVisibleText(row.comment_url ?? row.share_url ?? row.url, 1200)),
      parentCommentId: cleanVisibleText(row.reply_id ?? row.replyId ?? row.parent_id ?? row.parentId, 120) || null
    };
  }).filter((comment) => comment.text);
}
function dedupeTikTokApiComments(comments: TikTokApiComment[]): TikTokApiComment[] {
  const seen = new Set<string>();
  const output: TikTokApiComment[] = [];
  for (const comment of comments) {
    const key = comment.id || comment.text;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(comment);
  }
  return output;
}
function tiktokApiCommentToComment(candidate: Candidate, comment: TikTokApiComment): Comment {
  const commentUrl = comment.commentUrl ?? tiktokCommentUrl(candidate.sourceUrl, comment.id);
  return {
    commentId: comment.id || stableCommentId("tiktok", candidate.externalId, null, comment.text),
    author: comment.author,
    content: comment.text,
    publishedAt: tiktokTimestampToIso(comment.createTime),
    likeCount: comment.likes,
    replyCount: comment.replyCount,
    commentUrl,
    parentCommentId: comment.parentCommentId,
    sentiment: "neutral",
    selectedReasons: [],
    matchedThemes: [],
    collectedAt: new Date().toISOString()
  };
}
function attachTikTokSearchCapture(page: Page, query: string): TikTokSearchCapture {
  const captured: Candidate[] = [];
  let responses = 0;
  const onResponse = async (response: Response) => {
    if (!isTikTokSearchResponse(response.url())) return;
    responses += 1;
    try {
      const videos = extractTikTokApiVideos(await response.json());
      for (const video of videos) {
        const candidate = tiktokApiVideoToCandidate(video, query, captured.length + 1);
        if (!candidate) continue;
        captured.push(candidate);
      }
    } catch {
      // Ignore search responses that are not JSON or whose bodies cannot be read.
    }
  };
  page.on("response", onResponse);
  return {
    candidates: () => dedupeCandidatesInVisibleOrder(captured).slice(0, 30).map((candidate, index) => ({ ...candidate, searchPosition: index + 1 })),
    responseCount: () => responses,
    dispose: () => page.off("response", onResponse)
  };
}
function isTikTokSearchResponse(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("tiktok.com")) return false;
    return /\/api\/search\//i.test(parsed.pathname) || /\/api\/challenge\/item_list/i.test(parsed.pathname);
  } catch {
    return false;
  }
}
function extractTikTokApiVideos(payload: unknown): TikTokApiVideo[] {
  const output: TikTokApiVideo[] = [];
  const seen = new Set<string>();
  const visit = (node: unknown): void => {
    if (output.length >= 80) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!isRecord(node)) return;
    const directVideo = tikTokRecordToVideo(node);
    if (directVideo && !seen.has(directVideo.id)) {
      seen.add(directVideo.id);
      output.push(directVideo);
    }
    const nestedItem = node.item ?? node.aweme_info ?? node.awemeInfo ?? node.video_info ?? node.videoInfo;
    if (nestedItem && nestedItem !== node) visit(nestedItem);
    for (const key of ["data", "item_list", "itemList", "aweme_list", "awemeList", "items", "videos", "list"]) {
      const value = node[key];
      if (Array.isArray(value)) visit(value);
    }
  };
  visit(payload);
  return output;
}
function tikTokRecordToVideo(record: JsonRecord): TikTokApiVideo | null {
  const id = cleanVisibleText(record.id ?? record.aweme_id ?? record.awemeId ?? record.video_id ?? record.videoId, 80);
  if (!/^\d{8,}$/.test(id)) return null;
  const authorRecord = recordAt(record, ["author"]) ?? recordAt(record, ["authorInfo"]) ?? recordAt(record, ["user"]);
  const stats = recordAt(record, ["stats"]) ?? recordAt(record, ["statistics"]) ?? recordAt(record, ["statsV2"]);
  const video = recordAt(record, ["video"]);
  const music = recordAt(record, ["music"]);
  const author = cleanVisibleText(valueAt(authorRecord, ["uniqueId"]) ?? valueAt(authorRecord, ["unique_id"]) ?? valueAt(authorRecord, ["uniqueID"]) ?? valueAt(authorRecord, ["nickname"]), 160) || null;
  const shareUrl = httpUrlOrNull(cleanVisibleText(record.shareUrl ?? record.share_url ?? record.url, 1200));
  const sourceUrl = shareUrl ?? (author ? `https://www.tiktok.com/@${encodeURIComponent(author)}/video/${id}` : null);
  if (!sourceUrl) return null;
  const description = cleanVisibleText(record.desc ?? record.description ?? record.title ?? record.text, 2_000);
  const durationMs = finiteInteger(valueAt(video, ["duration"]) ?? valueAt(music, ["duration"]));
  return {
    id,
    title: description,
    author,
    authorDisplayName: cleanVisibleText(valueAt(authorRecord, ["nickname"]) ?? valueAt(authorRecord, ["nickName"]), 160) || null,
    createTime: finiteInteger(record.createTime ?? record.create_time ?? record.createTimeStamp ?? record.create_time_stamp),
    playCount: finiteInteger(valueAt(stats, ["playCount"]) ?? valueAt(stats, ["play_count"]) ?? valueAt(stats, ["viewCount"]) ?? valueAt(stats, ["view_count"])),
    likeCount: finiteInteger(valueAt(stats, ["diggCount"]) ?? valueAt(stats, ["digg_count"]) ?? valueAt(stats, ["likeCount"]) ?? valueAt(stats, ["like_count"])),
    commentCount: finiteInteger(valueAt(stats, ["commentCount"]) ?? valueAt(stats, ["comment_count"])),
    shareCount: finiteInteger(valueAt(stats, ["shareCount"]) ?? valueAt(stats, ["share_count"])),
    duration: durationMs ? `${Math.round(durationMs / (durationMs > 10_000 ? 1000 : 1))}s` : null,
    sourceUrl,
    thumbnailUrl: tiktokImageUrl(valueAt(video, ["cover"]) ?? valueAt(video, ["originCover"]) ?? valueAt(video, ["dynamicCover"]) ?? valueAt(video, ["coverUrl"]) ?? record.cover)
  };
}
function tiktokApiVideoToCandidate(video: TikTokApiVideo, query: string, searchPosition: number): Candidate | null {
  if (!video.sourceUrl) return null;
  return makeCandidate({
    platform: "tiktok",
    externalId: video.id,
    title: video.title || video.authorDisplayName || "",
    author: video.author,
    publishedAt: tiktokTimestampToIso(video.createTime),
    visibleEngagement: [
      video.playCount !== null ? `${video.playCount} views` : null,
      video.likeCount !== null ? `${video.likeCount} likes` : null,
      video.commentCount !== null ? `${video.commentCount} comments` : null,
      video.shareCount !== null ? `${video.shareCount} shares` : null
    ].filter(Boolean).join(" | ") || null,
    viewCount: video.playCount,
    likeCount: video.likeCount,
    commentCount: video.commentCount,
    shareCount: video.shareCount,
    duration: video.duration,
    snippet: video.title || null,
    sourceUrl: video.sourceUrl,
    thumbnailUrl: video.thumbnailUrl,
    matchedQuery: query,
    searchPosition
  });
}
function dedupeCandidatesInVisibleOrder(candidates: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const output: Candidate[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.platform}:${candidate.externalId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(candidate);
  }
  return output;
}
function tiktokImageUrl(value: unknown): string | null {
  if (typeof value === "string") return httpUrlOrNull(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = tiktokImageUrl(item);
      if (url) return url;
    }
  }
  if (isRecord(value)) {
    const direct = httpUrlOrNull(cleanVisibleText(value.url ?? value.uri, 1200));
    if (direct) return direct;
    const list = value.urlList ?? value.url_list ?? value.urls;
    if (Array.isArray(list)) return tiktokImageUrl(list);
  }
  return null;
}
function tiktokTimestampToIso(value: number | null): string | null {
  if (!value) return null;
  const millis = value > 10_000_000_000 ? value : value * 1000;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function tiktokCommentUrl(sourceUrl: string, commentId: string): string | null {
  if (!commentId) return null;
  try {
    const url = new URL(sourceUrl);
    url.searchParams.set("comment", commentId);
    return url.toString();
  } catch {
    return null;
  }
}
async function scrollTikTokCommentPanel(page: Page): Promise<boolean> {
  const selectors = [
    '[data-e2e="browse-comment-list"]',
    '[data-e2e="comment-list"]',
    'div[class*="DivCommentListContainer"]',
    'div[class*="CommentListContainer"]',
    'div[class*="CommentList"]'
  ];
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count().catch(() => 0)) === 0) continue;
    const didScroll = await locator.evaluate((element) => {
      if (!(element instanceof HTMLElement)) return false;
      const before = element.scrollTop;
      element.scrollTop += 700;
      return element.scrollTop !== before;
    }).catch(() => false);
    if (didScroll) return true;
  }
  return false;
}
function cleanVisibleText(value: unknown, limit: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
}
function finiteInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}
function stableCommentId(platform: Platform, externalId: string, author: string | null, content: string): string { return `${platform}-${createHash("sha256").update(`${externalId}\n${author ?? ""}\n${content}`).digest("hex").slice(0, 20)}`; }
