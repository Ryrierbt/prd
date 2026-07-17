import { scrapeAppStore } from "app-store-scraper";
import { versionHistory as fetchVersionHistory, type VersionHistory } from "@perttu/app-store-scraper";
import { load } from "cheerio";
import { prisma } from "@/lib/db";
import { selectHighQualityReviewIndexes } from "@/lib/research/analysis/review-quality";
import { recordSource } from "@/lib/research/collectors/sources";
import { truncate } from "@/lib/research/utils/text";

const reviewFetchLimit = 200;
const reviewSaveLimit = 60;
const versionHistoryLimit = 50;
const browserUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function collectAppStore(taskId: string, appName: string, providedUrl?: string | null) {
  try {
    const result = await scrapeAppStore({
      appName,
      appStoreUrl: providedUrl ?? undefined,
      countries: reviewCountries(),
      searchCountry: process.env.APP_STORE_SEARCH_COUNTRY || "us",
      pages: reviewPages(),
      maxReviews: reviewFetchLimit,
      includeRatings: true,
      proxyUrl: process.env.APP_STORE_REVIEW_PROXY_URL || undefined
    });

    const app = result.app;

    await recordSource({
      taskId,
      sourceType: "APP_STORE",
      sourceName: "Apple App Store 应用信息",
      url: app.url,
      status: "SUCCESS",
      rawContent: JSON.stringify(app),
      fetchedAt: new Date()
    });

    await prisma.appProfile.upsert({
      where: { taskId },
      update: {
        platforms: "iOS、Web",
        summary: truncate(app.description, 800),
        iconUrl: app.icon
      },
      create: {
        taskId,
        summary: truncate(app.description, 800),
        positioning: app.title,
        targetUsers: "暂未获取",
        useCases: "暂未获取",
        platforms: "iOS、Web",
        features: "暂未获取",
        iconUrl: app.icon
      }
    });

    const appStoreSummary = {
      trackName: app.title,
      rating: app.score,
      ratingCount: app.reviewCount,
      currentVersionRating: app.currentVersionScore,
      currentVersionRatingCount: app.currentVersionReviewCount,
      version: app.version,
      currentVersionReleaseDate: app.updated,
      releaseNotes: app.releaseNotes,
      released: app.released,
      price: app.price,
      currency: app.currency,
      free: app.free,
      sourceUrl: app.url
    };

    await prisma.analysisResult.create({
      data: {
        taskId,
        analysisType: "APP_STORE_SUMMARY",
        resultJson: JSON.stringify(appStoreSummary)
      }
    });

    const versionHistoryResult = await collectVersionHistory(app.id, result.meta.searchCountry, {
      versionDisplay: app.version,
      releaseDate: app.updated,
      releaseNotes: app.releaseNotes
    });
    await recordSource({
      taskId,
      sourceType: "APP_STORE_VERSION_HISTORY",
      sourceName: "Apple App Store 版本历史记录",
      url: app.url,
      status: versionHistoryResult.items.length ? "SUCCESS" : "FAILED",
      rawContent: versionHistoryResult.items.length ? JSON.stringify(versionHistoryResult) : undefined,
      errorMessage: versionHistoryResult.items.length ? undefined : versionHistoryResult.warning ?? "App Store 版本历史记录采集失败",
      fetchedAt: versionHistoryResult.items.length ? new Date() : undefined
    });
    if (versionHistoryResult.items.length) {
      await prisma.analysisResult.create({
        data: {
          taskId,
          analysisType: "APP_STORE_VERSION_HISTORY",
          resultJson: JSON.stringify(versionHistoryResult)
        }
      });
    }

    if (result.ratings) {
      await recordSource({
        taskId,
        sourceType: "APP_STORE_RATINGS",
        sourceName: "Apple App Store 评分分布",
        url: app.url,
        status: "SUCCESS",
        rawContent: JSON.stringify(result.ratings),
        fetchedAt: new Date()
      });
      await prisma.analysisResult.create({
        data: {
          taskId,
          analysisType: "APP_STORE_RATINGS",
          resultJson: JSON.stringify(result.ratings)
        }
      });
    } else {
      await recordSource({
        taskId,
        sourceType: "APP_STORE_RATINGS",
        sourceName: "Apple App Store 评分分布",
        url: app.url,
        status: "FAILED",
        errorMessage: result.meta.warnings.find((warning) => warning.includes("评分分布")) ?? "App Store 评分分布采集失败"
      });
    }

    if (result.reviews.length === 0) {
      await recordSource({
        taskId,
        sourceType: "APP_STORE_REVIEWS",
        sourceName: "Apple App Store 最近评论",
        url: app.url,
        status: "FAILED",
        errorMessage:
          result.meta.warnings.join("；") ||
          `Apple 公开评论接口在 ${result.meta.triedCountries.join("、")} 区域均返回空列表，未写入任何评论。`
      });
      return [];
    }

    await recordSource({
      taskId,
      sourceType: "APP_STORE_REVIEWS",
      sourceName: "Apple App Store 最近评论",
      url: app.url,
      status: "SUCCESS",
      rawContent: JSON.stringify({
        country: result.meta.reviewCountry,
        triedCountries: result.meta.triedCountries,
        fetchedReviewCount: result.reviews.length,
        selectedReviewCount: Math.min(result.reviews.length, reviewSaveLimit),
        reviews: result.reviews
      }),
      fetchedAt: new Date()
    });

    await prisma.review.deleteMany({ where: { taskId, platform: "Apple App Store" } });
    const selectedReviewIndexes = selectHighQualityReviewIndexes(
      result.reviews.map((review) => ({
        title: review.title,
        content: review.text,
        rating: Number(review.score ?? 0) || null,
        categories: review.categories,
        updated: review.updated,
        version: review.version
      })),
      reviewSaveLimit,
      reviewFetchLimit
    );
    const reviewRows = selectedReviewIndexes.map((index) => result.reviews[index]).map((review) => {
      const rating = Number(review.score ?? 0) || null;
      const content = review.text?.trim() || "";
      return {
        taskId,
        platform: "Apple App Store",
        title: review.title,
        content: content || "暂未获取评论正文",
        rating,
        author: review.userName,
        publishedAt: review.updated ? new Date(review.updated) : null,
        sourceUrl: review.url || app.url,
        sentiment: review.sentiment,
        categories: review.categories.join(",")
      };
    });

    for (const review of reviewRows) {
      await prisma.review.create({ data: review });
    }

    return reviewRows;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "App Store 采集失败";
    await recordSource({
      taskId,
      sourceType: "APP_STORE",
      sourceName: "Apple App Store",
      url: providedUrl ?? "https://itunes.apple.com/search",
      status: "FAILED",
      errorMessage
    });
    await recordSource({
      taskId,
      sourceType: "APP_STORE_REVIEWS",
      sourceName: "Apple App Store 最近评论",
      url: providedUrl ?? "https://itunes.apple.com/search",
      status: "FAILED",
      errorMessage
    });
    return [];
  }
}

type VersionHistoryItem = {
  versionDisplay: string;
  releaseDate: string;
  releaseNotes?: string;
};

async function collectVersionHistory(
  appId: number,
  country: string,
  currentVersion: VersionHistoryItem
): Promise<{ country: string; fullHistory: boolean; items: VersionHistoryItem[]; warning?: string }> {
  const countries = Array.from(new Set([country, ...reviewCountries()]));
  let warning: string | undefined;

  for (const candidateCountry of countries) {
    try {
      const libraryHistory = normalizeVersionHistory(
        await fetchVersionHistory({
          id: appId,
          country: candidateCountry,
          requestOptions: { headers: appStorePageHeaders(candidateCountry) }
        })
      );
      if (libraryHistory.length) {
        return { country: candidateCountry, fullHistory: true, items: libraryHistory.slice(0, versionHistoryLimit) };
      }
    } catch (error) {
      warning = `版本历史库方法失败：${errorMessage(error)}`;
    }

    try {
      const pageHistory = await fetchVersionHistoryFromProductPage(appId, candidateCountry);
      if (pageHistory.length) {
        return { country: candidateCountry, fullHistory: true, items: pageHistory.slice(0, versionHistoryLimit) };
      }
    } catch (error) {
      warning = `版本历史页面解析失败：${errorMessage(error)}`;
    }
  }

  const fallback = normalizeVersionHistory([currentVersion]);
  return {
    country,
    fullHistory: false,
    items: fallback,
    warning: warning ?? "未从 App Store 页面获取到完整版本历史，仅保留当前版本记录。"
  };
}

async function fetchVersionHistoryFromProductPage(appId: number, country: string) {
  const response = await fetch(`https://apps.apple.com/${country}/app/id${appId}`, {
    headers: appStorePageHeaders(country),
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`App Store 应用页请求失败（${response.status}）`);

  const html = await response.text();
  const $ = load(html);
  const serialized = $("#serialized-server-data").text();
  if (!serialized) return [];

  const payload = JSON.parse(serialized);
  const pageData = findVersionHistoryPageData(payload);
  return normalizeVersionHistory(
    collectTitledParagraphs(pageData).map((item) => ({
      versionDisplay: item.primarySubtitle,
      releaseDate: item.secondarySubtitle,
      releaseNotes: item.text
    }))
  );
}

function findVersionHistoryPageData(value: unknown): unknown {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const pageData = nestedPageData(record);
  if (pageData) return pageData;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findVersionHistoryPageData(item);
      if (found) return found;
    }
    return null;
  }

  for (const child of Object.values(record)) {
    const found = findVersionHistoryPageData(child);
    if (found) return found;
  }
  return null;
}

function nestedPageData(record: Record<string, unknown>) {
  const mostRecentVersion = record.mostRecentVersion;
  if (!mostRecentVersion || typeof mostRecentVersion !== "object") return null;
  const seeAllAction = (mostRecentVersion as Record<string, unknown>).seeAllAction;
  if (!seeAllAction || typeof seeAllAction !== "object") return null;
  return (seeAllAction as Record<string, unknown>).pageData ?? null;
}

function collectTitledParagraphs(value: unknown): Array<{ primarySubtitle: string; secondarySubtitle: string; text: string }> {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectTitledParagraphs(item));

  const record = value as Record<string, unknown>;
  const current: Array<{ primarySubtitle: string; secondarySubtitle: string; text: string }> =
    record.$kind === "TitledParagraph"
      ? [
          {
            primarySubtitle: stringValue(record.primarySubtitle),
            secondarySubtitle: stringValue(record.secondarySubtitle),
            text: stringValue(record.text)
          }
        ]
      : [];

  return current.concat(Object.values(record).flatMap((item) => collectTitledParagraphs(item)));
}

function normalizeVersionHistory(items: Array<VersionHistory | VersionHistoryItem>) {
  const seen = new Set<string>();
  return items
    .map((item) => ({
      versionDisplay: stringValue(item.versionDisplay).replace(/^版本\s*/u, "").trim(),
      releaseDate: normalizeDateString(item.releaseDate),
      releaseNotes: stringValue(item.releaseNotes).trim() || undefined
    }))
    .filter((item) => item.versionDisplay && item.releaseDate)
    .filter((item) => {
      const key = `${item.versionDisplay}:${item.releaseDate}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeDateString(value?: string) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function appStorePageHeaders(country: string) {
  const language = country === "cn" ? "zh-CN,zh;q=0.9" : "en-US,en;q=0.9";
  return {
    "User-Agent": browserUserAgent,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": language
  };
}

function reviewCountries() {
  const configured = process.env.APP_STORE_REVIEW_COUNTRIES?.split(",").map((country) => country.trim().toLowerCase()).filter(Boolean);
  return configured?.length ? Array.from(new Set(configured)) : ["us"];
}

function reviewPages() {
  const parsed = Number(process.env.APP_STORE_REVIEW_PAGES);
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(1, Math.min(Math.trunc(parsed), 3));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
