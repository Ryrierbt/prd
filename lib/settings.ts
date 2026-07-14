import { prisma } from "@/lib/db";

const deepSeekApiKeySetting = "deepseek_api_key";
const metaAdLibraryAccessTokenSetting = "meta_ad_library_access_token";

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

export async function getMetaAdLibraryAccessToken() {
  const savedSetting = await prisma.appSetting.findUnique({ where: { key: metaAdLibraryAccessTokenSetting } });
  return savedSetting?.value || process.env.META_AD_LIBRARY_ACCESS_TOKEN || null;
}

export async function saveMetaAdLibraryAccessToken(accessToken: string) {
  await prisma.appSetting.upsert({
    where: { key: metaAdLibraryAccessTokenSetting },
    update: { value: accessToken },
    create: { key: metaAdLibraryAccessTokenSetting, value: accessToken }
  });
}

export async function clearMetaAdLibraryAccessToken() {
  await prisma.appSetting.deleteMany({ where: { key: metaAdLibraryAccessTokenSetting } });
}

export async function isMetaAdLibraryConfigured() {
  return Boolean(await getMetaAdLibraryAccessToken());
}
