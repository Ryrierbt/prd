import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateResearchReport } from "@/lib/research/report/html-generator";

export async function POST(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const task = await prisma.researchTask.findUnique({
    where: { id: taskId },
    include: {
      sources: true,
      appProfile: true,
      pricingPlans: true,
      reviews: true,
      promotions: true,
      communityItems: true,
      googleResearchItems: true,
      analyses: true
    }
  });

  if (!task) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }

  await prisma.report.upsert({
    where: { taskId },
    update: { htmlContent: generateResearchReport(task), createdAt: new Date() },
    create: { taskId, htmlContent: generateResearchReport(task) }
  });

  return NextResponse.json({ ok: true });
}
