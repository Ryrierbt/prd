import { prisma } from "@/lib/db";
import { collectAppStore } from "@/lib/research/collectors/app-store";
import { summarizePricingBenefitsWithDeepSeek, summarizeReviewsWithDeepSeek, translateAppProfileWithDeepSeek } from "@/lib/research/analysis/deepseek";
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
  await translateAppProfileWithDeepSeek(taskId);
  await summarizeReviewsWithDeepSeek(taskId);

  await updateTask(taskId, taskStatuses.collectingPromotion, 74, null);
  await collectPromotion(taskId, websiteUrl);

  await updateTask(taskId, taskStatuses.analyzing, 88, null);
  await createRollupAnalysis(taskId);

  await updateTask(taskId, taskStatuses.generatingReport, 96, null);
  const taskWithData = await prisma.researchTask.findUniqueOrThrow({
    where: { id: taskId },
    include: {
      sources: true,
      appProfile: true,
      pricingPlans: true,
      reviews: true,
      promotions: true,
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
  const coreSuccessCount = ["WEBSITE", "PRICING", "APP_STORE_REVIEWS", "PROMOTION"].filter((type) => sourceTypes.has(type)).length;
  const failedCount = taskWithData.sources.filter((source) => source.status === "FAILED").length;
  const finalStatus = coreSuccessCount >= 3 && failedCount === 0 ? taskStatuses.completed : taskStatuses.partial;
  const errorMessage =
    finalStatus === taskStatuses.partial
      ? `部分完成：成功采集 ${coreSuccessCount}/4 类核心来源，失败来源 ${failedCount} 个。`
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
    prisma.analysisResult.deleteMany({ where: { taskId } }),
    prisma.report.deleteMany({ where: { taskId } })
  ]);
}

async function createRollupAnalysis(taskId: string) {
  const [sources, reviews, pricingPlans, promotions] = await Promise.all([
    prisma.source.findMany({ where: { taskId } }),
    prisma.review.findMany({ where: { taskId } }),
    prisma.pricingPlan.findMany({ where: { taskId } }),
    prisma.promotionItem.findMany({ where: { taskId } })
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
        generatedAt: new Date().toISOString()
      })
    }
  });
}
