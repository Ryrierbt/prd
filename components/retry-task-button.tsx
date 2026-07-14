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
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={retry}
        disabled={isRetrying}
        className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-mint disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isRetrying ? "重新采集中..." : "重新采集"}
      </button>
      {error ? <span className="text-sm text-coral">{error}</span> : null}
    </div>
  );
}
