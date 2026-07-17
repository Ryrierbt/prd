#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const args = parseArgs(process.argv.slice(2));
const appName = args["app-name"] || "";
const keywords = args.keywords || "";
const profileUrl = args["profile-url"] || process.env.TIKTOK_PROFILE_URL || "";
const profileDir = expandHome(args["profile-dir"] || process.env.TIKTOK_PROFILE_DIR || "");
const chromePath = args["chrome-path"] || process.env.TIKTOK_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const queries = parseQueries(args["queries-json"], appName, keywords);
const videosPerQuery = normalizeLimit(args["videos-per-query"] || process.env.TIKTOK_VIDEOS_PER_QUERY, 4, 10);
const videoLimit = normalizeLimit(args["video-limit"] || process.env.TIKTOK_VIDEO_LIMIT, Math.max(queries.length * videosPerQuery, 1), 60);
const commentsPerVideo = normalizeLimit(args["comments-per-video"] || process.env.TIKTOK_COMMENTS_PER_VIDEO, 10, 50);
const loginSignalFile = args["login-signal-file"] || "";
const loginTimeoutMs = normalizeLimit(args["login-timeout-ms"] || process.env.TIKTOK_LOGIN_CONFIRM_TIMEOUT_MS, 600_000, 1_800_000);
const outputJson = args["output-json"] || "";

const result = await collectTikTokCommunity();
const json = JSON.stringify(result, null, 2);
if (outputJson) {
  await fs.mkdir(path.dirname(outputJson), { recursive: true });
  await fs.writeFile(outputJson, json);
}
process.stdout.write(json);

async function collectTikTokCommunity() {
  if (!queries.length && !profileUrl) {
    return failed("缺少 App 名称或搜索词，无法搜索 TikTok 视频。");
  }
  if (!profileDir) {
    return skipped("未配置 TIKTOK_PROFILE_DIR，跳过 TikTok 评论采集。");
  }
  if (!(await pathExists(profileDir))) {
    return skipped(`TikTok Chrome profile 不存在：${profileDir}`);
  }
  if (!(await pathExists(chromePath))) {
    return skipped(`未找到 Chrome：${chromePath}`);
  }

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    executablePath: chromePath,
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-dev-shm-usage"
    ]
  });

  try {
    const page = context.pages()[0] || (await context.newPage());
    await openLoginGate(page);
    const loginConfirmed = await waitForLoginConfirm(loginSignalFile, loginTimeoutMs);
    if (!loginConfirmed) return failed("等待 TikTok 登录确认超时，请重新采集并在任务页点击“已登录，继续采集 TikTok”。");

    const items = [];
    const videos = [];
    if (profileUrl) {
      const videoLinks = await findVideoLinksFromProfile(page, profileUrl);
      for (const videoLink of videoLinks.slice(0, videoLimit)) {
        await captureAndStoreVideo(page, videoLink, profileUrl, items, videos);
      }
    } else {
      await collectSearchVideos(page, queries, items, videos);
    }

    return {
      status: items.length ? "SUCCESS" : "SKIPPED",
      error: items.length ? null : "TikTok 搜索结果未返回可用视频或评论。",
      queries,
      videos,
      items
    };
  } catch (error) {
    return failed(errorMessage(error));
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function openLoginGate(page) {
  await page.goto("https://www.tiktok.com/login", { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(async () => {
    await page.goto("https://www.tiktok.com/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  });
  await page.waitForTimeout(3_000);
}

async function waitForLoginConfirm(signalFile, timeoutMs) {
  if (!signalFile) return true;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await pathExists(signalFile)) return true;
    await delay(1_000);
  }
  return false;
}

async function findVideoLinksFromProfile(page, profilePageUrl) {
  await page.goto(profilePageUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(6_000);
  return collectVideoLinksWithScroll(page, videoLimit).map((url) => ({
    url,
    searchQuery: "configured TikTok profile"
  }));
}

async function collectSearchVideos(page, searchQueries, items, videos) {
  const seen = new Set();

  for (const query of searchQueries) {
    if (videos.length >= videoLimit) break;
    const searchPage = await openSearchPageWithVideos(page, query);
    if (!searchPage) continue;

    for (let index = 0; index < videosPerQuery && videos.length < videoLimit; index += 1) {
      await ensureSearchPage(page, searchPage.url);
      const urls = await collectVideoLinksWithScroll(page, Math.max(index + 1, videosPerQuery));
      const url = urls.find((candidate) => !seen.has(candidate));
      if (!url) break;
      seen.add(url);
      await captureAndStoreVideo(page, { url, searchQuery: query }, searchPage.url, items, videos);
    }
  }
}

async function openSearchPageWithVideos(page, query) {
  const searchUrls = [
    `https://www.tiktok.com/search/video?q=${encodeURIComponent(query)}`,
    `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`
  ];

  for (const searchUrl of searchUrls) {
    try {
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForTimeout(7_000);
      const links = await collectVideoLinksWithScroll(page, videosPerQuery);
      if (links.length) return { url: page.url(), query };
    } catch {
      // Try the next search URL.
    }
  }

  return null;
}

async function ensureSearchPage(page, searchUrl) {
  if (normalizeCurrentPageUrl(page.url()) === normalizeCurrentPageUrl(searchUrl)) return;
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(4_000);
}

async function captureAndStoreVideo(page, videoLink, returnUrl, items, videos) {
  const video = await captureVideoComments(page, videoLink.url, returnUrl);
  videos.push(video);
  items.push({
    platform: "TikTok",
    itemType: "VIDEO",
    title: video.title || "TikTok 视频",
    content: video.description || video.title || "TikTok 视频",
    author: video.author || null,
    score: video.likeCount,
    commentCount: video.totalCommentCount || video.comments.length,
    publishedAt: null,
    sourceUrl: videoLink.url,
    searchQuery: videoLink.searchQuery,
    relatedProducts: keywords || null
  });
  for (const comment of topComments(video.comments, commentsPerVideo)) {
    items.push({
      platform: "TikTok",
      itemType: "COMMENT",
      title: video.title || "TikTok 评论",
      content: comment.text,
      author: comment.user || null,
      score: comment.likes,
      commentCount: null,
      publishedAt: comment.createTime ? new Date(comment.createTime * 1000).toISOString() : null,
      sourceUrl: videoLink.url,
      searchQuery: videoLink.searchQuery,
      relatedProducts: keywords || null
    });
  }
}

async function collectVideoLinksWithScroll(page, limit) {
  const links = new Set(await videoLinksOnPage(page));
  let roundsWithoutNewLinks = 0;
  for (let round = 0; round < 10 && links.size < limit && roundsWithoutNewLinks < 3; round += 1) {
    const beforeSize = links.size;
    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(2_000);
    for (const link of await videoLinksOnPage(page)) links.add(link);
    roundsWithoutNewLinks = links.size > beforeSize ? 0 : roundsWithoutNewLinks + 1;
  }
  return [...links].slice(0, limit);
}

async function videoLinksOnPage(page) {
  return page
    .locator('a[href*="/video/"]')
    .evaluateAll((anchors) => Array.from(new Set(anchors.map((anchor) => anchor.href))).filter(Boolean))
    .catch(() => []);
}

async function captureVideoComments(page, videoUrl, returnUrl) {
  const captured = [];
  const onResponse = async (response) => {
    if (!response.url().includes("/api/comment/list")) return;
    try {
      const payload = await response.json();
      captured.push({
        url: response.url(),
        status: response.status(),
        comments: extractComments(payload),
        hasMore: Boolean(payload?.has_more),
        cursor: payload?.cursor ?? null,
        total: finiteInteger(payload?.total)
      });
    } catch {
      // Ignore unparsable response bodies.
    }
  };
  page.on("response", onResponse);
  try {
    await openVideoFromCurrentList(page, videoUrl);
    await page.waitForTimeout(6_000);
    const title = await page.title().catch(() => "");
    const bodyText = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
    const commentIcon = page.locator('[data-e2e="comment-icon"]').first();
    if ((await commentIcon.count().catch(() => 0)) > 0) {
      await commentIcon.click({ timeout: 10_000 }).catch(() => undefined);
      await page.waitForTimeout(5_000);
    }
    let roundsWithoutNewComments = 0;
    for (let round = 0; round < 8 && roundsWithoutNewComments < 2; round += 1) {
      const beforeCount = dedupeComments(captured.flatMap((item) => item.comments)).length;
      if (beforeCount >= commentsPerVideo) break;
      const scrolled = await scrollCommentPanel(page);
      if (!scrolled && round >= 2) break;
      await page.waitForTimeout(1_500);
      const afterCount = dedupeComments(captured.flatMap((item) => item.comments)).length;
      roundsWithoutNewComments = afterCount > beforeCount ? 0 : roundsWithoutNewComments + 1;
    }
    const comments = topComments(dedupeComments(captured.flatMap((item) => item.comments)), commentsPerVideo);
    return {
      url: videoUrl,
      title,
      description: extractVideoDescription(bodyText),
      comments,
      author: handleFromProfileUrl(videoUrl) || null,
      likeCount: firstNumberAfter(bodyText, "likes"),
      totalCommentCount: captured.find((item) => item.total !== null)?.total ?? firstCommentCount(bodyText),
      responseCount: captured.length
    };
  } finally {
    page.off("response", onResponse);
    if (returnUrl) {
      await page.goto(returnUrl, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => undefined);
      await page.waitForTimeout(3_000).catch(() => undefined);
    }
  }
}

async function openVideoFromCurrentList(page, videoUrl) {
  const videoId = videoUrl.match(/\/video\/(\d+)/)?.[1];
  if (videoId) {
    const link = page.locator(`a[href*="/video/${videoId}"]`).first();
    if ((await link.count().catch(() => 0)) > 0) {
      await link.scrollIntoViewIfNeeded({ timeout: 8_000 }).catch(() => undefined);
      await page.waitForTimeout(500);
      await link.click({ timeout: 10_000 }).catch(() => undefined);
      await page.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => undefined);
      if (page.url().includes(`/video/${videoId}`)) return;
    }
  }

  await page.goto(videoUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
}

async function scrollCommentPanel(page) {
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
    const didScroll = await locator
      .evaluate((element) => {
        const target = element instanceof HTMLElement ? element : null;
        if (!target) return false;
        const before = target.scrollTop;
        target.scrollTop += 700;
        return target.scrollTop !== before;
      })
      .catch(() => false);
    if (didScroll) return true;
  }

  return false;
}

function extractComments(payload) {
  const source = payload?.comments || payload?.commentList || payload?.data?.comments || [];
  return (Array.isArray(source) ? source : [])
    .map((item) => ({
      id: String(item.cid || item.id || item.comment_id || ""),
      text: cleanText(item.text || item.commentText || item.content, 1000),
      user: cleanText(item.user?.unique_id || item.user?.nickname || item.author?.uniqueId, 120),
      likes: finiteInteger(item.digg_count ?? item.diggCount ?? item.like_count),
      createTime: finiteInteger(item.create_time ?? item.createTime)
    }))
    .filter((comment) => comment.id && comment.text);
}

function dedupeComments(comments) {
  const seen = new Set();
  return comments.filter((comment) => {
    const key = comment.id || comment.text;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function topComments(comments, limit) {
  return [...comments]
    .sort((left, right) => (right.likes ?? 0) - (left.likes ?? 0))
    .slice(0, limit);
}

function extractVideoDescription(bodyText) {
  const lines = bodyText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return cleanText(lines.find((line) => line.length > 30 && !/^(TikTok|Search|For You|Comments|You may like)$/i.test(line)) || lines.slice(0, 8).join(" "), 500);
}

function firstNumberAfter(bodyText, label) {
  const match = bodyText.match(new RegExp(`([0-9][0-9.,KMB]*)\\s*${label}`, "i"));
  return match ? parseCompactNumber(match[1]) : null;
}

function firstCommentCount(bodyText) {
  const match = bodyText.match(/([0-9][0-9.,KMB]*)\s+comments?/i);
  return match ? parseCompactNumber(match[1]) : null;
}

function parseCompactNumber(value) {
  const normalized = String(value).replace(/,/g, "").trim().toUpperCase();
  const number = Number.parseFloat(normalized);
  if (!Number.isFinite(number)) return null;
  if (normalized.endsWith("K")) return Math.trunc(number * 1000);
  if (normalized.endsWith("M")) return Math.trunc(number * 1_000_000);
  if (normalized.endsWith("B")) return Math.trunc(number * 1_000_000_000);
  return Math.trunc(number);
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    parsed[key] = next && !next.startsWith("--") ? next : "true";
    if (next && !next.startsWith("--")) index += 1;
  }
  return parsed;
}

function parseQueries(rawValue, productName, contextKeywords) {
  try {
    const parsed = JSON.parse(rawValue || "[]");
    if (Array.isArray(parsed)) {
      const cleanItems = parsed.map((item) => cleanText(String(item || ""), 180)).filter(Boolean);
      if (cleanItems.length) return [...new Set(cleanItems)];
    }
  } catch {
    // Fall back to generated queries below.
  }

  const keyword = cleanText(contextKeywords, 120)
    .split(/[，,;；\n]/)
    .map((item) => item.trim())
    .find((item) => item.length >= 3 && item.length <= 70);
  return [
    `${productName} review`,
    `${productName} alternative`,
    `${productName} vs competitor`,
    `${productName} alternatives comparison`,
    keyword ? `best ${keyword} alternatives` : ""
  ].filter(Boolean);
}

function normalizeLimit(value, fallback, maximum) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function cleanText(value, limit) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
}

function finiteInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function handleFromProfileUrl(value) {
  return value?.match(/@([^/?#]+)/)?.[1] || "";
}

function normalizeCurrentPageUrl(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value;
  }
}

function expandHome(value) {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

async function pathExists(value) {
  try {
    await fs.access(value);
    return true;
  } catch {
    return false;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function skipped(error) {
  return { status: "SKIPPED", error, items: [], videos: [] };
}

function failed(error) {
  return { status: "FAILED", error, items: [], videos: [] };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
