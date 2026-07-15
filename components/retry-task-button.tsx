"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type RetryMode = "all" | "failed";

export function RetryTaskButton({ taskId, hasFailedSources = false }: { taskId: string; hasFailedSources?: boolean }) {
  const router = useRouter();
  const [retryingMode, setRetryingMode] = useState<RetryMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function retry(mode: RetryMode) {
    if (retryingMode) return;

    setRetryingMode(mode);
    setError(null);
    const endpoint = mode === "failed" ? `/api/tasks/${taskId}/retry-failed` : `/api/tasks/${taskId}/retry`;
    const response = await fetch(endpoint, { method: "POST" });
    setRetryingMode(null);

    if (!response.ok) {
      setError(mode === "failed" ? "失败项重新采集失败" : "重新采集失败");
      return;
    }

    router.refresh();
  }

  return (
    <div className="workspace-retry-wrap">
      <button
        type="button"
        onClick={() => retry("all")}
        disabled={Boolean(retryingMode)}
        className="workspace-secondary-button"
      >
        {retryingMode === "all" ? "重新采集中..." : "重新采集"}
      </button>
      {hasFailedSources ? (
        <button
          type="button"
          onClick={() => retry("failed")}
          disabled={Boolean(retryingMode)}
          className="workspace-secondary-button"
        >
          {retryingMode === "failed" ? "失败项采集中..." : "失败项重新采集"}
        </button>
      ) : null}
      {error ? <span className="workspace-button-error">{error}</span> : null}
    </div>
  );
}
