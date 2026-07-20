import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { StatusBadge } from "@/components/status-badge";
import { TaskDeleteButton } from "@/components/task-delete-button";
import { TaskRecollectButton } from "@/components/task-recollect-button";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type TasksSearchParams = {
  q?: string | string[];
  app?: string | string[];
  status?: string | string[];
};

type TaskRow = Awaited<ReturnType<typeof loadTasks>>[number];

const statusFilters = [
  { label: "全部状态", value: "" },
  { label: "已完成", value: "completed" },
  { label: "进行中", value: "running" },
  { label: "失败", value: "failed" }
];

export default async function TasksPage({ searchParams }: { searchParams?: Promise<TasksSearchParams> }) {
  const params = (await searchParams) ?? {};
  const query = firstParam(params.q).trim();
  const appFilter = firstParam(params.app);
  const statusFilter = firstParam(params.status);
  const tasks = await loadTasks();
  const appNames = Array.from(new Set(tasks.map((task) => task.appName))).sort((left, right) => left.localeCompare(right));
  const visibleTasks = tasks.filter((task) => matchesFilters(task, query, appFilter, statusFilter));
  const groups = groupTasksByApp(visibleTasks);
  const completedCount = tasks.filter((task) => task.status === "COMPLETED").length;
  const completionRate = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;

  return (
    <SiteShell activeNav="tasks">
      <div className="history-page">
        <div className="history-header">
          <div>
            <h1>历史任务</h1>
            <p>查看已创建任务、采集状态和报告入口，所有任务按应用分组，便于管理与追踪。</p>
          </div>
          <div className="history-header-actions">
            <Link href="/compare" className="history-compare-link">
              横向对比
            </Link>
            <Link href="/" className="history-new-task">
              <span aria-hidden="true">+</span>
              新建任务
            </Link>
          </div>
        </div>

        <div className="history-dashboard">
          <form className="history-filter-card" action="/tasks">
            <label className="history-search">
              <span aria-hidden="true">⌕</span>
              <input name="q" placeholder="搜索应用或任务" defaultValue={query} />
            </label>
            <select name="app" defaultValue={appFilter} aria-label="应用筛选">
              <option value="">全部应用</option>
              {appNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <select name="status" defaultValue={statusFilter} aria-label="状态筛选">
              {statusFilters.map((item) => (
                <option key={item.label} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <button type="submit">筛选</button>
            <Link href="/tasks">重置</Link>
          </form>

          <div className="history-stat-card">
            <span className="history-stat-icon grid" aria-hidden="true">▦</span>
            <div><span>应用总数</span><strong>{appNames.length}</strong><small>个</small></div>
          </div>
          <div className="history-stat-card">
            <span className="history-stat-icon clipboard" aria-hidden="true">□</span>
            <div><span>任务总数</span><strong>{tasks.length}</strong><small>个</small></div>
          </div>
          <div className="history-stat-card">
            <span className="history-stat-icon done" aria-hidden="true">✓</span>
            <div><span>已完成任务</span><strong>{completedCount}</strong><small>个（{completionRate}%）</small></div>
          </div>
        </div>

        <div className="history-groups">
          {groups.map((group, index) => (
            <details key={group.appName} className="history-app-group" open={index === 0}>
              <summary>
                <div className="history-app-summary">
                  <AppLogo appName={group.appName} iconUrl={group.iconUrl} />
                  <div>
                    <strong>{group.appName}</strong>
                    <span>任务总数 {group.tasks.length}</span>
                  </div>
                </div>
                <div className="history-group-meta">
                  <div><span>最新完成时间</span><strong>{formatDateTime(group.latestCompletedAt)}</strong></div>
                  <div><span>状态概览</span><strong><em>{group.doneLabel}</em>{group.completedTasks} / {group.tasks.length}</strong></div>
                </div>
                <span className="history-expand" aria-hidden="true">⌄</span>
              </summary>

              <div className="history-task-table-wrap">
                <table className="history-task-table">
                  <thead>
                    <tr>
                      <th>状态</th>
                      <th>进度</th>
                      <th>创建时间</th>
                      <th>完成时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.tasks.map((task) => (
                      <tr key={task.id}>
                        <td><StatusBadge status={task.status} /></td>
                        <td>{task.progress}%</td>
                        <td>{task.createdAt.toLocaleString("zh-CN")}</td>
                        <td>{task.completedAt?.toLocaleString("zh-CN") ?? "暂未完成"}</td>
                        <td>
                          <div className="history-actions">
                            <Link href={`/tasks/${task.id}`}>查看</Link>
                            {task.report ? <Link href={`/reports/${task.id}`}>报告</Link> : null}
                            <TaskRecollectButton taskId={task.id} />
                            <TaskDeleteButton taskId={task.id} appName={task.appName} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}

          {groups.length === 0 ? (
            <div className="history-empty">
              暂无匹配任务
            </div>
          ) : null}
        </div>
      </div>
    </SiteShell>
  );
}

async function loadTasks() {
  return prisma.researchTask.findMany({
    orderBy: { createdAt: "desc" },
    include: { report: true, appProfile: true }
  });
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function matchesFilters(task: TaskRow, query: string, appFilter: string, statusFilter: string) {
  const normalizedQuery = query.toLowerCase();
  const matchesQuery = !normalizedQuery || task.appName.toLowerCase().includes(normalizedQuery);
  const matchesApp = !appFilter || task.appName === appFilter;
  const matchesStatus =
    !statusFilter ||
    (statusFilter === "completed" && task.status === "COMPLETED") ||
    (statusFilter === "failed" && task.status === "FAILED") ||
    (statusFilter === "running" && !["COMPLETED", "PARTIAL_COMPLETED", "FAILED"].includes(task.status));
  return matchesQuery && matchesApp && matchesStatus;
}

function groupTasksByApp(tasks: TaskRow[]) {
  const groups = new Map<string, TaskRow[]>();
  for (const task of tasks) {
    groups.set(task.appName, [...(groups.get(task.appName) ?? []), task]);
  }

  return Array.from(groups.entries()).map(([appName, appTasks]) => {
    const latestCompletedAt = appTasks
      .map((task) => task.completedAt)
      .filter((date): date is Date => Boolean(date))
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
    const completedTasks = appTasks.filter((task) => task.status === "COMPLETED").length;
    const iconUrl = appTasks.find((task) => task.appProfile?.iconUrl)?.appProfile?.iconUrl ?? null;
    return {
      appName,
      tasks: appTasks,
      iconUrl,
      latestCompletedAt,
      completedTasks,
      doneLabel: completedTasks === appTasks.length ? "全部完成" : completedTasks > 0 ? "部分完成" : "未完成"
    };
  });
}

function formatDateTime(value: Date | null) {
  return value ? value.toLocaleString("zh-CN") : "暂未完成";
}

function AppLogo({ appName, iconUrl }: { appName: string; iconUrl?: string | null }) {
  const initial = appName.trim().slice(0, 1).toUpperCase() || "?";
  return (
    <div className="history-app-logo">
      {iconUrl ? <img src={iconUrl} alt={`${appName} logo`} /> : <span>{initial}</span>}
    </div>
  );
}
