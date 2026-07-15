import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { taskStatuses } from "@/lib/research/status";
import { startFailedSourcesRetry } from "@/lib/task-service";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const failedCount = await prisma.source.count({
    where: {
      taskId: id,
      status: "FAILED"
    }
  });

  if (failedCount === 0) {
    return NextResponse.json({ ok: false, error: "当前任务没有失败的数据来源。" }, { status: 400 });
  }

  await prisma.researchTask.update({
    where: { id },
    data: {
      status: taskStatuses.waiting,
      progress: 0,
      currentStep: "等待重试失败项",
      errorMessage: null,
      completedAt: null
    }
  });
  await startFailedSourcesRetry(id);
  return NextResponse.json({ ok: true });
}

