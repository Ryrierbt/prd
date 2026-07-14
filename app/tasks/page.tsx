import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const tasks = await prisma.researchTask.findMany({
    orderBy: { createdAt: "desc" },
    include: { report: true }
  });

  return (
    <SiteShell activeNav="tasks">
      <div className="workspace-page-header">
        <div>
          <p className="workspace-eyebrow">任务管理</p>
          <h1>历史任务</h1>
          <p>查看已创建任务、采集状态和报告入口。</p>
        </div>
        <Link href="/" className="workspace-primary-link">
          新建任务
        </Link>
      </div>
      <div className="workspace-table-shell">
        <table className="workspace-table">
          <thead>
            <tr>
              <th>App</th>
              <th>状态</th>
              <th>进度</th>
              <th>创建时间</th>
              <th>完成时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td className="workspace-app-name">{task.appName}</td>
                <td>
                  <StatusBadge status={task.status} />
                </td>
                <td className="workspace-muted">{task.progress}%</td>
                <td className="workspace-muted">{task.createdAt.toLocaleString("zh-CN")}</td>
                <td className="workspace-muted">{task.completedAt?.toLocaleString("zh-CN") ?? "暂未完成"}</td>
                <td>
                  <div className="workspace-table-actions">
                    <Link href={`/tasks/${task.id}`}>
                      查看
                    </Link>
                    {task.report ? (
                      <Link href={`/reports/${task.id}`}>
                        报告
                      </Link>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="workspace-empty-state">
                  暂无任务
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </SiteShell>
  );
}
