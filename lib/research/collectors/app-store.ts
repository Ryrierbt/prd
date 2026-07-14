import store from "app-store-scraper";
import { reviews as fetchModernAppStoreReviews, sort as modernReviewSort } from "@perttu/app-store-scraper";
import { prisma } from "@/lib/db";
import { classifyReview } from "@/lib/research/analysis/reviews";
import { recordSource } from "@/lib/research/collectors/sources";
import { truncate } from "@/lib/research/utils/text";

type AppleStoreApp = {
  id: number;
  title: string;
  url: string;
  description?: string;
  score?: number;
  reviews?: number;
  currentVersionScore?: number;
  currentVersionReviews?: number;
  price?: number;
  currency?: string;
  free?: boolean;
  version?: string;
  updated?: string;
  released?: string;
  genres?: string[];
  developer?: string;
};

type AppleStoreReview = {
  id: string;
  userName?: string;
  userUrl?: string;
  version?: string;
  score?: number;
  title?: string;
  text?: string;
  url?: string;
  updated?: string;
};

type AppleStoreRatings = {
  ratings?: number;
  histogram?: Record<string, number>;
};

export async function collectAppStore(taskId: string, appName: string, providedUrl?: string | null) {
  let reviewsSourceRecorded = false;

  try {
    const app = await findAppStoreApp(appName, providedUrl);
    if (!app) {
      await recordSource({
        taskId,
        sourceType: "APP_STORE",
        sourceName: "Apple App Store",
        url: providedUrl ?? "https://itunes.apple.com/search",
        status: "FAILED",
        errorMessage: "未找到匹配的 App Store 应用。"
      });
      return [];
    }

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
          ratingCount: app.reviews,
          currentVersionRating: app.currentVersionScore,
          currentVersionRatingCount: app.currentVersionReviews,
          version: app.version,
          price: app.price,
          currency: app.currency,
          free: app.free,
          sourceUrl: app.url
        })
      }
    });

    try {
      const ratings = (await store.ratings({ id: app.id, country: "us" })) as AppleStoreRatings;
      await recordSource({
        taskId,
        sourceType: "APP_STORE_RATINGS",
        sourceName: "Apple App Store 评分分布",
        url: app.url,
        status: "SUCCESS",
        rawContent: JSON.stringify(ratings),
        fetchedAt: new Date()
      });
      await prisma.analysisResult.create({
        data: {
          taskId,
          analysisType: "APP_STORE_RATINGS",
          resultJson: JSON.stringify(ratings)
        }
      });
    } catch (error) {
      await recordSource({
        taskId,
        sourceType: "APP_STORE_RATINGS",
        sourceName: "Apple App Store 评分分布",
        url: app.url,
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "App Store 评分分布采集失败"
      });
    }

    const reviewCollection = await collectRecentReviews(app.id);
    const reviews = reviewCollection.reviews;

    if (reviews.length === 0) {
      await recordSource({
        taskId,
        sourceType: "APP_STORE_REVIEWS",
        sourceName: "Apple App Store 最近评论",
        url: app.url,
        status: "FAILED",
        errorMessage: reviewCollection.errorMessage ?? "Apple 公开评论接口连续 3 次返回空列表，未写入任何评论。"
      });
      reviewsSourceRecorded = true;
      return [];
    }

    await recordSource({
        taskId,
        sourceType: "APP_STORE_REVIEWS",
        sourceName: "Apple App Store 最近评论",
        url: app.url,
      status: "SUCCESS",
      rawContent: JSON.stringify(reviews),
      fetchedAt: new Date()
    });
    reviewsSourceRecorded = true;

    await prisma.review.deleteMany({ where: { taskId, platform: "Apple App Store" } });
    const reviewRows = reviews.slice(0, 40).map((review) => {
      const rating = Number(review.score ?? 0) || null;
      const content = review.text?.trim() || "";
      const classified = classifyReview(content, rating);
      return {
        taskId,
        platform: "Apple App Store",
        title: review.title,
        content: content || "暂未获取评论正文",
        rating,
        author: review.userName,
        publishedAt: review.updated ? new Date(review.updated) : null,
        sourceUrl: review.url ?? app.url,
        sentiment: classified.sentiment,
        categories: classified.categories.join(",")
      };
    });

    for (const review of reviewRows) {
      await prisma.review.create({ data: review });
    }

    return reviewRows;
  } catch (error) {
    if (!reviewsSourceRecorded) {
      await recordSource({
        taskId,
        sourceType: "APP_STORE_REVIEWS",
        sourceName: "Apple App Store 最近评论",
        url: providedUrl ?? "https://itunes.apple.com/search",
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "App Store 采集失败"
      });
    }
    return [];
  }
}

async function collectRecentReviews(appId: number) {
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const reviews = (await fetchModernAppStoreReviews({
        id: appId,
        country: "us",
        page: 1,
        sort: modernReviewSort.RECENT
      })) as AppleStoreReview[];

      if (reviews.length) return { reviews, errorMessage: null };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "App Store 评论请求失败";
    }

    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return {
    reviews: [] as AppleStoreReview[],
    errorMessage: lastError ? `App Store 评论请求连续 3 次失败：${lastError}` : null
  };
}

async function findAppStoreApp(appName: string, providedUrl?: string | null) {
  const providedId = providedUrl?.match(/id(\d+)/)?.[1];
  if (providedId) {
    return (await store.app({ id: Number(providedId), country: "us", ratings: true })) as AppleStoreApp;
  }

  const results = (await store.search({ term: appName, num: 8, page: 1, country: "us" })) as AppleStoreApp[];
  const normalized = appName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const match =
    results.find((result) => result.title.toLowerCase().replace(/[^a-z0-9]/g, "").includes(normalized)) ?? results[0];

  return match ? ((await store.app({ id: match.id, country: "us", ratings: true })) as AppleStoreApp) : null;
}
