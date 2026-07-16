import { prisma } from "@/lib/db";
import { recordSource } from "@/lib/research/collectors/sources";
import { fetchText } from "@/lib/research/utils/fetcher";
import { getOriginUrl, joinUrl, parseHtmlPage, splitSentences, truncate, uniqueValues } from "@/lib/research/utils/text";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const promotionPaths = ["/", "/features", "/pricing", "/blog", "/customers"];
const execFileAsync = promisify(execFile);

export async function collectPromotion(taskId: string, websiteUrl: string | null, appName: string) {
  await prisma.promotionItem.deleteMany({ where: { taskId } });

  if (!websiteUrl) {
    await recordSource({
      taskId,
      sourceType: "PROMOTION",
      sourceName: "推广内容",
      url: "about:blank",
      status: "FAILED",
      errorMessage: "缺少官网地址，无法采集官方推广内容。"
    });
  }

  const origin = websiteUrl ? getOriginUrl(websiteUrl) : null;
  const items = [];

  if (origin) {
    for (const path of promotionPaths) {
      const url = joinUrl(origin, path);
      try {
        const rawHtml = await fetchText(url, { retries: 0, timeoutMs: 12000 });
        const page = parseHtmlPage(url, rawHtml);
        const sellingPoints = extractSellingPoints(page.text);
        const content = [page.title, page.description, ...splitSentences(page.text, 4)].filter(Boolean).join(" ");

        await recordSource({
          taskId,
          sourceType: "PROMOTION",
          sourceName: path === "/" ? "官网首页营销内容" : `官方页面 ${path}`,
          url,
          status: "SUCCESS",
          rawContent: `${page.title}\n${page.description}\n${page.text}`,
          fetchedAt: page.fetchedAt
        });

        const item = await prisma.promotionItem.create({
          data: {
            taskId,
            platform: "Official Website",
            title: page.title || `官方页面 ${path}`,
            content: truncate(content, 1000),
            targetAudience: inferAudience(page.text).join("、") || "暂未获取",
            useCase: inferUseCase(page.text).join("、") || "暂未获取",
            sellingPoints: sellingPoints.join("、") || "暂未获取",
            sourceUrl: url,
            fetchedAt: page.fetchedAt
          }
        });
        items.push(item);
      } catch (error) {
        await recordSource({
          taskId,
          sourceType: "PROMOTION",
          sourceName: path === "/" ? "官网首页营销内容" : `官方页面 ${path}`,
          url,
          status: "FAILED",
          errorMessage: error instanceof Error ? error.message : "推广页面采集失败"
        });
      }
    }
  }

  const facebookAds = await collectFacebookAdsLibraryAds(taskId, appName, origin || websiteUrl || "https://www.facebook.com/ads/library/");
  items.push(...facebookAds);

  const googleAds = await collectGoogleAdsTransparencyAds(taskId, appName, origin);
  items.push(...googleAds);

  return items;
}

type GoogleAdsTransparencyResult = {
  advertiser?: {
    advertiser_id?: string;
    name?: string;
    ad_count?: number;
  } | null;
  ads?: GoogleTransparencyAd[];
};

type FacebookAdsScraperResult = {
  source?: string;
  country?: string;
  ads?: FacebookAdsScraperAd[];
};

type FacebookAdsScraperAd = {
  ad_archive_id?: string | number | null;
  page_name?: string | null;
  page_profile_uri?: string | null;
  publisher_platform?: string[];
  snapshot?: {
    body?: {
      text?: string;
    };
    cta_text?: string;
    images?: Array<{ original_image_url?: string }>;
  };
  start_date?: string | number | null;
  end_date?: string | number | null;
  categories?: string[];
  ad_snapshot_url?: string | null;
  destination_url?: string | null;
  link_title?: string;
  link_description?: string;
};

type GoogleTransparencyAd = {
  advertiser_id?: string;
  creative_id?: string;
  format?: string;
  last_shown?: string;
  advertiser_name?: string;
  content?: {
    preview_url?: string;
    headline?: string;
    description?: string;
    destination_url?: string;
    image_url?: string;
    local_image_url?: string;
    local_html_url?: string;
    ocr_text?: string;
    ocr_error?: string;
    asset_error?: string;
    video_url?: string;
  };
};

async function collectFacebookAdsLibraryAds(taskId: string, appName: string, origin: string) {
  const sourceUrl = "https://www.facebook.com/ads/library/";
  const country = (process.env.FACEBOOK_ADS_SCRAPER_COUNTRY || "US").toUpperCase();
  const rawLimit = normalizeLimit(process.env.FACEBOOK_ADS_RAW_LIMIT, 30);
  const finalLimit = normalizeLimit(process.env.FACEBOOK_ADS_SCRAPER_LIMIT, 20);
  const scrollRounds = normalizeLimit(process.env.FACEBOOK_ADS_SCROLL_ROUNDS, 30);
  const scriptPath = path.join(process.cwd(), "scripts", "facebook_ads_library_scraper.py");
  const pythonCommand = process.env.FACEBOOK_ADS_SCRAPER_PYTHON || "python3";
  const browserProfile = process.env.FACEBOOK_ADS_BROWSER_PROFILE || "";
  const headful = process.env.FACEBOOK_ADS_BROWSER_HEADFUL === "1" || process.env.FACEBOOK_ADS_BROWSER_HEADFUL?.toLowerCase() === "true";
  const args = [
    scriptPath,
    "--app-name",
    appName,
    "--country",
    country,
    "--limit",
    String(rawLimit),
    "--scroll-rounds",
    String(scrollRounds)
  ];
  if (browserProfile) args.push("--browser-profile", browserProfile);
  if (headful) args.push("--headful");

  try {
    const { stdout } = await execFileAsync(pythonCommand, args, {
      timeout: 180_000,
      maxBuffer: 1024 * 1024
    });
    const payload = JSON.parse(stdout) as FacebookAdsScraperResult;
    const ads = payload.ads ?? [];
    const matchedAds = filterFacebookAdsForTarget(ads, appName, origin);
    const filteredAds = await enrichFacebookAdsDetails(
      pythonCommand,
      scriptPath,
      matchedAds.slice(0, finalLimit),
      country,
      browserProfile,
      headful
    );
    await recordSource({
      taskId,
      sourceType: "FACEBOOK_ADS_LIBRARY",
      sourceName: "Facebook Ads Library Scraper 广告",
      url: sourceUrl,
      status: "SUCCESS",
      rawContent: JSON.stringify({
        ...payload,
        filter: {
          fetchedCount: ads.length,
          matchedCount: matchedAds.length,
          keptCount: filteredAds.length,
          rawLimit,
          finalLimit,
          appName,
          domain: hostnameFromUrl(origin)
        },
        ads: filteredAds
      }),
      fetchedAt: new Date()
    });

    const items = [];
    for (const ad of filteredAds) {
      const title = ad.link_title || ad.page_name || "Facebook 广告";
      const content = facebookAdContent(ad) || "暂未获取广告文案";
      const sourceUrl = normalizeAdUrl(ad.destination_url || ad.ad_snapshot_url || facebookAdLibraryUrl(ad.ad_archive_id) || ad.page_profile_uri || "", origin);
      const item = await prisma.promotionItem.create({
        data: {
          taskId,
          platform: "Facebook Ads Library",
          title: truncate(title, 200),
          content: truncate(content, 1000),
          targetAudience: ad.categories?.join("、") || payload.country || country,
          useCase: ad.publisher_platform?.join("、") || "Facebook/Instagram 广告投放",
          sellingPoints: extractSellingPoints(content).join("、") || "暂未结构化提取",
          sourceUrl,
          publishedAt: parseAdDate(ad.start_date),
          fetchedAt: new Date()
        }
      });
      items.push(item);
    }

    return items;
  } catch (error) {
    await recordSource({
      taskId,
      sourceType: "FACEBOOK_ADS_LIBRARY",
      sourceName: "Facebook Ads Library Scraper 广告",
      url: sourceUrl,
      status: "FAILED",
      errorMessage: getProcessErrorMessage(error, "Facebook Ads Library Scraper 采集失败")
    });
    return [];
  }
}

async function enrichFacebookAdsDetails(
  pythonCommand: string,
  scriptPath: string,
  ads: FacebookAdsScraperAd[],
  country: string,
  browserProfile: string,
  headful: boolean
) {
  if (!ads.length) return ads;
  const args = [
    scriptPath,
    "--country",
    country,
    "--limit",
    String(ads.length),
    "--ads-json",
    JSON.stringify(ads)
  ];
  if (browserProfile) args.push("--browser-profile", browserProfile);
  if (headful) args.push("--headful");

  try {
    const { stdout } = await execFileAsync(pythonCommand, args, {
      timeout: 300_000,
      maxBuffer: 1024 * 1024
    });
    const payload = JSON.parse(stdout) as FacebookAdsScraperResult;
    return payload.ads?.length ? payload.ads : ads;
  } catch {
    return ads;
  }
}

async function collectGoogleAdsTransparencyAds(taskId: string, appName: string, origin: string | null) {
  const sourceUrl = "https://adstransparency.google.com/";
  const scriptPath = path.join(process.cwd(), "scripts", "google_ads_transparency.py");
  const pythonCommand = process.env.GOOGLE_ADS_TRANSPARENCY_PYTHON || "python3";
  const region = process.env.GOOGLE_ADS_TRANSPARENCY_REGION || "anywhere";
  const limit = normalizeLimit(process.env.GOOGLE_ADS_TRANSPARENCY_LIMIT, 20);
  const domain = origin ? new URL(origin).hostname.replace(/^www\./, "") : "";
  const assetUrlPrefix = `/ad-assets/${taskId}`;
  const assetDir = path.join(process.cwd(), "public", "ad-assets", taskId);
  const args = [
    scriptPath,
    "--app-name",
    appName,
    "--region",
    region,
    "--limit",
    String(limit),
    "--format",
    "image",
    "--asset-dir",
    assetDir,
    "--asset-url-prefix",
    assetUrlPrefix,
    "--ocr"
  ];
  if (domain) args.push("--domain", domain);

  try {
    const { stdout } = await execFileAsync(pythonCommand, args, {
      timeout: 180_000,
      maxBuffer: 1024 * 1024
    });
    const payload = JSON.parse(stdout) as GoogleAdsTransparencyResult;
    const ads = payload.ads ?? [];

    await recordSource({
      taskId,
      sourceType: "GOOGLE_ADS_TRANSPARENCY",
      sourceName: "Google Ads Transparency 广告",
      url: sourceUrl,
      status: "SUCCESS",
      rawContent: JSON.stringify(payload),
      fetchedAt: new Date()
    });

    const ocrTextCount = ads.filter((ad) => ad.content?.ocr_text?.trim()).length;
    const ocrIssue = ads.find((ad) => ad.content?.ocr_error || ad.content?.asset_error)?.content;
    await recordSource({
      taskId,
      sourceType: "GOOGLE_ADS_OCR",
      sourceName: "Google 图片广告 OCR",
      url: assetUrlPrefix,
      status: ocrTextCount ? "SUCCESS" : ads.length ? "PENDING" : "FAILED",
      rawContent: JSON.stringify({
        adCount: ads.length,
        ocrTextCount,
        firstIssue: ocrIssue?.ocr_error || ocrIssue?.asset_error || null
      }),
      errorMessage: ocrTextCount ? undefined : ocrIssue?.ocr_error || ocrIssue?.asset_error || "未识别到图片广告文字"
    });

    const items = [];
    for (const ad of ads) {
      const content = googleAdContent(ad);
      const title =
        ad.content?.headline ||
        payload.advertiser?.name ||
        ad.advertiser_name ||
        `${ad.format || "Google"} 广告`;
      const item = await prisma.promotionItem.create({
        data: {
          taskId,
          platform: "Google Ads Transparency",
          title: truncate(title, 200),
          content: truncate(content || "暂未获取广告文案", 1000),
          targetAudience: region === "anywhere" ? "全球/未限定地区" : region,
          useCase: ad.format ? `${ad.format} 广告素材` : "Google 广告投放",
          sellingPoints: extractSellingPoints(content).join("、") || "暂未结构化提取",
          sourceUrl: normalizeAdUrl(ad.content?.local_image_url || ad.content?.local_html_url || ad.content?.destination_url || ad.content?.preview_url || ad.content?.image_url || ad.content?.video_url, sourceUrl),
          publishedAt: ad.last_shown ? new Date(ad.last_shown) : null,
          fetchedAt: new Date()
        }
      });
      items.push(item);
    }

    return items;
  } catch (error) {
    await recordSource({
      taskId,
      sourceType: "GOOGLE_ADS_TRANSPARENCY",
      sourceName: "Google Ads Transparency 广告",
      url: sourceUrl,
      status: "FAILED",
      errorMessage: getProcessErrorMessage(error)
    });
    return [];
  }
}

function googleAdContent(ad: GoogleTransparencyAd) {
  return [
    ad.content?.local_image_url ? `本地图片：${ad.content.local_image_url}` : "",
    ad.content?.local_html_url ? `本地HTML素材：${ad.content.local_html_url}` : "",
    ad.content?.ocr_text ? `OCR文字：${ad.content.ocr_text}` : "",
    ad.content?.ocr_error ? `OCR失败：${ad.content.ocr_error}` : "",
    ad.content?.asset_error ? `素材下载失败：${ad.content.asset_error}` : "",
    ad.content?.headline,
    ad.content?.description,
    ad.content?.destination_url ? `目标链接：${ad.content.destination_url}` : "",
    ad.content?.image_url ? `图片素材：${ad.content.image_url}` : "",
    ad.content?.video_url ? `视频素材：${ad.content.video_url}` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function facebookAdContent(ad: FacebookAdsScraperAd) {
  return [
    ad.snapshot?.body?.text,
    ad.link_title,
    ad.link_description,
    ad.snapshot?.cta_text ? `CTA：${ad.snapshot.cta_text}` : "",
    ad.destination_url ? `目标链接：${ad.destination_url}` : "",
    ...(ad.snapshot?.images?.map((image) => (image.original_image_url ? `图片素材：${image.original_image_url}` : "")) ?? [])
  ]
    .filter(Boolean)
    .join(" ");
}

function filterFacebookAdsForTarget(ads: FacebookAdsScraperAd[], appName: string, origin: string) {
  const domain = hostnameFromUrl(origin);
  const rootDomain = domain ? rootDomainFromHost(domain) : "";
  const appTokens = nameTokens(appName);
  const primaryTokens = appTokens.filter((token) => !genericNameTokens.has(token));
  const matchTokens = primaryTokens.length ? primaryTokens : appTokens;

  const matched = ads.filter((ad) => facebookAdMatchesTarget(ad, matchTokens, rootDomain));
  return matched.length ? matched : [];
}

function facebookAdMatchesTarget(ad: FacebookAdsScraperAd, appTokens: string[], rootDomain: string) {
  const pageTokens = nameTokens(ad.page_name || "");
  if (appTokens.length && tokensMatch(pageTokens, appTokens)) return true;

  const searchableText = [
    ad.page_name,
    ad.page_profile_uri,
    ad.destination_url,
    ad.ad_snapshot_url,
    ad.link_title,
    ad.link_description,
    ad.snapshot?.body?.text,
    ...(ad.snapshot?.images?.map((image) => image.original_image_url) ?? [])
  ]
    .filter(Boolean)
    .join(" ");

  if (rootDomain && textContainsRootDomain(searchableText, rootDomain)) return true;
  return false;
}

function tokensMatch(pageTokens: string[], appTokens: string[]) {
  if (!pageTokens.length || !appTokens.length) return false;
  const pageSet = new Set(pageTokens);
  if (appTokens.every((token) => pageSet.has(token))) return true;
  const distinctiveTokens = appTokens.filter((token) => token.length >= 4);
  return distinctiveTokens.length > 0 && distinctiveTokens.every((token) => pageSet.has(token));
}

const genericNameTokens = new Set(["ai", "app", "inc", "llc", "co", "com", "the"]);

function nameTokens(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function hostnameFromUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, "").toLowerCase();
    return ignoredFacebookHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`)) ? "" : hostname;
  } catch {
    return "";
  }
}

const ignoredFacebookHosts = ["facebook.com", "fbcdn.net", "instagram.com", "threads.net"];

function rootDomainFromHost(hostname: string) {
  const parts = hostname.split(".").filter(Boolean);
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join(".");
}

function textContainsRootDomain(text: string, rootDomain: string) {
  if (!text || !rootDomain) return false;
  const lower = text.toLowerCase();
  if (lower.includes(rootDomain)) return true;
  const rootName = rootDomain.split(".")[0];
  if (rootName.length < 4) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(rootName)}([^a-z0-9]|$)`, "i").test(lower);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function facebookAdLibraryUrl(value: string | number | null | undefined) {
  if (!value) return "";
  return `https://www.facebook.com/ads/library/?id=${encodeURIComponent(String(value))}`;
}

function parseAdDate(value: string | number | null | undefined) {
  if (!value) return null;
  if (typeof value === "number") {
    const time = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(time);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function getProcessErrorMessage(error: unknown, fallback = "采集失败") {
  if (error instanceof Error) {
    const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr.trim() : "";
    return stderr || error.message;
  }
  return fallback;
}

function normalizeLimit(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.trunc(parsed), 50));
}

function normalizeAdUrl(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[\w.-]+\.[a-z]{2,}/i.test(value)) return `https://${value}`;
  return fallback;
}

function extractSellingPoints(text: string) {
  const points = [
    ["AI", "AI 能力"],
    ["summary", "自动总结"],
    ["transcription", "实时转写"],
    ["productivity", "效率提升"],
    ["collabor", "团队协作"],
    ["security", "安全"],
    ["privacy", "隐私"],
    ["accurate", "准确率"],
    ["free", "免费试用/免费版"]
  ];
  return uniqueValues(points.filter(([keyword]) => text.toLowerCase().includes(keyword.toLowerCase())).map(([, label]) => label));
}

function inferAudience(text: string) {
  const audiences = [
    ["sales", "销售团队"],
    ["business", "商务人士"],
    ["enterprise", "企业客户"],
    ["student", "学生"],
    ["journalist", "记者/研究者"],
    ["team", "团队"]
  ];
  return uniqueValues(audiences.filter(([keyword]) => text.toLowerCase().includes(keyword)).map(([, label]) => label));
}

function inferUseCase(text: string) {
  const useCases = [
    ["meeting", "会议"],
    ["interview", "访谈"],
    ["lecture", "课程"],
    ["conversation", "对话记录"],
    ["webinar", "线上活动"],
    ["podcast", "音频内容"]
  ];
  return uniqueValues(useCases.filter(([keyword]) => text.toLowerCase().includes(keyword)).map(([, label]) => label));
}
