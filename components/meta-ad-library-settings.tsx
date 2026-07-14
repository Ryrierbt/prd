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
    <section className="api-config-card">
      <div className="api-config-header">
        <div className="api-config-title">
          <img src="/icon/icon_03.png" alt="" />
          <h2>Meta Ad Library</h2>
        </div>
        <span className={`api-status ${configured ? "configured" : "unconfigured"}`}>{configured ? "已配置" : "未配置"}</span>
      </div>
      <form onSubmit={save} className="api-config-form">
        <label htmlFor="meta-ad-library-access-token">
          Access Token
        </label>
        <input
          id="meta-ad-library-access-token"
          type="password"
          autoComplete="off"
          value={accessToken}
          onChange={(event) => setAccessToken(event.target.value)}
          className="api-token-input"
          placeholder={configured ? "输入新 Token 以替换" : "EAAB..."}
        />
        <div className="api-config-actions">
          <button
            type="submit"
            disabled={isSaving || !accessToken.trim()}
            className="api-save-button"
          >
            {isSaving ? "保存中..." : "保存"}
          </button>
          {configured ? (
            <button type="button" onClick={clear} disabled={isSaving} className="api-clear-button">
              清除
            </button>
          ) : null}
          {message ? <p className="api-config-message">{message}</p> : null}
        </div>
      </form>
    </section>
  );
}
