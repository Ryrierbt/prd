import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { taskStatuses } from "@/lib/research/status";
import { startAnalysisAndReport } from "@/lib/task-service";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await prisma.researchTask.findUnique({ where: { id }, select: { id: true } });

  if (!task) {
    return NextResponse.json({ ok: false, error: "任务不存在。" }, { status: 404 });
  }

  await prisma.researchTask.update({
    where: { id },
    data: {
      status: taskStatuses.analyzing,
      progress: 88,
      currentStep: "等待 AI 分析",
      errorMessage: null,
      completedAt: null
    }
  });
  await startAnalysisAndReport(id);
  return NextResponse.json({ ok: true });
}
