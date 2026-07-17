"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type RecollectSource = {
  label: string;
  value: string;
  description: string;
};

const recollectSources: RecollectSource[] = [
  { label: "苹果商城", value: "app_store", description: "App Store 信息、评分、版本与评论" },
  { label: "谷歌应用商城", value: "google_play", description: "Google Play 信息、评分与评论" },
  { label: "谷歌广告", value: "google_ads", description: "Google Ads Transparency 广告素材" },
  { label: "Meta 广告", value: "meta_ads", description: "Facebook / Instagram 广告素材" },
  { label: "TikTok", value: "tiktok", description: "TikTok 视频与评论" },
  { label: "YouTube", value: "youtube", description: "YouTube 视频与热门评论" }
];

export function TaskRecollectButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleSource(value: string) {
    setSelected((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
  }

  function closeDialog() {
    if (submitting) return;
    setOpen(false);
    setError(null);
  }

  async function submitRecollect() {
    if (!selected.length || submitting) return;

    setSubmitting(true);
    setError(null);
    const response = await fetch(`/api/tasks/${taskId}/recollect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sources: selected })
    });
    setSubmitting(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "重新采集启动失败");
      return;
    }

    setOpen(false);
    setSelected([]);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="history-action-button" onClick={() => setOpen(true)}>
        重新采集
      </button>

      {open ? (
        <div className="recollect-modal-backdrop" role="presentation" onMouseDown={closeDialog}>
          <div
            className="recollect-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`recollect-title-${taskId}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="recollect-modal-header">
              <div>
                <h2 id={`recollect-title-${taskId}`}>选择重新采集来源</h2>
                <p>只会刷新所选来源的数据，并在采集完成后重新生成分析与报告。</p>
              </div>
              <button type="button" className="recollect-close" onClick={closeDialog} aria-label="关闭">
                ×
              </button>
            </div>

            <div className="recollect-source-grid">
              {recollectSources.map((source) => {
                const checked = selected.includes(source.value);
                return (
                  <label key={source.value} className={checked ? "recollect-source selected" : "recollect-source"}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSource(source.value)}
                      disabled={submitting}
                    />
                    <span>
                      <strong>{source.label}</strong>
                      <small>{source.description}</small>
                    </span>
                  </label>
                );
              })}
            </div>

            {error ? <p className="recollect-error">{error}</p> : null}

            <div className="recollect-actions">
              <button type="button" className="recollect-secondary" onClick={closeDialog} disabled={submitting}>
                取消
              </button>
              <button type="button" className="recollect-primary" onClick={submitRecollect} disabled={submitting || !selected.length}>
                {submitting ? "启动中..." : "开始重新采集"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
