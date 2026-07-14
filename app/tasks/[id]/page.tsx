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

  const successSources = task.sources.filter((source) => source.status === "SUCCESS");
  const failedSources = task.sources.filter((source) => source.status === "FAILED");

  return (
    <SiteShell>
      <TaskAutoRefresh status={task.status} />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-2">
            <StatusBadge status={task.status} />
          </div>
          <h1 className="text-3xl font-semibold text-ink">{task.appName}</h1>
          <p className="mt-2 text-sm text-moss">创建时间：{task.createdAt.toLocaleString("zh-CN")}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {[
            "COMPLETED",
            "PARTIAL_COMPLETED",
            "FAILED"
          ].includes(task.status) ? <RetryTaskButton taskId={task.id} /> : null}
          {task.report ? (
            <Link href={`/reports/${task.id}`} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">
              查看报告
            </Link>
          ) : null}
          <Link href="/tasks" className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-mint">
            返回历史
          </Link>
        </div>
      </div>
      <TaskProgress status={task.status} progress={task.progress} currentStep={task.currentStep} />
      {task.errorMessage ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {task.errorMessage}
        </div>
      ) : null}
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold text-ink">已完成的数据来源</h2>
          <div className="mt-4 grid gap-3">
            {successSources.map((source) => (
              <a
                key={source.id}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-line p-3 text-sm hover:bg-mint"
              >
                <p className="font-medium text-ink">{source.sourceName}</p>
                <p className="mt-1 break-all text-moss">{source.url}</p>
              </a>
            ))}
            {successSources.length === 0 ? <p className="text-sm text-moss">暂无完成来源</p> : null}
          </div>
        </section>
        <section className="rounded-lg border border-line bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold text-ink">失败的数据来源</h2>
          <div className="mt-4 grid gap-3">
            {failedSources.map((source) => (
              <div key={source.id} className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <p className="font-medium">{source.sourceName}</p>
                <p className="mt-1">{source.errorMessage ?? "未知错误"}</p>
              </div>
            ))}
            {failedSources.length === 0 ? <p className="text-sm text-moss">暂无失败来源</p> : null}
          </div>
        </section>
      </div>
    </SiteShell>
  );
}
