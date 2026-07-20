import { prisma } from "@/lib/db";
import { recordSource } from "@/lib/research/collectors/sources";
import { fetchText } from "@/lib/research/utils/fetcher";
import { getOriginUrl, joinUrl, parseHtmlPage, splitSentences, uniqueValues } from "@/lib/research/utils/text";
import * as cheerio from "cheerio";

const websitePageLimit = 12;
const fallbackWebsitePaths = [
  "/pricing",
  "/features",
  "/solutions",
  "/customers",
  "/case-studies",
  "/integrations",
  "/templates",
  "/blog",
  "/help",
  "/resources"
];

const highValuePageKeywords = [
  "pricing", "price", "plan", "feature", "product", "solution", "customer", "case-study", "case_study",
  "story", "integration", "template", "blog", "resource", "help", "use-case", "use_case", "compare", "enterprise"
];
const excludedPageKeywords = ["login", "signin", "sign-in", "signup", "sign-up", "privacy", "terms", "legal", "careers", "jobs", "contact"];

const featureKeywords = [
  "AI",
  "transcription",
  "meeting notes",
  "summary",
  "summaries",
  "record",
  "collaboration",
  "search",
  "Zoom",
  "Google Meet",
  "Microsoft Teams",
  "calendar",
  "speaker"
];

export function inferWebsiteUrl(appName: string, provided?: string | null) {
  if (provided) return provided;
  if (/^otter(\.ai)?$/i.test(appName.trim())) return "https://otter.ai/";
  return null;
}

export async function collectWebsite(taskId: string, appName: string, websiteUrl: string | null) {
  if (!websiteUrl) {
    await recordSource({
      taskId,
      sourceType: "WEBSITE",
      sourceName: "官网",
      url: "about:blank",
      status: "FAILED",
      errorMessage: "未提供官网地址，且第一版暂不自动搜索官网。"
    });
    return null;
  }

  try {
    const rawHtml = await fetchText(websiteUrl, { retries: 1 });
    const homePage = parseHtmlPage(websiteUrl, rawHtml);
    const pages = [{ page: homePage, label: "首页" }];
    const candidates = await discoverWebsitePages(websiteUrl, rawHtml);

    for (const candidate of candidates.slice(0, websitePageLimit - 1)) {
      try {
        const childHtml = await fetchText(candidate.url, { retries: 0, timeoutMs: 12000 });
        const childPage = parseHtmlPage(candidate.url, childHtml);
        if (childPage.text.length < 80) continue;
        pages.push({ page: childPage, label: candidate.label });
        await recordSource({
          taskId,
          sourceType: "WEBSITE_PAGE",
          sourceName: `官网页面：${candidate.label}`,
          url: candidate.url,
          status: "SUCCESS",
          rawContent: `${childPage.title}\n${childPage.description}\n${childPage.text}`,
          rawContentLimit: 30_000,
          fetchedAt: childPage.fetchedAt
        });
      } catch (error) {
        await recordSource({
          taskId,
          sourceType: "WEBSITE_PAGE",
          sourceName: `官网页面：${candidate.label}`,
          url: candidate.url,
          status: "SKIPPED",
          errorMessage: error instanceof Error ? error.message : "页面访问失败"
        });
      }
    }

    const mergedText = pages
      .map(({ page, label }) => `【官网${label}】\n标题：${page.title}\n描述：${page.description}\n正文：${page.text}`)
      .join("\n\n");
    await recordSource({
      taskId,
      sourceType: "WEBSITE",
      sourceName: `官网（首页及 ${pages.length - 1} 个重点页面）`,
      url: websiteUrl,
      status: "SUCCESS",
      rawContent: mergedText,
      rawContentLimit: 60_000,
      fetchedAt: homePage.fetchedAt
    });

    const allText = pages.map(({ page }) => `${page.title} ${page.description} ${page.text}`).join(" ");
    const matchedFeatures = featureKeywords.filter((keyword) => allText.toLowerCase().includes(keyword.toLowerCase()));
    const summary = homePage.description || splitSentences(homePage.text, 1)[0] || "暂未获取";
    const useCases = inferUseCases(allText);
    const targetUsers = inferTargetUsers(allText);
    const iconUrl = extractWebsiteLogoUrl(rawHtml, websiteUrl);

    await prisma.appProfile.upsert({
      where: { taskId },
      update: {
        summary,
        positioning: homePage.title || `${appName} 公开官网定位`,
        targetUsers: targetUsers.join("、") || "暂未获取",
        useCases: useCases.join("、") || "暂未获取",
        platforms: inferPlatforms(allText).join("、") || "暂未获取",
        features: uniqueValues(matchedFeatures).join("、") || "暂未获取",
        iconUrl
      },
      create: {
        taskId,
        summary,
        positioning: homePage.title || `${appName} 公开官网定位`,
        targetUsers: targetUsers.join("、") || "暂未获取",
        useCases: useCases.join("、") || "暂未获取",
        platforms: inferPlatforms(allText).join("、") || "暂未获取",
        features: uniqueValues(matchedFeatures).join("、") || "暂未获取",
        iconUrl
      }
    });

    return homePage;
  } catch (error) {
    await recordSource({
      taskId,
      sourceType: "WEBSITE",
      sourceName: "官网首页",
      url: websiteUrl,
      status: "FAILED",
      errorMessage: error instanceof Error ? error.message : "官网采集失败"
    });
    return null;
  }
}

type WebsitePageCandidate = { url: string; label: string; score: number };

async function discoverWebsitePages(homeUrl: string, rawHtml: string): Promise<WebsitePageCandidate[]> {
  const origin = getOriginUrl(homeUrl);
  if (!origin) return [];
  const candidates = extractWebsiteLinks(origin, rawHtml);
  for (const path of fallbackWebsitePaths) {
    candidates.push({ url: joinUrl(origin, path), label: path, score: 24 - fallbackWebsitePaths.indexOf(path) });
  }

  for (const sitemapUrl of [joinUrl(origin, "/sitemap.xml"), joinUrl(origin, "/sitemap_index.xml")]) {
    try {
      const sitemap = await fetchText(sitemapUrl, { retries: 0, timeoutMs: 8000, headers: { Accept: "application/xml,text/xml,*/*;q=0.8" } });
      const $ = cheerio.load(sitemap, { xmlMode: true });
      $("loc").each((_, element) => {
        const url = normalizeWebsiteLink(origin, $(element).text().trim());
        if (!url) return;
        const score = websitePageScore(url, "");
        if (score > 0) candidates.push({ url, label: new URL(url).pathname, score: score - 2 });
      });
    } catch {
      // Sitemap is optional; homepage links and known paths remain available.
    }
  }

  const seen = new Set<string>();
  return candidates
    .sort((left, right) => right.score - left.score)
    .filter((candidate) => {
      const key = canonicalWebsiteUrl(candidate.url);
      if (seen.has(key) || key === canonicalWebsiteUrl(homeUrl)) return false;
      seen.add(key);
      return candidate.score > 0;
    })
    .slice(0, websitePageLimit - 1);
}

function extractWebsiteLinks(origin: string, rawHtml: string): WebsitePageCandidate[] {
  const $ = cheerio.load(rawHtml);
  const candidates: WebsitePageCandidate[] = [];
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    const url = normalizeWebsiteLink(origin, href);
    if (!url) return;
    const text = ($(element).text() || "").replace(/\s+/g, " ").trim();
    const score = websitePageScore(url, text);
    if (score > 0) candidates.push({ url, label: text || new URL(url).pathname, score });
  });
  return candidates;
}

function websitePageScore(url: string, linkText: string) {
  const path = new URL(url).pathname.toLowerCase();
  const haystack = `${path} ${linkText.toLowerCase()}`;
  if (excludedPageKeywords.some((keyword) => haystack.includes(keyword))) return -20;
  let score = 0;
  for (const keyword of highValuePageKeywords) if (haystack.includes(keyword)) score += 18;
  const depth = path.split("/").filter(Boolean).length;
  if (depth <= 2) score += 8;
  if (linkText) score += Math.min(linkText.length, 30) / 10;
  return score;
}

function normalizeWebsiteLink(origin: string, href: string | undefined) {
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

function canonicalWebsiteUrl(url: string) {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "") || "/"}`;
}

function extractWebsiteLogoUrl(rawHtml: string, websiteUrl: string) {
  const $ = cheerio.load(rawHtml);
  const candidates = [
    $('meta[property="og:logo"]').attr("content"),
    $('meta[name="msapplication-TileImage"]').attr("content"),
    $('link[rel*="apple-touch-icon"]').first().attr("href"),
    $('img[alt*="logo" i]').first().attr("src"),
    $('img[class*="logo" i]').first().attr("src"),
    $('img[src*="logo" i]').first().attr("src"),
    $('img[src*="brand" i]').first().attr("src")
  ];

  for (const candidate of candidates) {
    const url = normalizeLogoUrl(candidate, websiteUrl);
    if (url) return url;
  }
  return null;
}

function normalizeLogoUrl(value: string | undefined, baseUrl: string) {
  if (!value || value.startsWith("data:")) return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function inferUseCases(text: string) {
  const cases = [
    ["meeting", "会议记录"],
    ["interview", "访谈转写"],
    ["lecture", "课堂/讲座"],
    ["sales", "销售沟通"],
    ["podcast", "播客/音频内容"],
    ["collabor", "团队协作"]
  ];
  return cases.filter(([keyword]) => text.toLowerCase().includes(keyword)).map(([, label]) => label);
}

function inferTargetUsers(text: string) {
  const users = [
    ["team", "团队用户"],
    ["business", "商务用户"],
    ["sales", "销售团队"],
    ["student", "学生"],
    ["journalist", "记者/研究者"],
    ["enterprise", "企业客户"]
  ];
  return users.filter(([keyword]) => text.toLowerCase().includes(keyword)).map(([, label]) => label);
}

function inferPlatforms(text: string) {
  const platforms = [
    ["web", "Web"],
    ["ios", "iOS"],
    ["android", "Android"],
    ["zoom", "Zoom"],
    ["google meet", "Google Meet"],
    ["microsoft teams", "Microsoft Teams"]
  ];
  return platforms.filter(([keyword]) => text.toLowerCase().includes(keyword)).map(([, label]) => label);
}
