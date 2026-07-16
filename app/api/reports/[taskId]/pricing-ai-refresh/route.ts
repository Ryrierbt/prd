import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { summarizePricingBenefitsWithDeepSeek } from "@/lib/research/analysis/deepseek";
import { generateResearchReport } from "@/lib/research/report/html-generator";

export async function POST(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const exists = await prisma.researchTask.findUnique({ where: { id: taskId }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "任务不存在" }, { status: 404 });

  await summarizePricingBenefitsWithDeepSeek(taskId);

  const task = await prisma.researchTask.findUniqueOrThrow({
    where: { id: taskId },
    include: { sources: true, appProfile: true, pricingPlans: true, reviews: true, promotions: true, communityItems: true, analyses: true }
  });
  await prisma.report.upsert({
    where: { taskId },
    update: { htmlContent: generateResearchReport(task), createdAt: new Date() },
    create: { taskId, htmlContent: generateResearchReport(task) }
  });

  const pricingSummary = task.analyses.find((analysis) => analysis.analysisType === "DEEPSEEK_PRICING_SUMMARY");
  const pricingError = task.analyses.find((analysis) => analysis.analysisType === "DEEPSEEK_PRICING_SUMMARY_ERROR");

  return NextResponse.json({
    ok: Boolean(pricingSummary),
    summary: pricingSummary ? JSON.parse(pricingSummary.resultJson) : null,
    error: pricingError ? JSON.parse(pricingError.resultJson) : null
  });
}
