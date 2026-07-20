import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { prisma } from "@/lib/db";
import { recordSource } from "@/lib/research/collectors/sources";
import { inferWebsiteUrl } from "@/lib/research/collectors/website";
import { getDeepSeekApiKey } from "@/lib/settings";

const execFileAsync = promisify(execFile);
const socialAgentDirectory = path.join(process.cwd(), "tools", "social-agent");
const socialAgentRuntimeDirectory = path.join(process.cwd(), ".runtime", "social-agent");

type SocialPlatform = "youtube" | "reddit" | "tiktok";

type CommunityCollectOptions = {
  youtube?: boolean;
  reddit?: boolean;
  tiktok?: boolean;
  websiteUrl?: string | null;
};

type SocialAgentRunResult = {
  runId?: string;
  runDirectory?: string;
  summary?: {
    status?: string;
    platforms?: Partial<Record<SocialPlatform, SocialAgentPlatformStatus>>;
  };
};

type SocialAgentPlatformStatus = {
  status?: "completed" | "partial" | "blocked" | "failed";
  candidateCount?: number;
  selectedCount?: number;
  commentCount?: number;
  reasonCode?: string;
  reason?: string;
};

type SocialAgentCandidate = {
  externalId?: string;
  matchedQuery?: string;
  matchedQueries?: string[];
  searchGroupQuery?: string;
};

type SocialAgentItem = {
  platform?: SocialPlatform;
  externalId?: string;
  title?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  description?: string | null;
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  shareCount?: number | null;
  tags?: string[];
  sourceUrl?: string | null;
  relatedLinks?: string[];
  subreddit?: string | null;
  postScore?: number | null;
  flair?: string | null;
  body?: string | null;
  collectionDecision?: {
    reason?: string;
    evidence?: string[];
    evidenceAnalysis?: {
      detail?: { summary?: string | null; extractedFacts?: string[] };
      poster?: {
        available?: boolean;
        viewpoint?: string | null;
        summary?: string | null;
        extractedFacts?: string[];
      };
      captions?: { summary?: string | null; extractedFacts?: string[] };
    };
  };
  supplementalEvidence?: {
    youtubeCaptions?: {
      captionLanguage?: string | null;
      captionText?: string | null;
      reason?: string | null;
    } | null;
  };
};

type SocialAgentComment = {
  commentId?: string;
  author?: string | null;
  content?: string;
  publishedAt?: string | null;
  likeCount?: number | null;
  replyCount?: number | null;
  commentUrl?: string | null;
  sentiment?: string;
  valueScore?: number;
  selectedReasons?: string[];
  matchedThemes?: string[];
};

type CommunityData = {
  platform: string;
  itemType: string;
  title: string | null;
  content: string;
  author: string | null;
  score: number | null;
  commentCount: number | null;
  publishedAt: Date | null;
  sourceUrl: string | null;
  searchQuery: string | null;
  relatedProducts: string | null;
};

const platformLabels: Record<SocialPlatform, string> = {
  youtube: "YouTube",
  reddit: "Reddit",
  tiktok: "TikTok"
};

const sourceTypes: Record<SocialPlatform, string> = {
  youtube: "COMMUNITY_YOUTUBE",
  reddit: "COMMUNITY_REDDIT",
  tiktok: "COMMUNITY_TIKTOK"
};

const sourceNames: Record<SocialPlatform, string> = {
  youtube: "YouTube 视频与评论",
  reddit: "Reddit 帖子与评论",
  tiktok: "TikTok 视频与评论"
};

const sourceUrls: Record<SocialPlatform, string> = {
  youtube: "https://www.youtube.com/",
  reddit: "https://www.reddit.com/",
  tiktok: "https://www.tiktok.com/"
};

export async function collectCommunityDiscussions(taskId: string, appName: string, keywords?: string | null, options: CommunityCollectOptions = {}) {
  const platforms = selectedPlatforms(options);
  const platformNames = platforms.map((platform) => platformLabels[platform]);

  await prisma.communityItem.deleteMany({
    where: {
      taskId,
      ...(platformNames.length === 3 ? {} : { platform: { in: platformNames } })
    }
  });

  if (!platforms.length) return [];

  try {
    await prisma.researchTask.update({
      where: { id: taskId },
      data: { currentStep: `正在使用社媒采集 agent 收集 ${platformNames.join("、")} 公开讨论。` }
    });

    const run = await runSocialAgent(taskId, appName, keywords, platforms, options.websiteUrl);
    const items = await readSocialAgentItems(run, platforms);
    if (items.length) {
      await prisma.communityItem.createMany({ data: items.map((item) => ({ ...item, taskId })) });
    }
    await recordSocialAgentSources(taskId, run, platforms, items);
    return items;
  } catch (error) {
    const errorMessage = processErrorMessage(error, "社媒采集 agent 运行失败");
    await Promise.all(
      platforms.map((platform) =>
        recordSource({
          taskId,
          sourceType: sourceTypes[platform],
          sourceName: sourceNames[platform],
          url: sourceUrls[platform],
          status: "FAILED",
          errorMessage
        })
      )
    );
    return [];
  }
}

function selectedPlatforms(options: CommunityCollectOptions): SocialPlatform[] {
  const collectYouTube = options.youtube ?? true;
  const collectReddit = options.reddit ?? true;
  const collectTikTok = options.tiktok ?? true;
  return [
    collectYouTube ? "youtube" : null,
    collectReddit ? "reddit" : null,
    collectTikTok ? "tiktok" : null
  ].filter((platform): platform is SocialPlatform => Boolean(platform));
}

async function runSocialAgent(
  taskId: string,
  appName: string,
  keywords: string | null | undefined,
  platforms: SocialPlatform[],
  websiteUrl?: string | null
) {
  const command = await socialAgentCommand();
  await fs.mkdir(socialAgentRuntimeDirectory, { recursive: true });

  const apiKey = await getDeepSeekApiKey();
  const inputPath = path.join(socialAgentRuntimeDirectory, `${taskId}-${Date.now()}.json`);
  const input = {
    appName,
    officialWebsite: inferWebsiteUrl(appName, websiteUrl),
    country: process.env.SOCIAL_AGENT_COUNTRY || "US",
    language: process.env.SOCIAL_AGENT_LANGUAGE || "en",
    platforms,
    maxItemsPerPlatform: normalizeLimit(process.env.SOCIAL_AGENT_MAX_ITEMS_PER_PLATFORM, 5, 5),
    maxCommentsPerItem: normalizeLimit(process.env.SOCIAL_AGENT_MAX_COMMENTS_PER_ITEM, 10, 10),
    browser: socialAgentBrowserConfig(),
    keywords: cleanText(keywords, 240) || undefined
  };
  await fs.writeFile(inputPath, JSON.stringify(input, null, 2), "utf8");

  const { stdout } = await execFileAsync(command.bin, command.args(inputPath), {
    cwd: socialAgentDirectory,
    timeout: normalizeLimit(process.env.SOCIAL_AGENT_TIMEOUT_MS, 1_800_000, 3_600_000),
    maxBuffer: 32 * 1024 * 1024,
    env: {
      ...process.env,
      DEEPSEEK_API_KEY: apiKey || process.env.DEEPSEEK_API_KEY || "",
      DEEPSEEK_BASE_URL: normalizeDeepSeekBaseUrl(process.env.DEEPSEEK_BASE_URL),
      DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash"
    }
  });

  return parseRunResult(stdout);
}

async function socialAgentCommand() {
  const packageJsonPath = path.join(socialAgentDirectory, "package.json");
  const zodPath = path.join(socialAgentDirectory, "node_modules", "zod", "package.json");
  const cliPath = path.join(socialAgentDirectory, "dist", "cli.js");
  const tsxPath = path.join(socialAgentDirectory, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  await fs.access(packageJsonPath);
  try {
    await fs.access(zodPath);
  } catch {
    throw new Error("社媒采集 agent 依赖未安装。请先执行：cd tools/social-agent && npm install");
  }
  try {
    await fs.access(cliPath);
    return { bin: process.execPath, args: (inputPath: string) => [cliPath, "--input", inputPath] };
  } catch {
    try {
      await fs.access(tsxPath);
      return { bin: "npm", args: (inputPath: string) => ["run", "collect", "--", "--input", inputPath] };
    } catch {
      throw new Error("社媒采集 agent 尚未构建。请执行：cd tools/social-agent && npm run build");
    }
  }
}

function socialAgentBrowserConfig() {
  const mode = process.env.SOCIAL_AGENT_BROWSER_MODE === "isolated" ? "isolated" : "existing";
  const cdpEndpoint = process.env.SOCIAL_AGENT_CDP_ENDPOINT || process.env.SOCIAL_AGENT_CDP_PORT || "9333";
  if (mode === "existing" && cdpEndpoint) {
    return {
      mode,
      connection: "cdp",
      cdpEndpoint: /^\d+$/.test(cdpEndpoint) ? Number.parseInt(cdpEndpoint, 10) : cdpEndpoint,
      reuseOpenPages: true,
      preserveExistingBrowser: true
    };
  }
  return {
    mode,
    connection: cdpEndpoint ? "cdp" : "auto",
    ...(cdpEndpoint ? { cdpEndpoint: /^\d+$/.test(cdpEndpoint) ? Number.parseInt(cdpEndpoint, 10) : cdpEndpoint } : {}),
    reuseOpenPages: true,
    preserveExistingBrowser: true
  };
}

function normalizeDeepSeekBaseUrl(value: string | undefined) {
  const baseUrl = value || "https://api.deepseek.com";
  return baseUrl.replace(/\/chat\/completions\/?$/i, "").replace(/\/$/, "");
}

function parseRunResult(stdout: string): SocialAgentRunResult {
  const trimmed = stdout.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace < firstBrace) throw new Error("社媒采集 agent 未返回 JSON 结果");
  return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as SocialAgentRunResult;
}

async function readSocialAgentItems(run: SocialAgentRunResult, platforms: SocialPlatform[]) {
  const runDirectory = run.runDirectory ? path.resolve(socialAgentDirectory, run.runDirectory) : null;
  if (!runDirectory) return [];

  const items: CommunityData[] = [];
  for (const platform of platforms) {
    const candidateMap = await readCandidateMap(runDirectory, platform);
    const platformDirectory = path.join(runDirectory, "items", platform);
    const itemDirectories = await safeReadDirectory(platformDirectory);
    for (const itemDirectoryName of itemDirectories) {
      const itemDirectory = path.join(platformDirectory, itemDirectoryName);
      const item = await readJson<SocialAgentItem>(path.join(itemDirectory, "item.json"));
      if (!item) continue;
      const candidate = item.externalId ? candidateMap.get(item.externalId) : undefined;
      const normalizedItem = normalizeAgentItem(item, platform, candidate);
      if (normalizedItem) items.push(normalizedItem);

      const comments = (await readJson<SocialAgentComment[]>(path.join(itemDirectory, "comments.json"))) ?? [];
      for (const comment of comments) {
        const normalizedComment = normalizeAgentComment(comment, item, platform, candidate);
        if (normalizedComment) items.push(normalizedComment);
      }
    }
  }
  return items;
}

async function readCandidateMap(runDirectory: string, platform: SocialPlatform) {
  const candidates = (await readJson<SocialAgentCandidate[]>(path.join(runDirectory, "candidates", `${platform}.json`))) ?? [];
  const map = new Map<string, SocialAgentCandidate>();
  for (const candidate of candidates) {
    if (candidate.externalId) map.set(candidate.externalId, candidate);
  }
  return map;
}

async function safeReadDirectory(directory: string) {
  try {
    return await fs.readdir(directory);
  } catch {
    return [];
  }
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function normalizeAgentItem(item: SocialAgentItem, platform: SocialPlatform, candidate?: SocialAgentCandidate): CommunityData | null {
  const content = buildAgentItemContent(item);
  if (!content) return null;
  const itemType = platform === "reddit" ? "POST" : "VIDEO";
  return {
    platform: platformLabels[platform],
    itemType,
    title: cleanText(item.title, 240) || null,
    content,
    author: cleanText(item.author || item.subreddit, 160) || null,
    score: finiteInteger(item.postScore ?? item.likeCount ?? item.viewCount),
    commentCount: finiteInteger(item.commentCount),
    publishedAt: parseDate(item.publishedAt),
    sourceUrl: cleanUrl(item.sourceUrl),
    searchQuery: candidateSearchQuery(candidate),
    relatedProducts: relatedText([...(item.tags ?? []), ...(item.relatedLinks ?? []), item.flair])
  };
}

function buildAgentItemContent(item: SocialAgentItem) {
  const poster = item.collectionDecision?.evidenceAnalysis?.poster;
  const captions = item.collectionDecision?.evidenceAnalysis?.captions;
  const captionText = item.supplementalEvidence?.youtubeCaptions?.captionText;
  const captionLanguage = item.supplementalEvidence?.youtubeCaptions?.captionLanguage;
  const posterBlocks = [
    poster?.viewpoint ? `贴主观点：${poster.viewpoint}` : "",
    poster?.summary ? `贴主观点总结：${poster.summary}` : "",
    poster?.extractedFacts?.length ? `贴主观点要点：${poster.extractedFacts.join("；")}` : ""
  ];
  const captionBlocks = [
    captions?.summary ? `字幕总结：${captions.summary}` : "",
    captions?.extractedFacts?.length ? `字幕要点：${captions.extractedFacts.join("；")}` : "",
    captionText ? `字幕摘录${captionLanguage ? `（${captionLanguage}）` : ""}：${captionText}` : ""
  ];
  const blocks = [
    ...posterBlocks,
    item.collectionDecision?.evidenceAnalysis?.detail?.summary ? `详情总结：${item.collectionDecision.evidenceAnalysis.detail.summary}` : "",
    item.body || item.description || "",
    ...captionBlocks,
    item.collectionDecision?.reason ? `采集判断：${item.collectionDecision.reason}` : "",
    item.title || ""
  ].filter(Boolean);
  return cleanText(blocks.join("\n"), 1800);
}

function normalizeAgentComment(comment: SocialAgentComment, item: SocialAgentItem, platform: SocialPlatform, candidate?: SocialAgentCandidate): CommunityData | null {
  const content = cleanText(comment.content, 1400);
  if (!content) return null;
  return {
    platform: platformLabels[platform],
    itemType: "COMMENT",
    title: cleanText(item.title, 240) || null,
    content,
    author: cleanText(comment.author, 160) || null,
    score: finiteInteger(comment.likeCount ?? comment.valueScore),
    commentCount: finiteInteger(comment.replyCount),
    publishedAt: parseDate(comment.publishedAt),
    sourceUrl: cleanUrl(comment.commentUrl || item.sourceUrl),
    searchQuery: candidateSearchQuery(candidate),
    relatedProducts: relatedText([comment.sentiment, ...(comment.matchedThemes ?? []), ...(comment.selectedReasons ?? [])])
  };
}

async function recordSocialAgentSources(taskId: string, run: SocialAgentRunResult, platforms: SocialPlatform[], items: CommunityData[]) {
  await Promise.all(
    platforms.map((platform) => {
      const platformItems = items.filter((item) => item.platform === platformLabels[platform]);
      const status = run.summary?.platforms?.[platform];
      const hasItems = platformItems.length > 0;
      return recordSource({
        taskId,
        sourceType: sourceTypes[platform],
        sourceName: sourceNames[platform],
        url: sourceUrls[platform],
        status: hasItems ? "SUCCESS" : "FAILED",
        rawContent: JSON.stringify({
          runId: run.runId,
          runDirectory: run.runDirectory,
          platformStatus: status,
          savedItems: platformItems.length,
          videos: platformItems.filter((item) => item.itemType === "VIDEO").length,
          posts: platformItems.filter((item) => item.itemType === "POST").length,
          comments: platformItems.filter((item) => item.itemType === "COMMENT").length
        }),
        errorMessage: hasItems ? undefined : status?.reason || `${sourceNames[platform]} 未保存到有效内容。`
      });
    })
  );
}

function candidateSearchQuery(candidate?: SocialAgentCandidate) {
  return cleanText(candidate?.searchGroupQuery || candidate?.matchedQuery || candidate?.matchedQueries?.join(" / "), 360) || null;
}

function relatedText(values: Array<string | null | undefined>) {
  const text = values
    .map((value) => cleanText(value, 80))
    .filter(Boolean)
    .slice(0, 10)
    .join("、");
  return text || null;
}

function normalizeLimit(value: string | undefined, fallback: number, maximum: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function cleanText(value: unknown, limit: number) {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text.slice(0, limit);
}

function cleanUrl(value: unknown) {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return null;
  return value.slice(0, 1200);
}

function finiteInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}

function parseDate(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function processErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object") {
    if ("stderr" in error && typeof error.stderr === "string" && error.stderr.trim()) return error.stderr.trim().slice(0, 1000);
    if ("message" in error && typeof error.message === "string" && error.message.trim()) return error.message.slice(0, 1000);
  }
  return error instanceof Error ? error.message.slice(0, 1000) : fallback;
}
