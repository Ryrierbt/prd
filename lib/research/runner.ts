import { prisma } from "@/lib/db";
import { collectAppStore } from "@/lib/research/collectors/app-store";
import { collectGooglePlay } from "@/lib/research/collectors/google-play";
import { summarizeCommunityWithDeepSeek, summarizeCustomerSegmentsWithDeepSeek, summarizeFeatureAnalysisWithDeepSeek, summarizeGoogleResearchWithDeepSeek, summarizePricingBenefitsWithDeepSeek, summarizePromotionPainPointFitWithDeepSeek, summarizePromotionWithDeepSeek, summarizeReviewsWithDeepSeek, translateAppProfileWithDeepSeek } from "@/lib/research/analysis/deepseek";
import { collectCommunityDiscussions } from "@/lib/research/collectors/community";
import { collectPricing } from "@/lib/research/collectors/pricing";
import { collectPromotion } from "@/lib/research/collectors/promotion";
import { collectWebsite, inferWebsiteUrl } from "@/lib/research/collectors/website";
import { collectGoogleResearch, googleResearchSourceTypes } from "@/lib/research/collectors/google-research";
import { generateResearchReport } from "@/lib/research/report/html-generator";
import { statusLabels, taskStatuses, type TaskStatus } from "@/lib/research/status";

const appStoreSourceTypes = ["APP_STORE", "APP_STORE_VERSION_HISTORY", "APP_STORE_RATINGS", "APP_STORE_REVIEWS"];
const googlePlaySourceTypes = ["GOOGLE_PLAY", "GOOGLE_PLAY_RATINGS", "GOOGLE_PLAY_REVIEWS"];
const communitySourceTypes = ["COMMUNITY_YOUTUBE", "COMMUNITY_TIKTOK", "COMMUNITY_REDDIT"];
export const selectableRecollectSources = ["app_store", "google_play", "google_research", "google_ads", "meta_ads", "tiktok", "youtube", "reddit"] as const;
export type SelectableRecollectSource = (typeof selectableRecollectSources)[number];

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

  await updateTask(taskId, taskStatuses.collectingGoogle, 30, null);
  await collectGoogleResearch(taskId, task.appName, websiteUrl);

  await updateTask(taskId, taskStatuses.collectingPricing, 40, null);
  await collectPricing(taskId, websiteUrl);

  await updateTask(taskId, taskStatuses.collectingReviews, 58, null);
  await collectAppStore(taskId, task.appName, task.appStoreUrl);
  await collectGooglePlay(taskId, task.appName, task.googlePlayUrl);

  await updateTask(taskId, taskStatuses.collectingCommunity, 66, null);
  await collectCommunityDiscussions(taskId, task.appName, task.keywords, { websiteUrl });

  await updateTask(taskId, taskStatuses.collectingPromotion, 76, null);
  await collectPromotion(taskId, websiteUrl, task.appName);

  await pauseAfterCollectionOrAnalyze(taskId);
}

export async function runAnalysisAndReport(taskId: string) {
  await updateTask(taskId, taskStatuses.analyzing, 88, null);
  await summarizePricingBenefitsWithDeepSeek(taskId);
  await translateAppProfileWithDeepSeek(taskId);
  await summarizeReviewsWithDeepSeek(taskId);
  await summarizeCommunityWithDeepSeek(taskId);
  await summarizePromotionWithDeepSeek(taskId);
  await summarizePromotionPainPointFitWithDeepSeek(taskId);
  await summarizeCustomerSegmentsWithDeepSeek(taskId);
  await summarizeFeatureAnalysisWithDeepSeek(taskId);
  await summarizeGoogleResearchWithDeepSeek(taskId);
  await prisma.analysisResult.deleteMany({ where: { taskId, analysisType: "ROLLUP" } });
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
    await runAnalysisAndReport(taskId);
    return;
  }

  const websiteUrl = inferWebsiteUrl(task.appName, task.websiteUrl);
  const retryWebsite = failedTypes.has("WEBSITE");
  const retryGoogleResearch = Object.values(googleResearchSourceTypes).some((type) => failedTypes.has(type));
  const retryPricing = failedTypes.has("PRICING");
  const retryAppStore = appStoreSourceTypes.some((type) => failedTypes.has(type));
  const retryGooglePlay = googlePlaySourceTypes.some((type) => failedTypes.has(type));
  const retryCommunity = communitySourceTypes.some((type) => failedTypes.has(type));
  const retryPromotion = ["PROMOTION", "FACEBOOK_ADS_LIBRARY", "GOOGLE_ADS_TRANSPARENCY", "GOOGLE_ADS_OCR"].some((type) => failedTypes.has(type));

  if (retryWebsite) {
    await prisma.source.deleteMany({ where: { taskId, sourceType: "WEBSITE" } });
    await updateTask(taskId, taskStatuses.collectingWebsite, 22, null);
    await collectWebsite(taskId, task.appName, websiteUrl);
  }

  if (retryGoogleResearch) {
    await prisma.$transaction([
      prisma.source.deleteMany({ where: { taskId, sourceType: { in: Object.values(googleResearchSourceTypes) } } }),
      prisma.googleResearchItem.deleteMany({ where: { taskId } }),
      prisma.analysisResult.deleteMany({ where: { taskId, analysisType: { startsWith: "DEEPSEEK_GOOGLE_RESEARCH_" } } })
    ]);
    await updateTask(taskId, taskStatuses.collectingGoogle, 30, null);
    await collectGoogleResearch(taskId, task.appName, websiteUrl);
  }

  if (retryPricing) {
    await prisma.source.deleteMany({ where: { taskId, sourceType: "PRICING" } });
    await updateTask(taskId, taskStatuses.collectingPricing, 40, null);
    await collectPricing(taskId, websiteUrl, { reuseExistingWebsite: true });
  }

  if (retryAppStore) {
    await prisma.source.deleteMany({
      where: { taskId, sourceType: { in: appStoreSourceTypes } }
    });
    await updateTask(taskId, taskStatuses.collectingReviews, 58, null);
    await collectAppStore(taskId, task.appName, task.appStoreUrl);
  }

  if (retryGooglePlay) {
    await prisma.source.deleteMany({
      where: { taskId, sourceType: { in: googlePlaySourceTypes } }
    });
    await updateTask(taskId, taskStatuses.collectingReviews, 58, null);
    await collectGooglePlay(taskId, task.appName, task.googlePlayUrl);
  }

  if (retryCommunity) {
    await prisma.$transaction([
      prisma.source.deleteMany({ where: { taskId, sourceType: { in: communitySourceTypes } } }),
      prisma.communityItem.deleteMany({ where: { taskId } }),
      prisma.analysisResult.deleteMany({ where: { taskId, analysisType: { in: ["DEEPSEEK_COMMUNITY_SUMMARY", "DEEPSEEK_COMMUNITY_SUMMARY_ERROR"] } } })
    ]);
    await updateTask(taskId, taskStatuses.collectingCommunity, 66, null);
    await collectCommunityDiscussions(taskId, task.appName, task.keywords, { websiteUrl, reuseExistingWebsite: true });
  }

  if (retryPromotion) {
    await prisma.source.deleteMany({
      where: {
        taskId,
        sourceType: { in: ["PROMOTION", "FACEBOOK_ADS_LIBRARY", "GOOGLE_ADS_TRANSPARENCY", "GOOGLE_ADS_OCR"] }
      }
    });
    await updateTask(taskId, taskStatuses.collectingPromotion, 74, null);
    await collectPromotion(taskId, websiteUrl, task.appName, { reuseExistingWebsite: true });
  }

  await pauseAfterCollectionOrAnalyze(taskId);
}

export async function runReviewSourcesRetry(taskId: string) {
  const task = await prisma.researchTask.findUniqueOrThrow({ where: { id: taskId }, include: { sources: true } });
  const failedTypes = new Set(task.sources.filter((source) => source.status === "FAILED").map((source) => source.sourceType));
  const retryAppStore = appStoreSourceTypes.some((type) => failedTypes.has(type));
  const retryGooglePlay = googlePlaySourceTypes.some((type) => failedTypes.has(type));

  if (!retryAppStore && !retryGooglePlay) {
    await runAnalysisAndReport(taskId);
    return;
  }

  await updateTask(taskId, taskStatuses.collectingReviews, 58, null);
  if (retryAppStore) {
    await prisma.$transaction([
      prisma.source.deleteMany({ where: { taskId, sourceType: { in: appStoreSourceTypes } } }),
      prisma.review.deleteMany({ where: { taskId, platform: "Apple App Store" } })
    ]);
    await collectAppStore(taskId, task.appName, task.appStoreUrl);
  }
  if (retryGooglePlay) {
    await prisma.$transaction([
      prisma.source.deleteMany({ where: { taskId, sourceType: { in: googlePlaySourceTypes } } }),
      prisma.review.deleteMany({ where: { taskId, platform: "Google Play Store" } })
    ]);
    await collectGooglePlay(taskId, task.appName, task.googlePlayUrl);
  }

  await pauseAfterCollectionOrAnalyze(taskId);
}

export async function runSelectedSourcesRetry(taskId: string, sources: SelectableRecollectSource[]) {
  const selected = new Set(sources);
  if (!selected.size) {
    await runAnalysisAndReport(taskId);
    return;
  }

  const task = await prisma.researchTask.findUniqueOrThrow({ where: { id: taskId } });
  const websiteUrl = inferWebsiteUrl(task.appName, task.websiteUrl);

  if (selected.has("app_store")) {
    await prisma.$transaction([
      prisma.source.deleteMany({ where: { taskId, sourceType: { in: appStoreSourceTypes } } }),
      prisma.review.deleteMany({ where: { taskId, platform: "Apple App Store" } }),
      prisma.analysisResult.deleteMany({
        where: {
          taskId,
          analysisType: { in: ["APP_STORE_SUMMARY", "APP_STORE_RATINGS", "APP_STORE_VERSION_HISTORY", "DEEPSEEK_REVIEW_SUMMARY", "DEEPSEEK_REVIEW_SUMMARY_ERROR"] }
        }
      })
    ]);
    await updateTask(taskId, taskStatuses.collectingReviews, 58, null);
    await collectAppStore(taskId, task.appName, task.appStoreUrl);
  }

  if (selected.has("google_play")) {
    await prisma.$transaction([
      prisma.source.deleteMany({ where: { taskId, sourceType: { in: googlePlaySourceTypes } } }),
      prisma.review.deleteMany({ where: { taskId, platform: "Google Play Store" } }),
      prisma.analysisResult.deleteMany({
        where: { taskId, analysisType: { in: ["GOOGLE_PLAY_SUMMARY", "GOOGLE_PLAY_RATINGS", "DEEPSEEK_REVIEW_SUMMARY", "DEEPSEEK_REVIEW_SUMMARY_ERROR"] } }
      })
    ]);
    await updateTask(taskId, taskStatuses.collectingReviews, 58, null);
    await collectGooglePlay(taskId, task.appName, task.googlePlayUrl);
  }

  if (selected.has("google_research")) {
    await prisma.$transaction([
      prisma.source.deleteMany({ where: { taskId, sourceType: { in: Object.values(googleResearchSourceTypes) } } }),
      prisma.googleResearchItem.deleteMany({ where: { taskId } }),
      prisma.analysisResult.deleteMany({ where: { taskId, analysisType: { startsWith: "DEEPSEEK_GOOGLE_RESEARCH_" } } })
    ]);
    await updateTask(taskId, taskStatuses.collectingGoogle, 30, null);
    await collectGoogleResearch(taskId, task.appName, websiteUrl);
  }

  if (selected.has("youtube")) {
    await prisma.$transaction([
      prisma.source.deleteMany({ where: { taskId, sourceType: "COMMUNITY_YOUTUBE" } }),
      prisma.communityItem.deleteMany({ where: { taskId, platform: "YouTube" } }),
      prisma.analysisResult.deleteMany({ where: { taskId, analysisType: { in: ["DEEPSEEK_COMMUNITY_SUMMARY", "DEEPSEEK_COMMUNITY_SUMMARY_ERROR"] } } })
    ]);
    await updateTask(taskId, taskStatuses.collectingCommunity, 66, null);
    await collectCommunityDiscussions(taskId, task.appName, task.keywords, { youtube: true, reddit: false, tiktok: false, websiteUrl, reuseExistingWebsite: true });
  }

  if (selected.has("tiktok")) {
    await prisma.$transaction([
      prisma.source.deleteMany({ where: { taskId, sourceType: "COMMUNITY_TIKTOK" } }),
      prisma.communityItem.deleteMany({ where: { taskId, platform: "TikTok" } }),
      prisma.analysisResult.deleteMany({ where: { taskId, analysisType: { in: ["DEEPSEEK_COMMUNITY_SUMMARY", "DEEPSEEK_COMMUNITY_SUMMARY_ERROR"] } } })
    ]);
    await updateTask(taskId, taskStatuses.collectingCommunity, 66, null);
    await collectCommunityDiscussions(taskId, task.appName, task.keywords, { youtube: false, reddit: false, tiktok: true, websiteUrl, reuseExistingWebsite: true });
  }

  if (selected.has("reddit")) {
    await prisma.$transaction([
      prisma.source.deleteMany({ where: { taskId, sourceType: "COMMUNITY_REDDIT" } }),
      prisma.communityItem.deleteMany({ where: { taskId, platform: "Reddit" } }),
      prisma.analysisResult.deleteMany({ where: { taskId, analysisType: { in: ["DEEPSEEK_COMMUNITY_SUMMARY", "DEEPSEEK_COMMUNITY_SUMMARY_ERROR"] } } })
    ]);
    await updateTask(taskId, taskStatuses.collectingCommunity, 66, null);
    await collectCommunityDiscussions(taskId, task.appName, task.keywords, { youtube: false, reddit: true, tiktok: false, websiteUrl, reuseExistingWebsite: true });
  }

  if (selected.has("google_ads")) {
    await prisma.$transaction([
      prisma.source.deleteMany({ where: { taskId, sourceType: { in: ["GOOGLE_ADS_TRANSPARENCY", "GOOGLE_ADS_OCR"] } } }),
      prisma.promotionItem.deleteMany({ where: { taskId, platform: "Google Ads Transparency" } }),
      prisma.analysisResult.deleteMany({
        where: {
          taskId,
          analysisType: { in: ["DEEPSEEK_PROMOTION_SUMMARY", "DEEPSEEK_PROMOTION_SUMMARY_ERROR", "DEEPSEEK_PROMOTION_PAIN_POINT_FIT", "DEEPSEEK_PROMOTION_PAIN_POINT_FIT_ERROR"] }
        }
      })
    ]);
    await updateTask(taskId, taskStatuses.collectingPromotion, 76, null);
    await collectPromotion(taskId, websiteUrl, task.appName, { official: false, meta: false, google: true, reuseExistingWebsite: true });
  }

  if (selected.has("meta_ads")) {
    await prisma.$transaction([
      prisma.source.deleteMany({ where: { taskId, sourceType: "FACEBOOK_ADS_LIBRARY" } }),
      prisma.promotionItem.deleteMany({ where: { taskId, platform: "Facebook Ads Library" } }),
      prisma.analysisResult.deleteMany({
        where: {
          taskId,
          analysisType: { in: ["DEEPSEEK_PROMOTION_SUMMARY", "DEEPSEEK_PROMOTION_SUMMARY_ERROR", "DEEPSEEK_PROMOTION_PAIN_POINT_FIT", "DEEPSEEK_PROMOTION_PAIN_POINT_FIT_ERROR"] }
        }
      })
    ]);
    await updateTask(taskId, taskStatuses.collectingPromotion, 76, null);
    await collectPromotion(taskId, websiteUrl, task.appName, { official: false, meta: true, google: false, reuseExistingWebsite: true });
  }

  await pauseAfterCollectionOrAnalyze(taskId);
}

async function pauseAfterCollectionOrAnalyze(taskId: string) {
  const failedSources = await prisma.source.findMany({
    where: { taskId, status: "FAILED" },
    select: { sourceName: true }
  });

  if (failedSources.length) {
    const sourceNames = failedSources.map((source) => source.sourceName).join("、");
    await prisma.researchTask.update({
      where: { id: taskId },
      data: {
        status: taskStatuses.collectionReview,
        progress: 82,
        currentStep: statusLabels[taskStatuses.collectionReview],
        completedAt: null,
        errorMessage: `采集已完成，但有 ${failedSources.length} 个来源失败：${sourceNames}。请选择“采集缺失内容”或“继续 AI 分析”。`
      }
    });
    return;
  }

  await runAnalysisAndReport(taskId);
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
      googleResearchItems: true,
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
  const hasCommunitySuccess = communitySourceTypes.some((type) => sourceTypes.has(type));
  const coreSuccessCount =
    ["WEBSITE", "PRICING", "APP_STORE_REVIEWS", "GOOGLE_PLAY_REVIEWS", "PROMOTION"].filter((type) => sourceTypes.has(type)).length +
    (hasCommunitySuccess ? 1 : 0);
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
    prisma.googleResearchItem.deleteMany({ where: { taskId } }),
    prisma.analysisResult.deleteMany({ where: { taskId } }),
    prisma.report.deleteMany({ where: { taskId } })
  ]);
}

async function createRollupAnalysis(taskId: string) {
  const [sources, reviews, pricingPlans, promotions, communityItems, googleResearchItems] = await Promise.all([
    prisma.source.findMany({ where: { taskId } }),
    prisma.review.findMany({ where: { taskId } }),
    prisma.pricingPlan.findMany({ where: { taskId } }),
    prisma.promotionItem.findMany({ where: { taskId } }),
    prisma.communityItem.findMany({ where: { taskId } }),
    prisma.googleResearchItem.findMany({ where: { taskId } })
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
        googleResearchItemCount: googleResearchItems.length,
        generatedAt: new Date().toISOString()
      })
    }
  });
}
