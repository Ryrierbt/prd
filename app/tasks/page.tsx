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
    <SiteShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-ink">历史任务</h1>
          <p className="mt-2 text-sm text-moss">查看已创建任务、状态和报告入口。</p>
        </div>
        <Link href="/" className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">
          新建任务
        </Link>
      </div>
      <div className="overflow-hidden rounded-lg border border-line bg-white shadow-soft">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="bg-mint/70 text-ink">
            <tr>
              <th className="px-4 py-3 font-medium">App</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">进度</th>
              <th className="px-4 py-3 font-medium">创建时间</th>
              <th className="px-4 py-3 font-medium">完成时间</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id} className="border-t border-line">
                <td className="px-4 py-3 font-medium text-ink">{task.appName}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={task.status} />
                </td>
                <td className="px-4 py-3 text-moss">{task.progress}%</td>
                <td className="px-4 py-3 text-moss">{task.createdAt.toLocaleString("zh-CN")}</td>
                <td className="px-4 py-3 text-moss">{task.completedAt?.toLocaleString("zh-CN") ?? "暂未完成"}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-3 text-moss">
                    <Link href={`/tasks/${task.id}`} className="hover:text-ink">
                      查看
                    </Link>
                    {task.report ? (
                      <Link href={`/reports/${task.id}`} className="hover:text-ink">
                        报告
                      </Link>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-moss">
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

