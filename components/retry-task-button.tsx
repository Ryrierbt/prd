"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RetryTaskButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    if (isRetrying) return;

    setIsRetrying(true);
    setError(null);
    const response = await fetch(`/api/tasks/${taskId}/retry`, { method: "POST" });
    setIsRetrying(false);

    if (!response.ok) {
      setError("重新采集失败");
      return;
    }

    router.refresh();
  }

  return (
    <div className="workspace-retry-wrap">
      <button
        type="button"
        onClick={retry}
        disabled={isRetrying}
        className="workspace-secondary-button"
      >
        {isRetrying ? "重新采集中..." : "重新采集"}
      </button>
      {error ? <span className="workspace-button-error">{error}</span> : null}
    </div>
  );
}
