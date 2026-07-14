import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createResearchTask, startResearchTask } from "@/lib/task-service";
import { createTaskSchema } from "@/lib/validators";

export async function GET() {
  const tasks = await prisma.researchTask.findMany({
    orderBy: { createdAt: "desc" },
    include: { report: true }
  });
  return NextResponse.json({ tasks });
}

export async function POST(request: Request) {
  const json = await request.json();
  const parsed = createTaskSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "输入不合法" }, { status: 400 });
  }

  const task = await createResearchTask(parsed.data);
  await startResearchTask(task.id);

  return NextResponse.json({ task }, { status: 201 });
}

