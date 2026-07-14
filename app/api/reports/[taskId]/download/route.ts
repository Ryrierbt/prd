import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const report = await prisma.report.findUnique({
    where: { taskId },
    include: { task: true }
  });

  if (!report) {
    return NextResponse.json({ error: "报告不存在" }, { status: 404 });
  }

  const fileName = `${report.task.appName.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}-research-report.html`;

  return new NextResponse(report.htmlContent, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`
    }
  });
}

