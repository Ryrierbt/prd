"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type FormState = {
  appName: string;
  websiteUrl: string;
  appStoreUrl: string;
  googlePlayUrl: string;
  keywords: string;
};

const initialState: FormState = {
  appName: "Otter",
  websiteUrl: "https://otter.ai/",
  appStoreUrl: "",
  googlePlayUrl: "",
  keywords: "AI meeting notes, transcription, pricing"
};

export function TaskForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });

    const result = await response.json();
    setIsSubmitting(false);

    if (!response.ok) {
      setError(result.error ?? "创建任务失败");
      return;
    }

    router.push(`/tasks/${result.task.id}`);
  }

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <form onSubmit={submitTask} className="research-form">
      <div className="research-form-heading">
        <img src="/icon/icon_04.png" alt="" />
        <h2>调研目标设置</h2>
      </div>
      <div className="research-field research-field-wide">
        <label>App 名称 *</label>
        <input
          value={form.appName}
          onChange={(event) => updateField("appName", event.target.value)}
          className="research-input"
          placeholder="例如 Otter"
        />
      </div>
      <div className="research-url-grid">
        <div className="research-field">
          <label>官网地址</label>
          <input
            value={form.websiteUrl}
            onChange={(event) => updateField("websiteUrl", event.target.value)}
            className="research-input"
            placeholder="https://example.com"
          />
        </div>
        <div className="research-field">
          <label>App Store 地址</label>
          <input
            value={form.appStoreUrl}
            onChange={(event) => updateField("appStoreUrl", event.target.value)}
            className="research-input"
            placeholder="https://apps.apple.com/..."
          />
        </div>
        <div className="research-field">
          <label>Google Play 地址</label>
          <input
            value={form.googlePlayUrl}
            onChange={(event) => updateField("googlePlayUrl", event.target.value)}
            className="research-input"
            placeholder="https://play.google.com/..."
          />
        </div>
      </div>
      <div className="research-field">
        <label>补充关键词（可选）</label>
        <textarea
          value={form.keywords}
          onChange={(event) => updateField("keywords", event.target.value)}
          className="research-textarea"
          placeholder="产品定位、竞品关键词、目标市场等"
        />
      </div>
      {error ? <p className="research-form-error">{error}</p> : null}
      <div className="research-form-actions">
        <button
          type="submit"
          disabled={isSubmitting}
          className="research-primary-button"
        >
          {isSubmitting ? "创建中..." : "开始调研"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/tasks")}
          className="research-secondary-button"
        >
          查看历史任务
        </button>
      </div>
    </form>
  );
}
