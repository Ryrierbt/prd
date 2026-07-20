import { mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";

export async function ensureDir(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
}

export async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await BunlessWrite(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  try {
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(filePath, { force: true }).catch(() => undefined);
    await rename(tempPath, filePath).catch(async (renameError) => {
      await rm(tempPath, { force: true });
      throw renameError;
    });
  }
}

async function BunlessWrite(filePath: string, text: string): Promise<void> {
  const handle = await open(filePath, "wx");
  try {
    await handle.writeFile(text, { encoding: "utf8" });
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function appendJsonLine(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const handle = await open(filePath, "a");
  try {
    await handle.writeFile(`${JSON.stringify(value)}\n`, { encoding: "utf8" });
  } finally {
    await handle.close();
  }
}

export function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "unknown";
}
