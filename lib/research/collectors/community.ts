import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { prisma } from "@/lib/db";
import { recordSource } from "@/lib/research/collectors/sources";

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
  items?: CommunityScriptItem[];
};

export async function collectCommunityDiscussions(taskId: string, appName: string, keywords?: string | null) {
  await prisma.communityItem.deleteMany({ where: { taskId } });

  const pythonCommand = process.env.COMMUNITY_DISCUSSIONS_PYTHON || "python3";
  const scriptPath = path.join(process.cwd(), "scripts", "community_discussions.py");
  const queries = buildCommunityQueries(appName, keywords);
  const args = [
    scriptPath,
    "--app-name",
    appName,
    "--queries-json",
    JSON.stringify(queries),
    "--youtube-video-limit",
    String(normalizeLimit(process.env.COMMUNITY_YOUTUBE_VIDEO_LIMIT, 6, 12)),
    "--youtube-comments-per-video",
    String(normalizeLimit(process.env.COMMUNITY_YOUTUBE_COMMENTS_PER_VIDEO, 8, 20))
  ];

  try {
    const { stdout } = await execFileAsync(pythonCommand, args, { timeout: 150_000, maxBuffer: 2 * 1024 * 1024 });
    const result = JSON.parse(stdout) as CommunityScriptResult;
    await recordCommunitySource(taskId, "COMMUNITY_YOUTUBE", "YouTube 视频与评论", "https://www.youtube.com/", result.youtube, result.queries ?? queries);

    const items = (result.items ?? []).map(normalizeCommunityItem).filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (items.length) {
      await prisma.communityItem.createMany({ data: items.map((item) => ({ ...item, taskId })) });
    }
    return items;
  } catch (error) {
    const errorMessage = processErrorMessage(error, "社区讨论采集失败");
    await recordSource({ taskId, sourceType: "COMMUNITY_YOUTUBE", sourceName: "YouTube 视频与评论", url: "https://www.youtube.com/", status: "FAILED", errorMessage });
    return [];
  }
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
