import { prisma } from "@/lib/db";

const deepSeekApiKeySetting = "deepseek_api_key";

export async function getDeepSeekApiKey() {
  const savedSetting = await prisma.appSetting.findUnique({ where: { key: deepSeekApiKeySetting } });
  return savedSetting?.value || process.env.DEEPSEEK_API_KEY || null;
}

export async function saveDeepSeekApiKey(apiKey: string) {
  await prisma.appSetting.upsert({
    where: { key: deepSeekApiKeySetting },
    update: { value: apiKey },
    create: { key: deepSeekApiKeySetting, value: apiKey }
  });
}

export async function clearDeepSeekApiKey() {
  await prisma.appSetting.deleteMany({ where: { key: deepSeekApiKeySetting } });
}

export async function isDeepSeekConfigured() {
  return Boolean(await getDeepSeekApiKey());
}
