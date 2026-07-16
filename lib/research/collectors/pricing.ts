import { prisma } from "@/lib/db";
import { recordSource } from "@/lib/research/collectors/sources";
import { fetchText } from "@/lib/research/utils/fetcher";
import { joinUrl, parseHtmlPage, uniqueValues } from "@/lib/research/utils/text";

const planNames = ["Free", "Basic", "Pro", "Business", "Enterprise"];

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
    const rawContent = `${page.title}\n${page.description}\n${page.text}`;
    const plans = extractPricingPlans(page.text, pricingUrl, page.fetchedAt);

    await recordSource({
      taskId,
      sourceType: "PRICING",
      sourceName: "定价页",
      url: pricingUrl,
      status: plans.length ? "SUCCESS" : "FAILED",
      rawContent,
      errorMessage: plans.length ? undefined : "定价页已抓取，但未解析出结构化套餐。",
      fetchedAt: page.fetchedAt
    });

    await prisma.pricingPlan.deleteMany({ where: { taskId } });
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
  const structuredPlans = mergePricingPlans(monthlyPlans, annualPlans, sourceUrl, fetchedAt);
  if (structuredPlans.length) return structuredPlans;

  return extractFlatPricingCards(compact, sourceUrl, fetchedAt);
}

function mergePricingPlans(
  monthlyPlans: Map<string, { price: string; currency: string | null; features: string[]; billingPeriod: "month" | "year" }>,
  annualPlans: Map<string, { price: string; currency: string | null; features: string[]; billingPeriod: "month" | "year" }>,
  sourceUrl: string,
  fetchedAt: Date
) {
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
    const price = findPrice(window, name);
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
  const matches = Array.from(text.matchAll(/(Free|Basic|Pro|Business|Enterprise)(?=For|Best Value)/gi)).map((match) => ({
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

function extractFlatPricingCards(text: string, sourceUrl: string, fetchedAt: Date) {
  const cardArea = text.split(/USED ACROSS|UsageTranscript|Frequently Asked Questions/i)[0] ?? text;
  const matches = Array.from(cardArea.matchAll(/(Free|Basic|Pro|Business|Enterprise)(?=For|Best Value)/gi)).map((match) => ({
    name: canonicalPlanName(match[1]),
    index: match.index ?? -1
  }));
  const positions: Array<{ name: string; index: number }> = [];
  const seen = new Set<string>();

  for (const match of matches) {
    if (seen.has(match.name)) continue;
    seen.add(match.name);
    positions.push(match);
  }

  return positions.flatMap((position, index) => {
    const nextIndex = positions[index + 1]?.index ?? cardArea.length;
    const window = cardArea.slice(position.index, nextIndex);
    const prices = priceTokensInOrder(window);
    const monthlyPrice = inferMonthlyPrice(position.name, window, prices);
    const annualPrice = inferAnnualPrice(position.name, window, prices, monthlyPrice);

    if (monthlyPrice === "暂未获取" && annualPrice === "暂未获取") return [];

    return [
      {
        name: position.name,
        monthlyPrice,
        annualPrice,
        currency: prices.length || /free/i.test(window) ? "USD" : null,
        billingPeriod: monthlyPrice !== "暂未获取" && annualPrice !== "暂未获取" ? "month/year" : "year",
        features: extractFeatureSnippets(window).join("；") || "暂未结构化提取",
        sourceUrl,
        fetchedAt
      }
    ];
  });
}

function canonicalPlanName(name: string) {
  return planNames.find((planName) => planName.toLowerCase() === name.toLowerCase()) ?? name;
}

function priceTokensInOrder(text: string) {
  return (text.match(/\$[0-9]+(?:\.[0-9]+)?(?:\*?\/user\/month)?/gi) ?? []).map((token) => token.trim());
}

function inferMonthlyPrice(planName: string, window: string, prices: string[]) {
  if (/free|basic/i.test(planName) && /free/i.test(window)) return prices[0] ?? "$0";
  return prices[0] ?? "暂未获取";
}

function inferAnnualPrice(planName: string, window: string, prices: string[], monthlyPrice: string) {
  if (/free|basic/i.test(planName) && /free/i.test(window)) return prices[1] ?? monthlyPrice;
  return prices[1] ?? (/annual only/i.test(window) ? monthlyPrice : "暂未获取");
}

function extractFeatureSnippets(window: string) {
  return uniqueValues(
    [
      /Unlimited transcription/i.exec(window)?.[0],
      /Unlimited AI summaries/i.exec(window)?.[0],
      /[\d,]+ mins of storage\/(?:team|seat)/i.exec(window)?.[0],
      /Unlimited storage/i.exec(window)?.[0],
      /\d+ AI credits/i.exec(window)?.[0],
      /Transcription in 100\+ languages/i.exec(window)?.[0],
      /Real-time notes & live transcriptions/i.exec(window)?.[0],
      /Meeting search/i.exec(window)?.[0],
      /AskFred: AI assistant/i.exec(window)?.[0],
      /Upload audio\/video file/i.exec(window)?.[0],
      /Video recording/i.exec(window)?.[0],
      /Download transcripts, summaries, recordings/i.exec(window)?.[0],
      /Personal Assistant/i.exec(window)?.[0],
      /AI Skills/i.exec(window)?.[0],
      /Voice Agents/i.exec(window)?.[0],
      /Action items & task Manager/i.exec(window)?.[0],
      /Unlimited integrations/i.exec(window)?.[0],
      /Multi-language Mode/i.exec(window)?.[0],
      /Conversation intelligence/i.exec(window)?.[0],
      /Team analytics \(for admins\)/i.exec(window)?.[0],
      /Public meeting access/i.exec(window)?.[0],
      /User groups/i.exec(window)?.[0],
      /Rules engine/i.exec(window)?.[0],
      /SSO \+ SCIM/i.exec(window)?.[0],
      /Audit Logs \(API\)/i.exec(window)?.[0],
      /HIPAA compliance/i.exec(window)?.[0],
      /Private storage/i.exec(window)?.[0],
      /Custom data retention/i.exec(window)?.[0],
      /Dedicated account manager/i.exec(window)?.[0],
      /transcription[^.。!！?？]{0,120}/i.exec(window)?.[0],
      /summary[^.。!！?？]{0,120}/i.exec(window)?.[0],
      /AI[^.。!！?？]{0,120}/i.exec(window)?.[0],
      /team[^.。!！?？]{0,120}/i.exec(window)?.[0],
      /minutes?[^.。!！?？]{0,120}/i.exec(window)?.[0],
      /storage[^.。!！?？]{0,120}/i.exec(window)?.[0]
    ].filter(Boolean)
  );
}

function findPrice(window: string, planName: string) {
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
