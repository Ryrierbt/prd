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
    <SiteShell activeNav="tasks">
      <div className="workspace-page-header report-page-header">
        <div>
          <p className="workspace-eyebrow">竞品报告</p>
          <h1>{report.task.appName} 调研报告</h1>
          <p>生成时间：{report.createdAt.toLocaleString("zh-CN")}</p>
        </div>
        <div className="workspace-actions">
          <RefreshReportButton taskId={taskId} aiRefresh />
          <RefreshReportButton taskId={taskId} />
          <a
            href={`/api/reports/${taskId}/download`}
            className="workspace-primary-link"
          >
            下载 HTML
          </a>
          <Link href={`/tasks/${taskId}`} className="workspace-secondary-link">
            返回任务
          </Link>
        </div>
      </div>
      <iframe title="调研报告" srcDoc={report.htmlContent} className="workspace-report-frame" />
    </SiteShell>
  );
}
