import { prisma } from "@/lib/db";
import { collectAppStore } from "@/lib/research/collectors/app-store";
import { collectGooglePlay } from "@/lib/research/collectors/google-play";
import { summarizeCommunityWithDeepSeek, summarizeCustomerSegmentsWithDeepSeek, summarizeFeatureAnalysisWithDeepSeek, summarizePricingBenefitsWithDeepSeek, summarizePromotionPainPointFitWithDeepSeek, summarizePromotionWithDeepSeek, summarizeReviewsWithDeepSeek, translateAppProfileWithDeepSeek } from "@/lib/research/analysis/deepseek";
import { collectCommunityDiscussions } from "@/lib/research/collectors/community";
import { collectPricing } from "@/lib/research/collectors/pricing";
import { collectPromotion } from "@/lib/research/collectors/promotion";
import { collectWebsite, inferWebsiteUrl } from "@/lib/research/collectors/website";
import { generateResearchReport } from "@/lib/research/report/html-generator";
import { statusLabels, taskStatuses, type TaskStatus } from "@/lib/research/status";

async function updateTask(taskId: string, status: TaskStatus, progress: number, errorMessage?: string | null) {
  await prisma.researchTask.update({
    where: { id: taskId },
    data: {
      status,
      progress,
      currentStep: statusLabels[status],
      startedAt: status === taskStatuses.identifying ? new Date() : undefined,
      errorMessage
    }
  });
}

export async function runResearchTask(taskId: string) {
  const task = await prisma.researchTask.findUniqueOrThrow({ where: { id: taskId } });
  await resetTaskData(taskId);

  await updateTask(taskId, taskStatuses.identifying, 8, null);
  const websiteUrl = inferWebsiteUrl(task.appName, task.websiteUrl);

  await updateTask(taskId, taskStatuses.collectingWebsite, 22, null);
  await collectWebsite(taskId, task.appName, websiteUrl);

  await updateTask(taskId, taskStatuses.collectingPricing, 40, null);
  await collectPricing(taskId, websiteUrl);
  await summarizePricingBenefitsWithDeepSeek(taskId);

  await updateTask(taskId, taskStatuses.collectingReviews, 58, null);
  await collectAppStore(taskId, task.appName, task.appStoreUrl);
  await collectGooglePlay(taskId, task.appName, task.googlePlayUrl);
  await translateAppProfileWithDeepSeek(taskId);
  await summarizeReviewsWithDeepSeek(taskId);

  await updateTask(taskId, taskStatuses.collectingCommunity, 66, null);
  await collectCommunityDiscussions(taskId, task.appName, task.keywords);
  await summarizeCommunityWithDeepSeek(taskId);

  await updateTask(taskId, taskStatuses.collectingPromotion, 76, null);
  await collectPromotion(taskId, websiteUrl, task.appName);
  await summarizePromotionWithDeepSeek(taskId);
  await summarizePromotionPainPointFitWithDeepSeek(taskId);
  await summarizeCustomerSegmentsWithDeepSeek(taskId);
  await summarizeFeatureAnalysisWithDeepSeek(taskId);

  await updateTask(taskId, taskStatuses.analyzing, 88, null);
  await createRollupAnalysis(taskId);

  await updateTask(taskId, taskStatuses.generatingReport, 96, null);
  await regenerateReportAndFinalize(taskId);
}

export async function runFailedSourcesRetry(taskId: string) {
  const task = await prisma.researchTask.findUniqueOrThrow({
    where: { id: taskId },
    include: { sources: true }
  });
  const failedTypes = new Set(task.sources.filter((source) => source.status === "FAILED").map((source) => source.sourceType));

  if (failedTypes.size === 0) {
    await regenerateReportAndFinalize(taskId);
    return;
  }

  const websiteUrl = inferWebsiteUrl(task.appName, task.websiteUrl);
  const retryWebsite = failedTypes.has("WEBSITE");
  const retryPricing = failedTypes.has("PRICING");
  const retryAppStore = ["APP_STORE", "APP_STORE_RATINGS", "APP_STORE_REVIEWS"].some((type) => failedTypes.has(type));
  const retryGooglePlay = ["GOOGLE_PLAY", "GOOGLE_PLAY_RATINGS", "GOOGLE_PLAY_REVIEWS"].some((type) => failedTypes.has(type));
  const retryCommunity = failedTypes.has("COMMUNITY_YOUTUBE");
  const retryPromotion = ["PROMOTION", "FACEBOOK_ADS_LIBRARY", "GOOGLE_ADS_TRANSPARENCY", "GOOGLE_ADS_OCR"].some((type) => failedTypes.has(type));

  if (retryWebsite) {
    await prisma.source.deleteMany({ where: { taskId, sourceType: "WEBSITE" } });
    await updateTask(taskId, taskStatuses.collectingWebsite, 22, null);
    await collectWebsite(taskId, task.appName, websiteUrl);
  }

  if (retryPricing) {
    await prisma.source.deleteMany({ where: { taskId, sourceType: "PRICING" } });
    await updateTask(taskId, taskStatuses.collectingPricing, 40, null);
    await collectPricing(taskId, websiteUrl);
    await summarizePricingBenefitsWithDeepSeek(taskId);
  }

  if (retryAppStore) {
    await prisma.source.deleteMany({
      where: { taskId, sourceType: { in: ["APP_STORE", "APP_STORE_RATINGS", "APP_STORE_REVIEWS"] } }
    });
    await updateTask(taskId, taskStatuses.collectingReviews, 58, null);
    await collectAppStore(taskId, task.appName, task.appStoreUrl);
  }

  if (retryGooglePlay) {
    await prisma.source.deleteMany({
      where: { taskId, sourceType: { in: ["GOOGLE_PLAY", "GOOGLE_PLAY_RATINGS", "GOOGLE_PLAY_REVIEWS"] } }
    });
    await updateTask(taskId, taskStatuses.collectingReviews, 58, null);
    await collectGooglePlay(taskId, task.appName, task.googlePlayUrl);
  }

  if (retryCommunity) {
    await prisma.$transaction([
      prisma.source.deleteMany({ where: { taskId, sourceType: { in: ["COMMUNITY_YOUTUBE", "COMMUNITY_REDDIT"] } } }),
      prisma.communityItem.deleteMany({ where: { taskId } }),
      prisma.analysisResult.deleteMany({ where: { taskId, analysisType: { in: ["DEEPSEEK_COMMUNITY_SUMMARY", "DEEPSEEK_COMMUNITY_SUMMARY_ERROR"] } } })
    ]);
    await updateTask(taskId, taskStatuses.collectingCommunity, 66, null);
    await collectCommunityDiscussions(taskId, task.appName, task.keywords);
    await summarizeCommunityWithDeepSeek(taskId);
  }

  if (retryAppStore || retryGooglePlay) {
    await translateAppProfileWithDeepSeek(taskId);
    await summarizeReviewsWithDeepSeek(taskId);
  }

  if (retryPromotion) {
    await prisma.source.deleteMany({
      where: {
        taskId,
        sourceType: { in: ["PROMOTION", "FACEBOOK_ADS_LIBRARY", "GOOGLE_ADS_TRANSPARENCY", "GOOGLE_ADS_OCR"] }
      }
    });
    await updateTask(taskId, taskStatuses.collectingPromotion, 74, null);
    await collectPromotion(taskId, websiteUrl, task.appName);
    await summarizePromotionWithDeepSeek(taskId);
  }

  if (retryAppStore || retryGooglePlay || retryPromotion) {
    await summarizePromotionPainPointFitWithDeepSeek(taskId);
  }

  await updateTask(taskId, taskStatuses.analyzing, 88, null);
  await summarizeCustomerSegmentsWithDeepSeek(taskId);
  await summarizeFeatureAnalysisWithDeepSeek(taskId);
  await prisma.analysisResult.deleteMany({ where: { taskId, analysisType: "ROLLUP" } });
  await createRollupAnalysis(taskId);

  await updateTask(taskId, taskStatuses.generatingReport, 96, null);
  await regenerateReportAndFinalize(taskId);
}

export async function runReviewSourcesRetry(taskId: string) {
  const task = await prisma.researchTask.findUniqueOrThrow({ where: { id: taskId }, include: { sources: true } });
  const failedTypes = new Set(task.sources.filter((source) => source.status === "FAILED").map((source) => source.sourceType));
  const retryAppStore = ["APP_STORE", "APP_STORE_RATINGS", "APP_STORE_REVIEWS"].some((type) => failedTypes.has(type));
  const retryGooglePlay = ["GOOGLE_PLAY", "GOOGLE_PLAY_RATINGS", "GOOGLE_PLAY_REVIEWS"].some((type) => failedTypes.has(type));

  if (!retryAppStore && !retryGooglePlay) {
    await regenerateReportAndFinalize(taskId);
    return;
  }

  await updateTask(taskId, taskStatuses.collectingReviews, 58, null);
  if (retryAppStore) {
    await prisma.$transaction([
      prisma.source.deleteMany({ where: { taskId, sourceType: { in: ["APP_STORE", "APP_STORE_RATINGS", "APP_STORE_REVIEWS"] } } }),
      prisma.review.deleteMany({ where: { taskId, platform: "Apple App Store" } })
    ]);
    await collectAppStore(taskId, task.appName, task.appStoreUrl);
  }
  if (retryGooglePlay) {
    await prisma.$transaction([
      prisma.source.deleteMany({ where: { taskId, sourceType: { in: ["GOOGLE_PLAY", "GOOGLE_PLAY_RATINGS", "GOOGLE_PLAY_REVIEWS"] } } }),
      prisma.review.deleteMany({ where: { taskId, platform: "Google Play Store" } })
    ]);
    await collectGooglePlay(taskId, task.appName, task.googlePlayUrl);
  }

  await translateAppProfileWithDeepSeek(taskId);
  await summarizeReviewsWithDeepSeek(taskId);
  await summarizePromotionPainPointFitWithDeepSeek(taskId);
  await prisma.analysisResult.deleteMany({ where: { taskId, analysisType: "ROLLUP" } });
  await createRollupAnalysis(taskId);
  await updateTask(taskId, taskStatuses.generatingReport, 96, null);
  await regenerateReportAndFinalize(taskId);
}

async function regenerateReportAndFinalize(taskId: string) {
  const taskWithData = await prisma.researchTask.findUniqueOrThrow({
    where: { id: taskId },
    include: {
      sources: true,
      appProfile: true,
      pricingPlans: true,
      reviews: true,
      promotions: true,
      communityItems: true,
      analyses: true
    }
  });
  const htmlContent = generateResearchReport(taskWithData);
  await prisma.report.upsert({
    where: { taskId },
    update: { htmlContent, createdAt: new Date() },
    create: { taskId, htmlContent }
  });

  const sourceTypes = new Set(taskWithData.sources.filter((source) => source.status === "SUCCESS").map((source) => source.sourceType));
  const coreSuccessCount = ["WEBSITE", "PRICING", "APP_STORE_REVIEWS", "GOOGLE_PLAY_REVIEWS", "COMMUNITY_YOUTUBE", "PROMOTION"].filter((type) => sourceTypes.has(type)).length;
  const failedCount = taskWithData.sources.filter((source) => source.status === "FAILED").length;
  const finalStatus = coreSuccessCount >= 3 && failedCount === 0 ? taskStatuses.completed : taskStatuses.partial;
  const errorMessage =
    finalStatus === taskStatuses.partial
      ? `部分完成：成功采集 ${coreSuccessCount}/6 类核心来源，失败来源 ${failedCount} 个。`
      : null;

  await prisma.researchTask.update({
    where: { id: taskId },
    data: {
      status: finalStatus,
      progress: 100,
      currentStep: statusLabels[finalStatus],
      completedAt: new Date(),
      errorMessage
    }
  });
}

async function resetTaskData(taskId: string) {
  await prisma.$transaction([
    prisma.source.deleteMany({ where: { taskId } }),
    prisma.pricingPlan.deleteMany({ where: { taskId } }),
    prisma.review.deleteMany({ where: { taskId } }),
    prisma.promotionItem.deleteMany({ where: { taskId } }),
    prisma.communityItem.deleteMany({ where: { taskId } }),
    prisma.analysisResult.deleteMany({ where: { taskId } }),
    prisma.report.deleteMany({ where: { taskId } })
  ]);
}

async function createRollupAnalysis(taskId: string) {
  const [sources, reviews, pricingPlans, promotions, communityItems] = await Promise.all([
    prisma.source.findMany({ where: { taskId } }),
    prisma.review.findMany({ where: { taskId } }),
    prisma.pricingPlan.findMany({ where: { taskId } }),
    prisma.promotionItem.findMany({ where: { taskId } }),
    prisma.communityItem.findMany({ where: { taskId } })
  ]);

  const reviewCategories = reviews.reduce<Record<string, number>>((acc, review) => {
    const categories = review.categories?.split(",").map((item) => item.trim()).filter(Boolean) ?? ["其他"];
    for (const category of categories) {
      acc[category] = (acc[category] ?? 0) + 1;
    }
    return acc;
  }, {});

  await prisma.analysisResult.create({
    data: {
      taskId,
      analysisType: "ROLLUP",
      resultJson: JSON.stringify({
        sourceCount: sources.length,
        successfulSourceCount: sources.filter((source) => source.status === "SUCCESS").length,
        failedSourceCount: sources.filter((source) => source.status === "FAILED").length,
        reviewCount: reviews.length,
        reviewCategories,
        pricingPlanCount: pricingPlans.length,
        promotionItemCount: promotions.length,
        communityItemCount: communityItems.length,
        generatedAt: new Date().toISOString()
      })
    }
  });
}
