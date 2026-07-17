import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { prisma } from "@/lib/db";
import { recordSource } from "@/lib/research/collectors/sources";
import { clearTikTokLoginSignal, tiktokLoginSignalPath } from "@/lib/research/collectors/tiktok-login-signal";

const execFileAsync = promisify(execFile);

type CommunityScriptItem = {
  platform?: string;
  itemType?: string;
  title?: string | null;
  content?: string;
  author?: string | null;
  score?: number | null;
  commentCount?: number | null;
  publishedAt?: string | null;
  sourceUrl?: string | null;
  searchQuery?: string | null;
  relatedProducts?: string | null;
};

type CommunityScriptSource = {
  status?: "SUCCESS" | "FAILED" | "SKIPPED";
  error?: string | null;
  items?: CommunityScriptItem[];
};

type CommunityScriptResult = {
  queries?: string[];
  youtube?: CommunityScriptSource;
  tiktok?: CommunityScriptSource;
  items?: CommunityScriptItem[];
};

type CommunityCollectOptions = {
  youtube?: boolean;
  tiktok?: boolean;
};

export async function collectCommunityDiscussions(taskId: string, appName: string, keywords?: string | null, options: CommunityCollectOptions = {}) {
  const collectYouTube = options.youtube ?? true;
  const collectTikTok = options.tiktok ?? true;
  if (collectYouTube && collectTikTok) {
    await prisma.communityItem.deleteMany({ where: { taskId } });
  } else {
    await prisma.communityItem.deleteMany({
      where: {
        taskId,
        platform: { in: [collectYouTube ? "YouTube" : "", collectTikTok ? "TikTok" : ""].filter(Boolean) }
      }
    });
  }

  const queries = buildCommunityQueries(appName, keywords);
  const allItems: NonNullable<ReturnType<typeof normalizeCommunityItem>>[] = [];

  if (collectYouTube) {
    const youtubeResult = await collectYouTubeCommunity(taskId, appName, queries);
    allItems.push(...youtubeResult);
  }

  if (collectTikTok) {
    const tiktokResult = await collectTikTokCommunity(taskId, appName, queries, keywords ?? null);
    allItems.push(...tiktokResult);
  }

  if (allItems.length) {
    await prisma.communityItem.createMany({ data: allItems.map((item) => ({ ...item, taskId })) });
  }
  return allItems;
}

async function collectYouTubeCommunity(taskId: string, appName: string, queries: string[]) {
  const pythonCommand = process.env.COMMUNITY_DISCUSSIONS_PYTHON || "python3";
  const scriptPath = path.join(process.cwd(), "scripts", "community_discussions.py");
  const youtubeVideosPerQuery = normalizeLimit(process.env.COMMUNITY_YOUTUBE_VIDEOS_PER_QUERY, 5, 10);
  const youtubeVideoLimit = Math.max(normalizeLimit(process.env.COMMUNITY_YOUTUBE_VIDEO_LIMIT, queries.length * youtubeVideosPerQuery, 60), queries.length * youtubeVideosPerQuery);
  const args = [
    scriptPath,
    "--app-name",
    appName,
    "--queries-json",
    JSON.stringify(queries),
    "--youtube-video-limit",
    String(youtubeVideoLimit),
    "--youtube-videos-per-query",
    String(youtubeVideosPerQuery),
    "--youtube-comments-per-video",
    String(normalizeLimit(process.env.COMMUNITY_YOUTUBE_COMMENTS_PER_VIDEO, 20, 20))
  ];

  try {
    const { stdout } = await execFileAsync(pythonCommand, args, { timeout: 150_000, maxBuffer: 2 * 1024 * 1024 });
    const result = JSON.parse(stdout) as CommunityScriptResult;
    await recordCommunitySource(taskId, "COMMUNITY_YOUTUBE", "YouTube 视频与评论", "https://www.youtube.com/", result.youtube, result.queries ?? queries);
    return normalizeCommunityItems(result.items ?? []);
  } catch (error) {
    const errorMessage = processErrorMessage(error, "社区讨论采集失败");
    await recordSource({ taskId, sourceType: "COMMUNITY_YOUTUBE", sourceName: "YouTube 视频与评论", url: "https://www.youtube.com/", status: "FAILED", errorMessage });
    return [];
  }
}

async function collectTikTokCommunity(taskId: string, appName: string, queries: string[], keywords: string | null) {
  const nodeCommand = process.env.TIKTOK_COMMENTS_NODE || process.execPath;
  const scriptPath = path.join(process.cwd(), "scripts", "tiktok_comments.mjs");
  const videosPerQuery = normalizeLimit(process.env.TIKTOK_VIDEOS_PER_QUERY, 4, 10);
  const videoLimit = Math.max(normalizeLimit(process.env.TIKTOK_VIDEO_LIMIT, queries.length * videosPerQuery, 60), queries.length * videosPerQuery);
  const commentsPerVideo = normalizeLimit(process.env.TIKTOK_COMMENTS_PER_VIDEO, 10, 50);
  const loginSignalFile = tiktokLoginSignalPath(taskId);
  const loginTimeoutMs = normalizeLimit(process.env.TIKTOK_LOGIN_CONFIRM_TIMEOUT_MS, 600_000, 1_800_000);
  const collectTimeoutMs = normalizeLimit(process.env.TIKTOK_COLLECT_TIMEOUT_MS, loginTimeoutMs + 300_000, 2_400_000);
  const args = [
    scriptPath,
    "--app-name",
    appName,
    "--queries-json",
    JSON.stringify(queries),
    "--keywords",
    keywords ?? "",
    "--video-limit",
    String(videoLimit),
    "--videos-per-query",
    String(videosPerQuery),
    "--comments-per-video",
    String(commentsPerVideo),
    "--login-signal-file",
    loginSignalFile,
    "--login-timeout-ms",
    String(loginTimeoutMs)
  ];
  if (process.env.TIKTOK_PROFILE_URL) args.push("--profile-url", process.env.TIKTOK_PROFILE_URL);
  if (process.env.TIKTOK_PROFILE_DIR) args.push("--profile-dir", process.env.TIKTOK_PROFILE_DIR);
  if (process.env.TIKTOK_CHROME_PATH) args.push("--chrome-path", process.env.TIKTOK_CHROME_PATH);

  try {
    await clearTikTokLoginSignal(taskId);
    await prisma.researchTask.update({
      where: { id: taskId },
      data: {
        currentStep: "TikTok 浏览器已打开，请在浏览器中登录或确认已登录，然后点击页面中的“已登录，继续采集 TikTok”。"
      }
    });
    const { stdout } = await execFileAsync(nodeCommand, args, { timeout: collectTimeoutMs, maxBuffer: 8 * 1024 * 1024 });
    const result = JSON.parse(stdout) as CommunityScriptResult;
    await recordCommunitySource(taskId, "COMMUNITY_TIKTOK", "TikTok 视频与评论", "https://www.tiktok.com/", result.tiktok ?? result, [appName]);
    return normalizeCommunityItems(result.items ?? []);
  } catch (error) {
    const errorMessage = processErrorMessage(error, "TikTok 评论采集失败");
    await recordSource({ taskId, sourceType: "COMMUNITY_TIKTOK", sourceName: "TikTok 视频与评论", url: "https://www.tiktok.com/", status: "FAILED", errorMessage });
    return [];
  } finally {
    await clearTikTokLoginSignal(taskId);
  }
}

function normalizeCommunityItems(items: CommunityScriptItem[]) {
  return items.map(normalizeCommunityItem).filter((item): item is NonNullable<typeof item> => Boolean(item));
}

async function recordCommunitySource(
  taskId: string,
  sourceType: string,
  sourceName: string,
  url: string,
  source: CommunityScriptSource | undefined,
  queries: string[]
) {
  const status = source?.status ?? "FAILED";
  const items = source?.items ?? [];
  await recordSource({
    taskId,
    sourceType,
    sourceName,
    url,
    status,
    rawContent: JSON.stringify({ queries, itemCount: items.length }),
    errorMessage: source?.error || (status === "FAILED" ? "社区来源未返回结果。" : undefined)
  });
}

function normalizeCommunityItem(item: CommunityScriptItem) {
  const platform = cleanText(item.platform, 32);
  const itemType = cleanText(item.itemType, 24);
  const content = cleanText(item.content, 1400);
  if (!platform || !itemType || !content) return null;
  return {
    platform,
    itemType,
    title: cleanText(item.title, 240) || null,
    content,
    author: cleanText(item.author, 160) || null,
    score: finiteInteger(item.score),
    commentCount: finiteInteger(item.commentCount),
    publishedAt: parseDate(item.publishedAt),
    sourceUrl: cleanUrl(item.sourceUrl),
    searchQuery: cleanText(item.searchQuery, 360) || null,
    relatedProducts: cleanText(item.relatedProducts, 360) || null
  };
}

function buildCommunityQueries(appName: string, keywords?: string | null) {
  const context = cleanText(keywords, 120)
    .split(/[，,;；\n]/)
    .map((item) => item.trim())
    .find((item) => item.length >= 3 && item.length <= 70);
  return Array.from(
    new Set(
      [
        `${appName} review`,
        `${appName} alternative`,
        `${appName} vs competitor`,
        `${appName} alternatives comparison`,
        context ? `best ${context} alternatives` : ""
      ].filter(Boolean)
    )
  );
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
  if (error && typeof error === "object" && "stderr" in error && typeof error.stderr === "string" && error.stderr.trim()) {
    return error.stderr.trim().slice(0, 1000);
  }
  return error instanceof Error ? error.message.slice(0, 1000) : fallback;
}
