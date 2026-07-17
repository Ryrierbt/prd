import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { confirmTikTokLogin } from "@/lib/research/collectors/tiktok-login-signal";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await prisma.researchTask.findUnique({ where: { id }, select: { id: true } });

  if (!task) {
    return NextResponse.json({ ok: false, error: "任务不存在。" }, { status: 404 });
  }

  await confirmTikTokLogin(id);
  await prisma.researchTask.update({
    where: { id },
    data: {
      currentStep: "已确认 TikTok 登录，正在搜索视频并读取评论。"
    }
  });
  return NextResponse.json({ ok: true });
}
