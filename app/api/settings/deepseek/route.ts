import { NextResponse } from "next/server";
import { z } from "zod";
import { clearDeepSeekApiKey, isDeepSeekConfigured, saveDeepSeekApiKey } from "@/lib/settings";

const apiKeySchema = z.object({
  apiKey: z.string().trim().min(10, "API Key 格式不正确").max(512, "API Key 过长")
});

export async function GET() {
  return NextResponse.json({ configured: await isDeepSeekConfigured() });
}

export async function PUT(request: Request) {
  const parsed = apiKeySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "API Key 格式不正确" }, { status: 400 });
  }

  await saveDeepSeekApiKey(parsed.data.apiKey);
  return NextResponse.json({ configured: true });
}

export async function DELETE() {
  await clearDeepSeekApiKey();
  return NextResponse.json({ configured: await isDeepSeekConfigured() });
}
