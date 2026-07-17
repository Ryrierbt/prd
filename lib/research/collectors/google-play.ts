import gplay from "google-play-scraper";
import { prisma } from "@/lib/db";
import { classifyReview } from "@/lib/research/analysis/reviews";
import { selectHighQualityReviewIndexes } from "@/lib/research/analysis/review-quality";
import { recordSource } from "@/lib/research/collectors/sources";

const reviewFetchLimit = 200;
const reviewSaveLimit = 60;
const googlePlayNewestSort = 2;

export async function collectGooglePlay(taskId: string, appName: string, providedUrl?: string | null) {
  const country = (process.env.GOOGLE_PLAY_COUNTRY || "us").toLowerCase();
  const lang = (process.env.GOOGLE_PLAY_LANGUAGE || "en").toLowerCase();

  try {
    const appId = parseGooglePlayAppId(providedUrl) ?? (await findGooglePlayAppId(appName, country, lang));
    const [app, reviewResult] = await Promise.all([
      gplay.app({ appId, country, lang }),
      gplay.reviews({ appId, country, lang, sort: googlePlayNewestSort, num: reviewFetchLimit })
    ]);
    const reviews = reviewResult.data ?? [];

    await recordSource({
      taskId,
      sourceType: "GOOGLE_PLAY",
      sourceName: "Google Play 应用信息",
      url: app.url,
      status: "SUCCESS",
      rawContent: JSON.stringify({
        appId: app.appId,
        title: app.title,
        developer: app.developer,
        summary: app.summary,
        description: app.description,
        recentChanges: app.recentChanges,
        genre: app.genre,
        score: app.score,
        ratings: app.ratings,
        url: app.url
      })
    });
    await prisma.analysisResult.create({
      data: {
        taskId,
        analysisType: "GOOGLE_PLAY_SUMMARY",
        resultJson: JSON.stringify({
          appId: app.appId,
          trackName: app.title,
          summary: app.summary,
          description: app.description,
          recentChanges: app.recentChanges,
          genre: app.genre,
          rating: app.score,
          ratingCount: app.ratings,
          sourceUrl: app.url
        })
      }
    });

    await recordSource({
      taskId,
      sourceType: "GOOGLE_PLAY_RATINGS",
      sourceName: "Google Play 评分分布",
      url: app.url,
      status: "SUCCESS",
      rawContent: JSON.stringify(app.histogram ?? {})
    });
    await prisma.analysisResult.create({
      data: { taskId, analysisType: "GOOGLE_PLAY_RATINGS", resultJson: JSON.stringify(app.histogram ?? {}) }
    });

    if (!reviews.length) {
      await recordSource({
        taskId,
        sourceType: "GOOGLE_PLAY_REVIEWS",
        sourceName: "Google Play 最近评论",
        url: app.url,
        status: "FAILED",
        errorMessage: "Google Play 未返回可用评论。"
      });
      return [];
    }

    const classifiedReviews = reviews.map((review) => ({
      review,
      classification: classifyReview(review.text || "", review.score)
    }));
    const selectedIndexes = selectHighQualityReviewIndexes(
      classifiedReviews.map(({ review, classification }) => ({
        title: review.title,
        content: review.text,
        rating: review.score,
        categories: classification.categories,
        updated: review.date,
        version: review.version
      })),
      reviewSaveLimit,
      reviewFetchLimit
    );
    const selectedReviews = selectedIndexes.map((index) => classifiedReviews[index]);

    await recordSource({
      taskId,
      sourceType: "GOOGLE_PLAY_REVIEWS",
      sourceName: "Google Play 最近评论",
      url: app.url,
      status: "SUCCESS",
      rawContent: JSON.stringify({ country, fetchedReviewCount: reviews.length, selectedReviewCount: selectedReviews.length })
    });

    await prisma.review.deleteMany({ where: { taskId, platform: "Google Play Store" } });
    const reviewRows = selectedReviews.map(({ review, classification }) => ({
      taskId,
      platform: "Google Play Store",
      title: review.title || null,
      content: review.text?.trim() || "暂未获取评论正文",
      rating: Number(review.score ?? 0) || null,
      author: review.userName || null,
      publishedAt: review.date ? new Date(review.date) : null,
      sourceUrl: app.url,
      sentiment: classification.sentiment,
      categories: classification.categories.join(",")
    }));
    for (const review of reviewRows) {
      await prisma.review.create({ data: review });
    }
    return reviewRows;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Google Play 采集失败";
    const url = providedUrl || "https://play.google.com/store/apps";
    await recordSource({ taskId, sourceType: "GOOGLE_PLAY", sourceName: "Google Play 应用信息", url, status: "FAILED", errorMessage });
    await recordSource({ taskId, sourceType: "GOOGLE_PLAY_REVIEWS", sourceName: "Google Play 最近评论", url, status: "FAILED", errorMessage });
    return [];
  }
}

function parseGooglePlayAppId(url?: string | null) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith("play.google.com") ? parsed.searchParams.get("id") : null;
  } catch {
    return null;
  }
}

async function findGooglePlayAppId(appName: string, country: string, lang: string) {
  const results = await gplay.search({ term: appName, country, lang, num: 10 });
  const normalizedName = appName.toLowerCase();
  const selected = results.find((app) => app.title?.toLowerCase() === normalizedName) ?? results.find((app) => app.title?.toLowerCase().includes(normalizedName)) ?? results[0];
  if (!selected?.appId) throw new Error(`Google Play 未找到应用：${appName}`);
  return selected.appId;
}
