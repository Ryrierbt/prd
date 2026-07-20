import { prisma } from "@/lib/db";
import { createTaskSchema, type CreateTaskInput } from "@/lib/validators";
import { taskStatuses } from "@/lib/research/status";
import { runAnalysisAndReport, runFailedSourcesRetry, runResearchTask, runReviewSourcesRetry, runSelectedSourcesRetry, type SelectableRecollectSource } from "@/lib/research/runner";

const runningTasks = new Set<string>();

export async function createResearchTask(input: CreateTaskInput) {
  const data = createTaskSchema.parse(input);
  const recentDuplicate = await prisma.researchTask.findFirst({
    where: {
      appName: data.appName,
      status: {
        in: [
          taskStatuses.waiting,
          taskStatuses.identifying,
          taskStatuses.collectingWebsite,
          taskStatuses.collectingGoogle,
          taskStatuses.collectingPricing,
          taskStatuses.collectingReviews,
          taskStatuses.collectingCommunity,
          taskStatuses.collectingPromotion,
          taskStatuses.collectionReview,
          taskStatuses.analyzing,
          taskStatuses.generatingReport
        ]
      }
    },
    orderBy: { createdAt: "desc" }
  });

  if (recentDuplicate) {
    const updateData = {
      ...(data.websiteUrl ? { websiteUrl: data.websiteUrl } : {}),
      ...(data.appStoreUrl ? { appStoreUrl: data.appStoreUrl } : {}),
      ...(data.googlePlayUrl ? { googlePlayUrl: data.googlePlayUrl } : {}),
      ...(data.keywords ? { keywords: data.keywords } : {})
    };

    return Object.keys(updateData).length
      ? prisma.researchTask.update({
          where: { id: recentDuplicate.id },
          data: updateData
        })
      : recentDuplicate;
  }

  return prisma.researchTask.create({
    data: {
      appName: data.appName,
      websiteUrl: data.websiteUrl,
      appStoreUrl: data.appStoreUrl,
      googlePlayUrl: data.googlePlayUrl,
      keywords: data.keywords
    }
  });
}

export async function startResearchTask(taskId: string) {
  if (runningTasks.has(taskId)) {
    return;
  }

  runningTasks.add(taskId);
  runResearchTask(taskId)
    .catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : "未知错误";
      await prisma.researchTask.update({
        where: { id: taskId },
        data: {
          status: taskStatuses.failed,
          currentStep: "任务失败",
          errorMessage: message,
          completedAt: new Date()
        }
      });
    })
    .finally(() => {
      runningTasks.delete(taskId);
    });
}

export async function startFailedSourcesRetry(taskId: string) {
  if (runningTasks.has(taskId)) {
    return;
  }

  runningTasks.add(taskId);
  runFailedSourcesRetry(taskId)
    .catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : "未知错误";
      await prisma.researchTask.update({
        where: { id: taskId },
        data: {
          status: taskStatuses.partial,
          currentStep: "失败项重试失败",
          errorMessage: message,
          completedAt: new Date()
        }
      });
    })
    .finally(() => {
      runningTasks.delete(taskId);
    });
}

export async function startReviewSourcesRetry(taskId: string) {
  if (runningTasks.has(taskId)) {
    return;
  }

  runningTasks.add(taskId);
  runReviewSourcesRetry(taskId)
    .catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : "未知错误";
      await prisma.researchTask.update({
        where: { id: taskId },
        data: {
          status: taskStatuses.partial,
          currentStep: "评论重新采集失败",
          errorMessage: message,
          completedAt: new Date()
        }
      });
    })
    .finally(() => {
      runningTasks.delete(taskId);
    });
}

export async function startSelectedSourcesRetry(taskId: string, sources: SelectableRecollectSource[]) {
  if (runningTasks.has(taskId)) {
    return;
  }

  runningTasks.add(taskId);
  runSelectedSourcesRetry(taskId, sources)
    .catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : "未知错误";
      await prisma.researchTask.update({
        where: { id: taskId },
        data: {
          status: taskStatuses.partial,
          currentStep: "定向重新采集失败",
          errorMessage: message,
          completedAt: new Date()
        }
      });
    })
    .finally(() => {
      runningTasks.delete(taskId);
    });
}

export async function startAnalysisAndReport(taskId: string) {
  if (runningTasks.has(taskId)) {
    return;
  }

  runningTasks.add(taskId);
  runAnalysisAndReport(taskId)
    .catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : "未知错误";
      await prisma.researchTask.update({
        where: { id: taskId },
        data: {
          status: taskStatuses.partial,
          currentStep: "AI 分析或报告生成失败",
          errorMessage: message,
          completedAt: new Date()
        }
      });
    })
    .finally(() => {
      runningTasks.delete(taskId);
    });
}
