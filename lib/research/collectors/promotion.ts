import { prisma } from "@/lib/db";
import { getMetaAdLibraryAccessToken } from "@/lib/settings";
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

  const metaAds = await collectMetaAdLibraryAds(taskId, appName, origin || websiteUrl || "https://www.facebook.com/ads/library/");
  items.push(...metaAds);

  const googleAds = await collectGoogleAdsTransparencyAds(taskId, appName, origin);
  items.push(...googleAds);

  return items;
}

type MetaAd = {
  id?: string;
  page_id?: string;
  page_name?: string;
  ad_creative_body?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_title?: string;
  ad_creative_link_titles?: string[];
  ad_creative_link_description?: string;
  ad_creative_link_descriptions?: string[];
  ad_delivery_start_time?: string;
  ad_snapshot_url?: string;
  publisher_platforms?: string[];
  ad_reached_countries?: string[];
};

type GoogleAdsTransparencyResult = {
  advertiser?: {
    advertiser_id?: string;
    name?: string;
    ad_count?: number;
  } | null;
  ads?: GoogleTransparencyAd[];
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

async function collectMetaAdLibraryAds(taskId: string, appName: string, origin: string) {
  const accessToken = await getMetaAdLibraryAccessToken();
  const sourceUrl = "https://www.facebook.com/ads/library/api";
  if (!accessToken) {
    await recordSource({
      taskId,
      sourceType: "META_AD_LIBRARY",
      sourceName: "Meta Ad Library 广告",
      url: sourceUrl,
      status: "PENDING",
      errorMessage: "未配置 Meta Ad Library Access Token。"
    });
    return [];
  }

  const country = (process.env.META_AD_LIBRARY_COUNTRY || "US").toUpperCase();
  const apiVersion = process.env.META_AD_LIBRARY_API_VERSION || "v22.0";
  const params = new URLSearchParams({
    access_token: accessToken,
    search_terms: appName,
    ad_reached_countries: country,
    ad_active_status: "ALL",
    fields:
      "id,page_id,page_name,ad_creative_body,ad_creative_bodies,ad_creative_link_title,ad_creative_link_titles,ad_creative_link_description,ad_creative_link_descriptions,ad_delivery_start_time,ad_snapshot_url,publisher_platforms,ad_reached_countries",
    limit: "25"
  });

  try {
    const response = await fetch(`https://graph.facebook.com/${apiVersion}/ads_archive?${params.toString()}`, {
      signal: AbortSignal.timeout(20_000)
    });
    const payload = (await response.json()) as { data?: MetaAd[]; error?: { message?: string } };
    if (!response.ok || payload.error) {
      throw new Error(payload.error?.message || `Meta Ad Library 请求失败（${response.status}）`);
    }

    const ads = payload.data ?? [];
    await recordSource({
      taskId,
      sourceType: "META_AD_LIBRARY",
      sourceName: "Meta Ad Library 广告",
      url: sourceUrl,
      status: "SUCCESS",
      rawContent: JSON.stringify(ads),
      fetchedAt: new Date()
    });

    const items = [];
    for (const ad of ads) {
      const title = firstText(ad.ad_creative_link_titles, ad.ad_creative_link_title) || ad.page_name || "Meta 广告";
      const body = firstText(ad.ad_creative_bodies, ad.ad_creative_body);
      const description = firstText(ad.ad_creative_link_descriptions, ad.ad_creative_link_description);
      const content = [body, description].filter(Boolean).join(" ") || "暂未获取广告文案";
      const item = await prisma.promotionItem.create({
        data: {
          taskId,
          platform: "Meta Ad Library",
          title,
          content: truncate(content, 1000),
          targetAudience: ad.ad_reached_countries?.join("、") || country,
          useCase: ad.publisher_platforms?.join("、") || "Meta 广告投放",
          sellingPoints: extractSellingPoints(content).join("、") || "暂未结构化提取",
          sourceUrl: ad.ad_snapshot_url || origin,
          publishedAt: ad.ad_delivery_start_time ? new Date(ad.ad_delivery_start_time) : null,
          fetchedAt: new Date()
        }
      });
      items.push(item);
    }

    return items;
  } catch (error) {
    await recordSource({
      taskId,
      sourceType: "META_AD_LIBRARY",
      sourceName: "Meta Ad Library 广告",
      url: sourceUrl,
      status: "FAILED",
      errorMessage: error instanceof Error ? error.message : "Meta Ad Library 采集失败"
    });
    return [];
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

function firstText(values?: string[], value?: string) {
  return values?.find(Boolean) || value || "";
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

function getProcessErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr.trim() : "";
    return stderr || error.message;
  }
  return "Google Ads Transparency 采集失败";
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
