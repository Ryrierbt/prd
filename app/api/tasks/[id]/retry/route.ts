import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { taskStatuses } from "@/lib/research/status";
import { startResearchTask } from "@/lib/task-service";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.researchTask.update({
    where: { id },
    data: {
      status: taskStatuses.waiting,
      progress: 0,
      currentStep: "等待开始",
      errorMessage: null,
      completedAt: null
    }
  });
  await startResearchTask(id);
  return NextResponse.json({ ok: true });
}

