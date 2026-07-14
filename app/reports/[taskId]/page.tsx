import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/site-shell";
import { RefreshReportButton } from "@/components/refresh-report-button";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const report = await prisma.report.findUnique({
    where: { taskId },
    include: { task: true }
  });

  if (!report) {
    notFound();
  }

  return (
    <SiteShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-ink">{report.task.appName} 调研报告</h1>
          <p className="mt-2 text-sm text-moss">生成时间：{report.createdAt.toLocaleString("zh-CN")}</p>
        </div>
        <div className="flex gap-3">
          <RefreshReportButton taskId={taskId} aiRefresh />
          <RefreshReportButton taskId={taskId} />
          <a
            href={`/api/reports/${taskId}/download`}
            className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white"
          >
            下载 HTML
          </a>
          <Link href={`/tasks/${taskId}`} className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-mint">
            返回任务
          </Link>
        </div>
      </div>
      <iframe title="调研报告" srcDoc={report.htmlContent} className="h-[720px] w-full rounded-lg border border-line bg-white shadow-soft" />
    </SiteShell>
  );
}
