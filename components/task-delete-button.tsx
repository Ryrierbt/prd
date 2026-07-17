"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TaskDeleteButton({ taskId, appName }: { taskId: string; appName: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteTask() {
    if (deleting) return;
    const confirmed = window.confirm(`确认删除「${appName}」这条任务吗？对应报告、采集数据和 AI 分析结果都会一起删除。`);
    if (!confirmed) return;

    setDeleting(true);
    setError(null);
    const response = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    setDeleting(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "删除失败");
      return;
    }

    router.refresh();
  }

  return (
    <>
      <button type="button" className="history-action-button danger" onClick={deleteTask} disabled={deleting}>
        {deleting ? "删除中..." : "删除"}
      </button>
      {error ? <span className="history-action-error">{error}</span> : null}
    </>
  );
}
