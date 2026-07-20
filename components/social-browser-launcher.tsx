"use client";

import { useEffect, useState } from "react";

type BrowserStatus = {
  running?: boolean;
  endpoint?: string;
  message?: string;
  error?: string;
};

export function SocialBrowserLauncher() {
  const [status, setStatus] = useState<BrowserStatus | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    refreshStatus();
  }, []);

  async function refreshStatus() {
    const response = await fetch("/api/social-agent/browser").catch(() => null);
    if (!response) {
      setStatus({ running: false, error: "无法读取浏览器状态" });
      return;
    }
    const payload = (await response.json().catch(() => ({}))) as BrowserStatus;
    setStatus(payload);
  }

  async function startBrowser() {
    if (isStarting) return;

    setIsStarting(true);
    const response = await fetch("/api/social-agent/browser", { method: "POST" }).catch(() => null);
    const payload = response ? ((await response.json().catch(() => ({}))) as BrowserStatus) : { running: false, error: "启动请求失败" };
    setIsStarting(false);
    setStatus(payload);
  }

  const running = Boolean(status?.running);
  const statusText = isStarting ? "启动中" : running ? "已连接" : "未启动";
  const message = status?.error || status?.message || (running ? "后续社媒采集会复用该浏览器。" : "用于 YouTube、Reddit、TikTok 社媒采集。");

  return (
    <section className="social-browser-card">
      <div className="social-browser-header">
        <div>
          <h2>社媒专属浏览器</h2>
          <p>{status?.endpoint || "http://127.0.0.1:9333/json/version"}</p>
        </div>
        <span className={`api-status ${running ? "configured" : "unconfigured"}`}>{statusText}</span>
      </div>
      <p className={status?.error ? "social-browser-message error" : "social-browser-message"}>{message}</p>
      <div className="social-browser-actions">
        <button type="button" className="social-browser-primary" onClick={startBrowser} disabled={isStarting}>
          {isStarting ? "正在打开..." : running ? "重新检测 / 打开" : "打开专属浏览器"}
        </button>
        <button type="button" className="social-browser-secondary" onClick={refreshStatus} disabled={isStarting}>
          检测状态
        </button>
      </div>
    </section>
  );
}
