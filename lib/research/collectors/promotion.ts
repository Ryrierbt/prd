import { prisma } from "@/lib/db";
import { getMetaAdLibraryAccessToken } from "@/lib/settings";
import { recordSource } from "@/lib/research/collectors/sources";
import { fetchText } from "@/lib/research/utils/fetcher";
import { getOriginUrl, joinUrl, parseHtmlPage, splitSentences, truncate, uniqueValues } from "@/lib/research/utils/text";

const promotionPaths = ["/", "/features", "/pricing", "/blog", "/customers"];

export async function collectPromotion(taskId: string, websiteUrl: string | null, appName: string) {
  if (!websiteUrl) {
    await recordSource({
      taskId,
      sourceType: "PROMOTION",
      sourceName: "推广内容",
      url: "about:blank",
      status: "FAILED",
      errorMessage: "缺少官网地址，无法采集官方推广内容。"
    });
    return [];
  }

  const origin = getOriginUrl(websiteUrl);
  if (!origin) return [];

  await prisma.promotionItem.deleteMany({ where: { taskId } });
  const items = [];

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

  const metaAds = await collectMetaAdLibraryAds(taskId, appName, origin);
  items.push(...metaAds);

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

function firstText(values?: string[], value?: string) {
  return values?.find(Boolean) || value || "";
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
