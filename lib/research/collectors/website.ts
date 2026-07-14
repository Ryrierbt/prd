import { prisma } from "@/lib/db";
import { recordSource } from "@/lib/research/collectors/sources";
import { fetchText } from "@/lib/research/utils/fetcher";
import { parseHtmlPage, splitSentences, truncate, uniqueValues } from "@/lib/research/utils/text";

const featureKeywords = [
  "AI",
  "transcription",
  "meeting notes",
  "summary",
  "summaries",
  "record",
  "collaboration",
  "search",
  "Zoom",
  "Google Meet",
  "Microsoft Teams",
  "calendar",
  "speaker"
];

export function inferWebsiteUrl(appName: string, provided?: string | null) {
  if (provided) return provided;
  if (/^otter(\.ai)?$/i.test(appName.trim())) return "https://otter.ai/";
  return null;
}

export async function collectWebsite(taskId: string, appName: string, websiteUrl: string | null) {
  if (!websiteUrl) {
    await recordSource({
      taskId,
      sourceType: "WEBSITE",
      sourceName: "官网",
      url: "about:blank",
      status: "FAILED",
      errorMessage: "未提供官网地址，且第一版暂不自动搜索官网。"
    });
    return null;
  }

  try {
    const rawHtml = await fetchText(websiteUrl, { retries: 1 });
    const page = parseHtmlPage(websiteUrl, rawHtml);
    await recordSource({
      taskId,
      sourceType: "WEBSITE",
      sourceName: "官网首页",
      url: websiteUrl,
      status: "SUCCESS",
      rawContent: `${page.title}\n${page.description}\n${page.text}`,
      fetchedAt: page.fetchedAt
    });

    const matchedFeatures = featureKeywords.filter((keyword) => page.text.toLowerCase().includes(keyword.toLowerCase()));
    const summary = page.description || splitSentences(page.text, 1)[0] || "暂未获取";
    const useCases = inferUseCases(page.text);
    const targetUsers = inferTargetUsers(page.text);

    await prisma.appProfile.upsert({
      where: { taskId },
      update: {
        summary,
        positioning: page.title || `${appName} 公开官网定位`,
        targetUsers: targetUsers.join("、") || "暂未获取",
        useCases: useCases.join("、") || "暂未获取",
        platforms: inferPlatforms(page.text).join("、") || "暂未获取",
        features: uniqueValues(matchedFeatures).join("、") || "暂未获取"
      },
      create: {
        taskId,
        summary,
        positioning: page.title || `${appName} 公开官网定位`,
        targetUsers: targetUsers.join("、") || "暂未获取",
        useCases: useCases.join("、") || "暂未获取",
        platforms: inferPlatforms(page.text).join("、") || "暂未获取",
        features: uniqueValues(matchedFeatures).join("、") || "暂未获取"
      }
    });

    return page;
  } catch (error) {
    await recordSource({
      taskId,
      sourceType: "WEBSITE",
      sourceName: "官网首页",
      url: websiteUrl,
      status: "FAILED",
      errorMessage: error instanceof Error ? error.message : "官网采集失败"
    });
    return null;
  }
}

function inferUseCases(text: string) {
  const cases = [
    ["meeting", "会议记录"],
    ["interview", "访谈转写"],
    ["lecture", "课堂/讲座"],
    ["sales", "销售沟通"],
    ["podcast", "播客/音频内容"],
    ["collabor", "团队协作"]
  ];
  return cases.filter(([keyword]) => text.toLowerCase().includes(keyword)).map(([, label]) => label);
}

function inferTargetUsers(text: string) {
  const users = [
    ["team", "团队用户"],
    ["business", "商务用户"],
    ["sales", "销售团队"],
    ["student", "学生"],
    ["journalist", "记者/研究者"],
    ["enterprise", "企业客户"]
  ];
  return users.filter(([keyword]) => text.toLowerCase().includes(keyword)).map(([, label]) => label);
}

function inferPlatforms(text: string) {
  const platforms = [
    ["web", "Web"],
    ["ios", "iOS"],
    ["android", "Android"],
    ["zoom", "Zoom"],
    ["google meet", "Google Meet"],
    ["microsoft teams", "Microsoft Teams"]
  ];
  return platforms.filter(([keyword]) => text.toLowerCase().includes(keyword)).map(([, label]) => label);
}

