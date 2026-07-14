import { prisma } from "@/lib/db";
import { recordSource } from "@/lib/research/collectors/sources";
import { fetchText } from "@/lib/research/utils/fetcher";
import { joinUrl, parseHtmlPage, splitSentences, truncate, uniqueValues } from "@/lib/research/utils/text";

const planNames = ["Basic", "Pro", "Business", "Enterprise"];

export async function collectPricing(taskId: string, websiteUrl: string | null) {
  if (!websiteUrl) {
    await recordSource({
      taskId,
      sourceType: "PRICING",
      sourceName: "定价页",
      url: "about:blank",
      status: "FAILED",
      errorMessage: "缺少官网地址，无法推断定价页。"
    });
    return [];
  }

  const pricingUrl = joinUrl(websiteUrl, "/pricing");
  try {
    const rawHtml = await fetchText(pricingUrl, { retries: 1 });
    const page = parseHtmlPage(pricingUrl, rawHtml);
    await recordSource({
      taskId,
      sourceType: "PRICING",
      sourceName: "定价页",
      url: pricingUrl,
      status: "SUCCESS",
      rawContent: `${page.title}\n${page.description}\n${page.text}`,
      fetchedAt: page.fetchedAt
    });

    await prisma.pricingPlan.deleteMany({ where: { taskId } });
    const plans = extractPricingPlans(page.text, pricingUrl, page.fetchedAt);
    for (const plan of plans) {
      await prisma.pricingPlan.create({ data: { taskId, ...plan } });
    }
    return plans;
  } catch (error) {
    await recordSource({
      taskId,
      sourceType: "PRICING",
      sourceName: "定价页",
      url: pricingUrl,
      status: "FAILED",
      errorMessage: error instanceof Error ? error.message : "定价页采集失败"
    });
    return [];
  }
}

function extractPricingPlans(text: string, sourceUrl: string, fetchedAt: Date) {
  const compact = text.replace(/\s+/g, " ");
  const blocks = compact.split(/Prices?\s+in\s+USD/i).slice(1, 3);
  const monthlyPlans = extractPricingBlock(blocks[0] ?? "", "month");
  const annualPlans = extractPricingBlock(blocks[1] ?? "", "year");

  return planNames.flatMap((name) => {
    const monthly = monthlyPlans.get(name);
    const annual = annualPlans.get(name);
    if (!monthly && !annual) return [];

    const primary = monthly ?? annual;
    return [
      {
        name,
        monthlyPrice: monthly?.price ?? "暂未获取",
        annualPrice: annual?.price ?? "暂未获取",
        currency: primary?.currency ?? annual?.currency ?? null,
        billingPeriod: monthly && annual ? "month/year" : monthly ? "month" : "year",
        features: primary?.features.join("；") || "暂未结构化提取",
        sourceUrl,
        fetchedAt
      }
    ];
  });
}

function extractPricingBlock(block: string, billingPeriod: "month" | "year") {
  const positions = findSequentialPlanStarts(block);
  const plans = new Map<
    string,
    { price: string; currency: string | null; features: string[]; billingPeriod: "month" | "year" }
  >();

  for (const { name, index } of positions) {
    const position = positions.findIndex((item) => item.name === name && item.index === index);
    const nextIndex = positions[position + 1]?.index ?? block.length;
    const window = block.slice(index, nextIndex);
    const price = findPrice(window, name, billingPeriod);
    const features = uniqueValues(
      [
        /transcription[^.。!！?？]{0,120}/i.exec(window)?.[0],
        /summary[^.。!！?？]{0,120}/i.exec(window)?.[0],
        /AI[^.。!！?？]{0,120}/i.exec(window)?.[0],
        /team[^.。!！?？]{0,120}/i.exec(window)?.[0],
        /minutes?[^.。!！?？]{0,120}/i.exec(window)?.[0],
        /storage[^.。!！?？]{0,120}/i.exec(window)?.[0]
      ].filter(Boolean)
    );

    plans.set(name, {
      price: price.value,
      currency: price.currency,
      features,
      billingPeriod
    });
  }

  return plans;
}

function findSequentialPlanStarts(text: string) {
  // Webflow's flattened text joins headings and subtitles, e.g. "USDBasicFor".
  // The subtitle markers identify actual plan cards and exclude feature text such as "Everything in Basic".
  const matches = Array.from(text.matchAll(/(Basic|Pro|Business|Enterprise)(?=For|Best Value)/gi)).map((match) => ({
    name: match[1],
    index: match.index ?? -1
  }));
  const positions: Array<{ name: string; index: number }> = [];
  let cursor = 0;

  for (const expectedName of planNames) {
    const match = matches.find((candidate) => candidate.name.toLowerCase() === expectedName.toLowerCase() && candidate.index >= cursor);
    if (!match) continue;
    positions.push(match);
    cursor = match.index + match.name.length;
  }

  return positions;
}

function findPrice(window: string, planName: string, billingPeriod?: "month" | "year") {
  if (/enterprise/i.test(planName)) {
    return {
      value: /schedule a demo|contact sales|custom/i.test(window) ? "Schedule a demo / Custom" : "暂未获取",
      currency: null
    };
  }

  if (/basic/i.test(planName) && /free/i.test(window)) {
    return { value: "Free", currency: "USD" };
  }

  const prices = normalizePriceTokens(window.match(/\$[0-9]+(?:\.[0-9]+)?(?:\*?\/user\/month)?/gi) ?? []);
  return {
    value: prices[0] ?? "暂未获取",
    currency: prices.length ? "USD" : null
  };
}

function normalizePriceTokens(tokens: string[]) {
  const unique = new Map<string, string>();
  for (const token of tokens) {
    const amount = token.match(/[0-9]+(?:\.[0-9]+)?/)?.[0];
    if (!amount) continue;
    const existing = unique.get(amount);
    if (!existing || token.includes("/user/month")) {
      unique.set(amount, token);
    }
  }
  return Array.from(unique.values());
}
