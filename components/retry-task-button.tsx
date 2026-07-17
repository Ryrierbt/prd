"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type RetryMode = "all" | "failed" | "reviews" | "analysis";

export function RetryTaskButton({
  taskId,
  hasFailedSources = false,
  hasFailedReviewSources = false,
  canContinueAnalysis = false
}: {
  taskId: string;
  hasFailedSources?: boolean;
  hasFailedReviewSources?: boolean;
  canContinueAnalysis?: boolean;
}) {
  const router = useRouter();
  const [retryingMode, setRetryingMode] = useState<RetryMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function retry(mode: RetryMode) {
    if (retryingMode) return;

    setRetryingMode(mode);
    setError(null);
    const endpoint =
      mode === "analysis"
        ? `/api/tasks/${taskId}/continue-analysis`
        : mode === "reviews"
          ? `/api/tasks/${taskId}/retry-reviews`
          : mode === "failed"
            ? `/api/tasks/${taskId}/retry-failed`
            : `/api/tasks/${taskId}/retry`;
    const response = await fetch(endpoint, { method: "POST" });
    setRetryingMode(null);

    if (!response.ok) {
      setError(mode === "analysis" ? "继续 AI 分析失败" : mode === "reviews" ? "评论重新采集失败" : mode === "failed" ? "失败项重新采集失败" : "重新采集失败");
      return;
    }

    router.refresh();
  }

  return (
    <div className="workspace-retry-wrap">
      {!canContinueAnalysis ? (
        <button
          type="button"
          onClick={() => retry("all")}
          disabled={Boolean(retryingMode)}
          className="workspace-secondary-button"
        >
          {retryingMode === "all" ? "重新采集中..." : "重新采集"}
        </button>
      ) : null}
      {hasFailedReviewSources && !canContinueAnalysis ? (
        <button
          type="button"
          onClick={() => retry("reviews")}
          disabled={Boolean(retryingMode)}
          className="workspace-secondary-button"
        >
          {retryingMode === "reviews" ? "评论采集中..." : "重新采集评论"}
        </button>
      ) : null}
      {hasFailedSources ? (
        <button
          type="button"
          onClick={() => retry("failed")}
          disabled={Boolean(retryingMode)}
          className="workspace-secondary-button"
        >
          {retryingMode === "failed" ? "采集中..." : canContinueAnalysis ? "采集缺失内容" : "失败项重新采集"}
        </button>
      ) : null}
      {canContinueAnalysis ? (
        <button
          type="button"
          onClick={() => retry("analysis")}
          disabled={Boolean(retryingMode)}
          className="workspace-primary-link"
        >
          {retryingMode === "analysis" ? "分析中..." : "继续 AI 分析"}
        </button>
      ) : null}
      {error ? <span className="workspace-button-error">{error}</span> : null}
    </div>
  );
}
