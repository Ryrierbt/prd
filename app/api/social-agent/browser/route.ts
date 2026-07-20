import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);
const socialAgentDirectory = path.join(process.cwd(), "tools", "social-agent");
const browserScript = path.join(socialAgentDirectory, "scripts", "open-browser.sh");

export const runtime = "nodejs";

export async function GET() {
  const status = await browserStatus();
  return NextResponse.json(status);
}

export async function POST() {
  if (process.platform !== "darwin") {
    return NextResponse.json({ ok: false, running: false, error: "当前按钮只支持 macOS 专属浏览器启动。" }, { status: 400 });
  }

  try {
    const { stdout } = await execFileAsync("bash", [browserScript], {
      cwd: socialAgentDirectory,
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        CDP_PORT: socialBrowserPort(),
        PROJECT_CHROME_PROFILE: process.env.SOCIAL_AGENT_CHROME_PROFILE || path.join(socialAgentDirectory, ".project-chrome-profile"),
        PROJECT_CHROME_LOG: process.env.SOCIAL_AGENT_CHROME_LOG || path.join(socialAgentDirectory, ".project-chrome-profile", "chrome.log")
      }
    });
    const status = await browserStatus();
    return NextResponse.json({ ...status, ok: true, message: stdout.trim() || "专属浏览器已启动。" });
  } catch (error) {
    return NextResponse.json(
      { ok: false, running: false, endpoint: socialBrowserVersionUrl(), error: processErrorMessage(error, "专属浏览器启动失败") },
      { status: 500 }
    );
  }
}

async function browserStatus() {
  const endpoint = socialBrowserVersionUrl();
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(2_000) });
    if (!response.ok) throw new Error(`CDP endpoint returned ${response.status}`);
    const payload = (await response.json().catch(() => null)) as { webSocketDebuggerUrl?: string } | null;
    return {
      ok: true,
      running: true,
      endpoint,
      webSocketDebuggerUrl: payload?.webSocketDebuggerUrl || null
    };
  } catch {
    return {
      ok: true,
      running: false,
      endpoint,
      webSocketDebuggerUrl: null
    };
  }
}

function socialBrowserVersionUrl() {
  return `http://127.0.0.1:${socialBrowserPort()}/json/version`;
}

function socialBrowserPort() {
  const endpoint = process.env.SOCIAL_AGENT_CDP_ENDPOINT || process.env.SOCIAL_AGENT_CDP_PORT || "9333";
  const match = endpoint.match(/:(\d+)(?:\/|$)/);
  if (match?.[1]) return match[1];
  return /^\d+$/.test(endpoint) ? endpoint : "9333";
}

function processErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object") {
    if ("stderr" in error && typeof error.stderr === "string" && error.stderr.trim()) return error.stderr.trim().slice(0, 1000);
    if ("message" in error && typeof error.message === "string" && error.message.trim()) return error.message.slice(0, 1000);
  }
  return fallback;
}
