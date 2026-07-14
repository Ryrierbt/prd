"use client";

import { useEffect, useState } from "react";

export function MetaAdLibrarySettings() {
  const [accessToken, setAccessToken] = useState("");
  const [configured, setConfigured] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/meta-ad-library")
      .then((response) => response.json())
      .then((result) => setConfigured(Boolean(result.configured)))
      .catch(() => setMessage("无法读取配置状态"));
  }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken.trim() || isSaving) return;

    setIsSaving(true);
    setMessage(null);
    const response = await fetch("/api/settings/meta-ad-library", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken })
    });
    const result = await response.json();
    setIsSaving(false);

    if (!response.ok) {
      setMessage(result.error ?? "保存失败");
      return;
    }

    setAccessToken("");
    setConfigured(true);
    setMessage("已保存");
  }

  async function clear() {
    if (isSaving) return;

    setIsSaving(true);
    setMessage(null);
    const response = await fetch("/api/settings/meta-ad-library", { method: "DELETE" });
    const result = await response.json();
    setIsSaving(false);
    setConfigured(Boolean(result.configured));
    setMessage(response.ok ? "已清除" : result.error ?? "清除失败");
  }

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">Meta Ad Library</h2>
        <span className={`text-xs font-medium ${configured ? "text-moss" : "text-coral"}`}>{configured ? "已配置" : "未配置"}</span>
      </div>
      <form onSubmit={save} className="mt-4 grid gap-3">
        <label className="text-sm font-medium text-ink" htmlFor="meta-ad-library-access-token">
          Access Token
        </label>
        <input
          id="meta-ad-library-access-token"
          type="password"
          autoComplete="off"
          value={accessToken}
          onChange={(event) => setAccessToken(event.target.value)}
          className="w-full rounded-md border border-line px-3 py-2 outline-none focus:border-moss"
          placeholder={configured ? "输入新 Token 以替换" : "EAAB..."}
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isSaving || !accessToken.trim()}
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
