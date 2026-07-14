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
    <form onSubmit={submitTask} className="grid gap-5 rounded-lg border border-line bg-white p-6 shadow-soft">
      <div>
        <label className="mb-2 block text-sm font-medium text-ink">App 名称 *</label>
        <input
          value={form.appName}
          onChange={(event) => updateField("appName", event.target.value)}
          className="w-full rounded-md border border-line px-3 py-2 outline-none focus:border-moss"
          placeholder="例如 Otter"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">官网地址</label>
          <input
            value={form.websiteUrl}
            onChange={(event) => updateField("websiteUrl", event.target.value)}
            className="w-full rounded-md border border-line px-3 py-2 outline-none focus:border-moss"
            placeholder="https://example.com"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">App Store 地址</label>
          <input
            value={form.appStoreUrl}
            onChange={(event) => updateField("appStoreUrl", event.target.value)}
            className="w-full rounded-md border border-line px-3 py-2 outline-none focus:border-moss"
            placeholder="https://apps.apple.com/..."
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">Google Play 地址</label>
          <input
            value={form.googlePlayUrl}
            onChange={(event) => updateField("googlePlayUrl", event.target.value)}
            className="w-full rounded-md border border-line px-3 py-2 outline-none focus:border-moss"
            placeholder="https://play.google.com/..."
          />
        </div>
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-ink">补充关键词</label>
        <textarea
          value={form.keywords}
          onChange={(event) => updateField("keywords", event.target.value)}
          className="min-h-24 w-full rounded-md border border-line px-3 py-2 outline-none focus:border-moss"
          placeholder="产品定位、竞品关键词、目标市场等"
        />
      </div>
      {error ? <p className="rounded-md border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p> : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "创建中..." : "开始调研"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/tasks")}
          className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-mint"
        >
          查看历史任务
        </button>
      </div>
    </form>
  );
}

