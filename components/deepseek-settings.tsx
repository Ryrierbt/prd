"use client";

import { useEffect, useState } from "react";

export function DeepSeekSettings() {
  const [apiKey, setApiKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/deepseek")
      .then((response) => response.json())
      .then((result) => setConfigured(Boolean(result.configured)))
      .catch(() => setMessage("无法读取配置状态"));
  }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiKey.trim() || isSaving) return;

    setIsSaving(true);
    setMessage(null);
    const response = await fetch("/api/settings/deepseek", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey })
    });
    const result = await response.json();
    setIsSaving(false);

    if (!response.ok) {
      setMessage(result.error ?? "保存失败");
      return;
    }

    setApiKey("");
    setConfigured(true);
    setMessage("已保存");
  }

  async function clear() {
    if (isSaving) return;

    setIsSaving(true);
    setMessage(null);
    const response = await fetch("/api/settings/deepseek", { method: "DELETE" });
    const result = await response.json();
    setIsSaving(false);
    setConfigured(Boolean(result.configured));
    setMessage(response.ok ? "已清除" : result.error ?? "清除失败");
  }

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">DeepSeek API</h2>
        <span className={`text-xs font-medium ${configured ? "text-moss" : "text-coral"}`}>{configured ? "已配置" : "未配置"}</span>
      </div>
      <form onSubmit={save} className="mt-4 grid gap-3">
        <label className="text-sm font-medium text-ink" htmlFor="deepseek-api-key">
          API Key
        </label>
        <input
          id="deepseek-api-key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          className="w-full rounded-md border border-line px-3 py-2 outline-none focus:border-moss"
          placeholder={configured ? "输入新 Key 以替换" : "sk-..."}
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isSaving || !apiKey.trim()}
            className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "保存中..." : "保存"}
          </button>
          {configured ? (
            <button type="button" onClick={clear} disabled={isSaving} className="text-sm font-medium text-coral disabled:opacity-60">
              清除
            </button>
          ) : null}
          {message ? <p className="text-sm text-moss">{message}</p> : null}
        </div>
      </form>
    </section>
  );
}
