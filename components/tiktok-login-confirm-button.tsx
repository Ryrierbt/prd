"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TikTokLoginConfirmButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmLogin() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const response = await fetch(`/api/tasks/${taskId}/tiktok-login-confirm`, { method: "POST" });
    setSubmitting(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "确认失败");
      return;
    }

    router.refresh();
  }

  return (
    <div className="workspace-login-confirm">
      <button type="button" className="workspace-primary-link" onClick={confirmLogin} disabled={submitting}>
        {submitting ? "确认中..." : "已登录，继续采集 TikTok"}
      </button>
      {error ? <span className="workspace-button-error">{error}</span> : null}
    </div>
  );
}
