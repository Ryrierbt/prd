import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { taskStatuses } from "@/lib/research/status";
import { startReviewSourcesRetry } from "@/lib/task-service";

const reviewSourceTypes = ["APP_STORE", "APP_STORE_RATINGS", "APP_STORE_REVIEWS", "GOOGLE_PLAY", "GOOGLE_PLAY_RATINGS", "GOOGLE_PLAY_REVIEWS"];

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const failedCount = await prisma.source.count({ where: { taskId: id, status: "FAILED", sourceType: { in: reviewSourceTypes } } });
  if (!failedCount) {
    return NextResponse.json({ ok: false, error: "当前任务没有缺失的评论来源。" }, { status: 400 });
  }

  await prisma.researchTask.update({
    where: { id },
    data: { status: taskStatuses.waiting, progress: 0, currentStep: "等待重新采集评论", errorMessage: null, completedAt: null }
  });
  await startReviewSourcesRetry(id);
  return NextResponse.json({ ok: true });
}
