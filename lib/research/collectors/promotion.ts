import { prisma } from "@/lib/db";
import { recordSource } from "@/lib/research/collectors/sources";
import { fetchText } from "@/lib/research/utils/fetcher";
import { getOriginUrl, joinUrl, parseHtmlPage, splitSentences, truncate, uniqueValues } from "@/lib/research/utils/text";

const promotionPaths = ["/", "/features", "/pricing", "/blog", "/customers"];

export async function collectPromotion(taskId: string, websiteUrl: string | null) {
  if (!websiteUrl) {
    await recordSource({
      taskId,
      sourceType: "PROMOTION",
      sourceName: "推广内容",
      url: "about:blank",
      status: "FAILED",
      errorMessage: "缺少官网地址，无法采集官方推广内容。"
    });
    return [];
  }

  const origin = getOriginUrl(websiteUrl);
  if (!origin) return [];

  await prisma.promotionItem.deleteMany({ where: { taskId } });
  const items = [];

  for (const path of promotionPaths) {
    const url = joinUrl(origin, path);
    try {
      const rawHtml = await fetchText(url, { retries: 0, timeoutMs: 12000 });
      const page = parseHtmlPage(url, rawHtml);
      const sellingPoints = extractSellingPoints(page.text);
      const content = [page.title, page.description, ...splitSentences(page.text, 4)].filter(Boolean).join(" ");

      await recordSource({
        taskId,
        sourceType: "PROMOTION",
        sourceName: path === "/" ? "官网首页营销内容" : `官方页面 ${path}`,
        url,
        status: "SUCCESS",
        rawContent: `${page.title}\n${page.description}\n${page.text}`,
        fetchedAt: page.fetchedAt
      });

      const item = await prisma.promotionItem.create({
        data: {
          taskId,
          platform: "Official Website",
          title: page.title || `官方页面 ${path}`,
          content: truncate(content, 1000),
          targetAudience: inferAudience(page.text).join("、") || "暂未获取",
          useCase: inferUseCase(page.text).join("、") || "暂未获取",
          sellingPoints: sellingPoints.join("、") || "暂未获取",
          sourceUrl: url,
          fetchedAt: page.fetchedAt
        }
      });
      items.push(item);
    } catch (error) {
      await recordSource({
        taskId,
        sourceType: "PROMOTION",
        sourceName: path === "/" ? "官网首页营销内容" : `官方页面 ${path}`,
        url,
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "推广页面采集失败"
      });
    }
  }

  return items;
}

function extractSellingPoints(text: string) {
  const points = [
    ["AI", "AI 能力"],
    ["summary", "自动总结"],
    ["transcription", "实时转写"],
    ["productivity", "效率提升"],
    ["collabor", "团队协作"],
    ["security", "安全"],
    ["privacy", "隐私"],
    ["accurate", "准确率"],
    ["free", "免费试用/免费版"]
  ];
  return uniqueValues(points.filter(([keyword]) => text.toLowerCase().includes(keyword.toLowerCase())).map(([, label]) => label));
}

function inferAudience(text: string) {
  const audiences = [
    ["sales", "销售团队"],
    ["business", "商务人士"],
    ["enterprise", "企业客户"],
    ["student", "学生"],
    ["journalist", "记者/研究者"],
    ["team", "团队"]
  ];
  return uniqueValues(audiences.filter(([keyword]) => text.toLowerCase().includes(keyword)).map(([, label]) => label));
}

function inferUseCase(text: string) {
  const useCases = [
    ["meeting", "会议"],
    ["interview", "访谈"],
    ["lecture", "课程"],
    ["conversation", "对话记录"],
    ["webinar", "线上活动"],
    ["podcast", "音频内容"]
  ];
  return uniqueValues(useCases.filter(([keyword]) => text.toLowerCase().includes(keyword)).map(([, label]) => label));
}

