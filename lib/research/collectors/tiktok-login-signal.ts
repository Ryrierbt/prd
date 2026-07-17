import fs from "node:fs/promises";
import path from "node:path";

const signalDirectory = path.join(process.cwd(), ".runtime", "tiktok-login");

export function tiktokLoginSignalPath(taskId: string) {
  return path.join(signalDirectory, `${taskId}.continue`);
}

export async function clearTikTokLoginSignal(taskId: string) {
  await fs.rm(tiktokLoginSignalPath(taskId), { force: true }).catch(() => undefined);
}

export async function confirmTikTokLogin(taskId: string) {
  await fs.mkdir(signalDirectory, { recursive: true });
  await fs.writeFile(tiktokLoginSignalPath(taskId), new Date().toISOString(), "utf8");
}
