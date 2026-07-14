"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RefreshReportButton({ taskId, aiRefresh = false }: { taskId: string; aiRefresh?: boolean }) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function refreshReport() {
    if (isRefreshing) return;

    setIsRefreshing(true);
    const endpoint = aiRefresh ? "ai-refresh" : "regenerate";
    const response = await fetch(`/api/reports/${taskId}/${endpoint}`, { method: "POST" });
    setIsRefreshing(false);
    if (response.ok) router.refresh();
  }

  return (
    <button
      type="button"
      onClick={refreshReport}
      disabled={isRefreshing}
      className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-mint disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isRefreshing ? "更新中..." : aiRefresh ? "更新 AI 总结" : "刷新报告"}
    </button>
  );
}
