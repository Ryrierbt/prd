import { scrapeAppStore, type AppStoreReview } from "app-store-scraper";
import { prisma } from "@/lib/db";
import { recordSource } from "@/lib/research/collectors/sources";
import { truncate } from "@/lib/research/utils/text";

const reviewFetchLimit = 200;
const reviewSaveLimit = 60;

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
        summary: truncate(app.description, 800)
      },
      create: {
        taskId,
        summary: truncate(app.description, 800),
        positioning: app.title,
        targetUsers: "暂未获取",
        useCases: "暂未获取",
        platforms: "iOS、Web",
        features: "暂未获取"
      }
    });

    await prisma.analysisResult.create({
      data: {
        taskId,
        analysisType: "APP_STORE_SUMMARY",
        resultJson: JSON.stringify({
          trackName: app.title,
          rating: app.score,
          ratingCount: app.reviewCount,
          currentVersionRating: app.currentVersionScore,
          currentVersionRatingCount: app.currentVersionReviewCount,
          version: app.version,
          price: app.price,
          currency: app.currency,
          free: app.free,
          sourceUrl: app.url
        })
      }
    });

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
    const reviewRows = selectHighQualityReviews(result.reviews, reviewSaveLimit).map((review) => {
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

function reviewCountries() {
  const configured = process.env.APP_STORE_REVIEW_COUNTRIES?.split(",").map((country) => country.trim().toLowerCase()).filter(Boolean);
  return configured?.length ? Array.from(new Set(configured)) : ["us"];
}

function reviewPages() {
  const parsed = Number(process.env.APP_STORE_REVIEW_PAGES);
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(1, Math.min(Math.trunc(parsed), 3));
}

function selectHighQualityReviews(reviews: AppStoreReview[], limit: number) {
  return [...reviews]
    .sort((left, right) => reviewTime(right) - reviewTime(left))
    .slice(0, reviewFetchLimit)
    .map((review, index) => ({ review, index, score: reviewQualityScore(review) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map((item) => item.review);
}

function reviewQualityScore(review: AppStoreReview) {
  const text = review.text?.replace(/\s+/g, " ").trim() ?? "";
  const title = review.title?.replace(/\s+/g, " ").trim() ?? "";
  const words = text.toLowerCase().match(/[a-z][a-z'-]{2,}|[\u4e00-\u9fff]/g) ?? [];
  const uniqueWordRatio = words.length ? new Set(words).size / words.length : 0;
  const hasSpecificSignal = /\b(transcri|summary|speaker|export|sync|calendar|crash|bug|slow|price|subscription|cancel|refund|accur|meeting|record|search|support)\b/i.test(
    `${title} ${text}`
  );
  const isGenericShortPraise = /^(great|good|nice|excellent|love it|awesome|perfect|best app)[.! ]*$/i.test(text || title);
  const hasUsefulCategory = review.categories.some((category) => !["好评", "差评", "其他"].includes(category));

  let score = 0;
  score += Math.min(text.length, 900) * 0.08;
  score += Math.min(words.length, 160) * 0.35;
  score += uniqueWordRatio * 12;
  if (title.length >= 8) score += 6;
  if (hasSpecificSignal) score += 14;
  if (hasUsefulCategory) score += 8;
  if (review.score === 1 || review.score === 5) score += 3;
  if (review.updated) score += 2;
  if (review.version) score += 2;
  if (text.length < 25) score -= 18;
  if (isGenericShortPraise) score -= 20;

  return score;
}

function reviewTime(review: AppStoreReview) {
  const time = review.updated ? new Date(review.updated).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}
