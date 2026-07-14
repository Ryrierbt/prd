import { prisma } from "@/lib/db";
import { createTaskSchema, type CreateTaskInput } from "@/lib/validators";
import { taskStatuses } from "@/lib/research/status";
import { runResearchTask } from "@/lib/research/runner";

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
          taskStatuses.collectingPricing,
          taskStatuses.collectingReviews,
          taskStatuses.collectingPromotion,
          taskStatuses.analyzing,
          taskStatuses.generatingReport
        ]
      }
    },
    orderBy: { createdAt: "desc" }
  });

  if (recentDuplicate) {
    return recentDuplicate;
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

