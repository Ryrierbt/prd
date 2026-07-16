import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/site-shell";
import { TaskProgress } from "@/components/task-progress";
import { StatusBadge } from "@/components/status-badge";
import { RetryTaskButton } from "@/components/retry-task-button";
import { TaskAutoRefresh } from "@/components/task-auto-refresh";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await prisma.researchTask.findUnique({
    where: { id },
    include: { sources: true, report: true }
  });

  if (!task) {
    notFound();
  }

  const visibleSources = task.sources.filter((source) => source.sourceType !== "COMMUNITY_REDDIT");
  const successSources = visibleSources.filter((source) => source.status === "SUCCESS");
  const failedSources = visibleSources.filter((source) => source.status === "FAILED");
  const skippedSources = visibleSources.filter((source) => source.status === "SKIPPED");
  const reviewSourceTypes = new Set(["APP_STORE", "APP_STORE_RATINGS", "APP_STORE_REVIEWS", "GOOGLE_PLAY", "GOOGLE_PLAY_RATINGS", "GOOGLE_PLAY_REVIEWS"]);
  const hasFailedReviewSources = failedSources.some((source) => reviewSourceTypes.has(source.sourceType));
  const hasFailedNonReviewSources = failedSources.some((source) => !reviewSourceTypes.has(source.sourceType));

  return (
    <SiteShell activeNav="tasks">
      <TaskAutoRefresh status={task.status} />
      <div className="workspace-page-header">
        <div>
          <div className="workspace-status-row">
            <StatusBadge status={task.status} />
          </div>
          <h1>{task.appName}</h1>
          <p>创建时间：{task.createdAt.toLocaleString("zh-CN")}</p>
        </div>
        <div className="workspace-actions">
          {[
            "COMPLETED",
            "PARTIAL_COMPLETED",
            "FAILED"
          ].includes(task.status) ? <RetryTaskButton taskId={task.id} hasFailedSources={hasFailedNonReviewSources} hasFailedReviewSources={hasFailedReviewSources} /> : null}
          {task.report ? (
            <Link href={`/reports/${task.id}`} className="workspace-primary-link">
              查看报告
            </Link>
          ) : null}
          <Link href="/tasks" className="workspace-secondary-link">
            返回历史
          </Link>
        </div>
      </div>
      <TaskProgress status={task.status} progress={task.progress} currentStep={task.currentStep} />
      {task.errorMessage ? (
        <div className="workspace-notice">
          {task.errorMessage}
        </div>
      ) : null}
      <div className="workspace-source-grid">
        <section className="workspace-source-panel">
          <h2>已完成的数据来源</h2>
          <div className="workspace-source-list">
            {successSources.map((source) => (
              <a
                key={source.id}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="workspace-source-item"
              >
                <p>{source.sourceName}</p>
                <span>{source.url}</span>
              </a>
            ))}
            {successSources.length === 0 ? <p className="workspace-source-empty">暂无完成来源</p> : null}
          </div>
        </section>
        <section className="workspace-source-panel">
          <h2>失败的数据来源</h2>
          <div className="workspace-source-list">
            {failedSources.map((source) => (
              <div key={source.id} className="workspace-source-item failed">
                <p>{source.sourceName}</p>
                <span>{source.errorMessage ?? "未知错误"}</span>
              </div>
            ))}
            {failedSources.length === 0 ? <p className="workspace-source-empty">暂无失败来源</p> : null}
          </div>
        </section>
        {skippedSources.length ? (
          <section className="workspace-source-panel">
            <h2>已跳过的数据来源</h2>
            <div className="workspace-source-list">
              {skippedSources.map((source) => (
                <div key={source.id} className="workspace-source-item">
                  <p>{source.sourceName}</p>
                  <span>{source.errorMessage ?? "当前未配置或不适用"}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </SiteShell>
  );
}
