import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { selectableRecollectSources, type SelectableRecollectSource } from "@/lib/research/runner";
import { taskStatuses } from "@/lib/research/status";
import { startSelectedSourcesRetry } from "@/lib/task-service";

type RecollectRequest = {
  sources?: unknown;
};

const sourceSet = new Set<string>(selectableRecollectSources);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as RecollectRequest;
  const sources = Array.isArray(body.sources)
    ? body.sources.filter((source): source is SelectableRecollectSource => typeof source === "string" && sourceSet.has(source))
    : [];

  if (!sources.length) {
    return NextResponse.json({ ok: false, error: "请选择至少一个重新采集来源。" }, { status: 400 });
  }

  await prisma.researchTask.update({
    where: { id },
    data: {
      status: taskStatuses.waiting,
      progress: 0,
      currentStep: "等待定向重新采集",
      errorMessage: null,
      completedAt: null
    }
  });
  await startSelectedSourcesRetry(id, Array.from(new Set(sources)));
  return NextResponse.json({ ok: true });
}
