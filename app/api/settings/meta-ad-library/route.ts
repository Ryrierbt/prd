import { NextResponse } from "next/server";
import { z } from "zod";
import {
  clearMetaAdLibraryAccessToken,
  isMetaAdLibraryConfigured,
  saveMetaAdLibraryAccessToken
} from "@/lib/settings";

const accessTokenSchema = z.object({
  accessToken: z.string().trim().min(20, "Access Token 格式不正确").max(2_000, "Access Token 过长")
});

export async function GET() {
  return NextResponse.json({ configured: await isMetaAdLibraryConfigured() });
}

export async function PUT(request: Request) {
  const parsed = accessTokenSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Access Token 格式不正确" }, { status: 400 });
  }

  await saveMetaAdLibraryAccessToken(parsed.data.accessToken);
  return NextResponse.json({ configured: true });
}

export async function DELETE() {
  await clearMetaAdLibraryAccessToken();
  return NextResponse.json({ configured: await isMetaAdLibraryConfigured() });
}
