import { NextResponse } from "next/server";
import { startResearchTask } from "@/lib/task-service";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await startResearchTask(id);
  return NextResponse.json({ ok: true });
}

