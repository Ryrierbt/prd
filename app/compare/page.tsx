import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type CompareSearchParams = {
  ids?: string | string[];
};

type ComparableTask = Awaited<ReturnType<typeof loadComparableTasks>>[number];

type CompareSummary = {
  id: string;
  appName: string;
  iconUrl: string | null;
  createdAt: Date;
  completedAt: Date | null;
  reportCreatedAt: Date;
  positioning: string;
  platforms: string[];
  targetCustomers: string[];
  features: string[];
  featureRisks: string[];
  pricing: string[];
  pricingSource: string;
  ratingSummary: string;
  reviewStats: string;
  positiveInsights: string[];
  problemInsights: string[];
  opportunityInsights: string[];
  promotionSources: string;
  sellingPoints: string[];
  promotionSignals: string[];
  communitySamples: string;
  communityTopics: string[];
  dataCoverage: string[];
};

const maxCompareCount = 5;

export default async function ComparePage({ searchParams }: { searchParams?: Promise<CompareSearchParams> }) {
  const params = (await searchParams) ?? {};
  const tasks = await loadComparableTasks();
  const selectedIds = parseSelectedIds(params.ids, tasks.map((task) => task.id));
  const selectedTasks = selectedIds.length ? tasks.filter((task) => selectedIds.includes(task.id)) : tasks.slice(0, 3);
  const summaries = selectedTasks.slice(0, maxCompareCount).map(buildCompareSummary);

  return (
    <SiteShell activeNav="compare">
      <div className="compare-page">
        <div className="compare-hero">
          <div>
            <p className="workspace-eyebrow">横向对比</p>
            <h1>多竞品横向对比</h1>
            <p>选择 2-5 份已完成报告，对比定位、能力、价格、评价、广告和社区分析，快速判断差异化机会。</p>
          </div>
          <Link href="/" className="workspace-primary-link">
            新建任务
          </Link>
        </div>

        <section className="compare-selector-card">
          <div className="compare-selector-head">
            <div>
              <h2>选择报告</h2>
              <p>默认展示最近 3 份报告；勾选后点击生成对比。</p>
            </div>
            <span>{summaries.length} / {maxCompareCount}</span>
          </div>
          <form className="compare-selector-grid" action="/compare">
            {tasks.map((task) => {
              const checked = selectedIds.length ? selectedIds.includes(task.id) : summaries.some((summary) => summary.id === task.id);
              const disabled = !checked && selectedIds.length >= maxCompareCount;
              return (
                <label key={task.id} className={`compare-option ${checked ? "selected" : ""} ${disabled ? "disabled" : ""}`}>
                  <input type="checkbox" name="ids" value={task.id} defaultChecked={checked} disabled={disabled} />
                  <AppLogo appName={task.appName} iconUrl={task.appProfile?.iconUrl} />
                  <span>
                    <strong>{task.appName}</strong>
                    <small>{task.completedAt?.toLocaleString("zh-CN") ?? task.report?.createdAt.toLocaleString("zh-CN")}</small>
                  </span>
                </label>
              );
            })}
            <div className="compare-selector-actions">
              <button type="submit">生成对比</button>
              <Link href="/compare">重置</Link>
            </div>
          </form>
        </section>

        {summaries.length < 2 ? (
          <div className="compare-empty">
            至少需要 2 份已完成报告才能生成横向对比。可以先创建更多竞品调研任务，或在历史任务中打开已有报告。
          </div>
        ) : (
          <div className="compare-content">
            <CompareOverview summaries={summaries} />
            <CompareMatrix title="基础定位" rows={[
              { label: "定位摘要", getValue: (item) => item.positioning },
              { label: "支持平台", getValue: (item) => item.platforms },
              { label: "目标客户", getValue: (item) => item.targetCustomers }
            ]} summaries={summaries} />
            <CompareMatrix title="功能与能力" rows={[
              { label: "核心能力", getValue: (item) => item.features },
              { label: "用户反馈风险", getValue: (item) => item.featureRisks },
              { label: "产品机会", getValue: (item) => item.opportunityInsights }
            ]} summaries={summaries} />
            <CompareMatrix title="收费模式" rows={[
              { label: "套餐和价格", getValue: (item) => item.pricing },
              { label: "价格来源", getValue: (item) => item.pricingSource }
            ]} summaries={summaries} />
            <CompareMatrix title="用户评价" rows={[
              { label: "评分与样本", getValue: (item) => [item.ratingSummary, item.reviewStats].filter(Boolean) },
              { label: "用户认可", getValue: (item) => item.positiveInsights },
              { label: "主要问题", getValue: (item) => item.problemInsights }
            ]} summaries={summaries} />
            <CompareMatrix title="广告与推广" rows={[
              { label: "覆盖来源", getValue: (item) => item.promotionSources },
              { label: "核心卖点", getValue: (item) => item.sellingPoints },
              { label: "传播信息", getValue: (item) => item.promotionSignals }
            ]} summaries={summaries} />
            <CompareMatrix title="社区分析" rows={[
              { label: "样本概况", getValue: (item) => item.communitySamples },
              { label: "核心议题", getValue: (item) => item.communityTopics }
            ]} summaries={summaries} />
            <CompareMatrix title="数据完整度" rows={[
              { label: "已采集来源", getValue: (item) => item.dataCoverage }
            ]} summaries={summaries} />
          </div>
        )}
      </div>
    </SiteShell>
  );
}

async function loadComparableTasks() {
  return prisma.researchTask.findMany({
    where: {
      report: { isNot: null },
      status: { in: ["COMPLETED", "PARTIAL_COMPLETED"] }
    },
    include: {
      report: true,
      appProfile: true,
      pricingPlans: true,
      reviews: true,
      promotions: true,
      communityItems: true,
      analyses: true,
      sources: true
    },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    take: 60
  });
}

function CompareOverview({ summaries }: { summaries: CompareSummary[] }) {
  return (
    <section className="compare-summary-strip">
      {summaries.map((summary) => (
        <article key={summary.id} className="compare-summary-card">
          <div className="compare-summary-title">
            <AppLogo appName={summary.appName} iconUrl={summary.iconUrl} />
            <div>
              <h2>{summary.appName}</h2>
              <p>{summary.reportCreatedAt.toLocaleString("zh-CN")}</p>
            </div>
          </div>
          <div className="compare-summary-stats">
            <span><strong>{summary.dataCoverage.length}</strong>来源</span>
            <span><strong>{summary.reviewStats.match(/\d+/)?.[0] ?? 0}</strong>评论</span>
            <span><strong>{summary.promotionSignals.length}</strong>传播点</span>
          </div>
          <Link href={`/reports/${summary.id}`}>打开报告</Link>
        </article>
      ))}
    </section>
  );
}

function CompareMatrix({
  title,
  rows,
  summaries
}: {
  title: string;
  rows: Array<{ label: string; getValue: (summary: CompareSummary) => string | string[] }>;
  summaries: CompareSummary[];
}) {
  return (
    <section className="compare-section">
      <h2>{title}</h2>
      <div className="compare-table-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th>对比维度</th>
              {summaries.map((summary) => (
                <th key={summary.id}>{summary.appName}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td className="compare-row-label">{row.label}</td>
                {summaries.map((summary) => (
                  <td key={`${summary.id}-${row.label}`}>{renderCellValue(row.getValue(summary))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function renderCellValue(value: string | string[]) {
  const items = Array.isArray(value) ? value.filter(Boolean) : splitValue(value);
  if (!items.length) return <span className="compare-muted">暂无数据</span>;
  if (items.length === 1) return <p className="compare-cell-text">{items[0]}</p>;
  return (
    <ul className="compare-cell-list">
      {items.slice(0, 6).map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function buildCompareSummary(task: ComparableTask): CompareSummary {
  const appStoreSummary = readAnalysis(task, "APP_STORE_SUMMARY");
  const googlePlaySummary = readAnalysis(task, "GOOGLE_PLAY_SUMMARY");
  const appStoreRatings = readAnalysis(task, "APP_STORE_RATINGS");
  const googlePlayRatings = readAnalysis(task, "GOOGLE_PLAY_RATINGS");
  const reviewSummary = readAnalysis(task, "DEEPSEEK_REVIEW_SUMMARY");
  const pricingSummary = readAnalysis(task, "DEEPSEEK_PRICING_SUMMARY");
  const promotionSummary = readAnalysis(task, "DEEPSEEK_PROMOTION_SUMMARY") ?? readAnalysis(task, "DEEPSEEK_GOOGLE_ADS_SUMMARY");
  const featureSummary = readAnalysis(task, "DEEPSEEK_FEATURE_ANALYSIS");
  const customerSummary = readAnalysis(task, "DEEPSEEK_CUSTOMER_SEGMENTS");
  const communitySummary = readAnalysis(task, "DEEPSEEK_COMMUNITY_SUMMARY");

  return {
    id: task.id,
    appName: task.appName,
    iconUrl: task.appProfile?.iconUrl ?? textValue(appStoreSummary?.icon) ?? null,
    createdAt: task.createdAt,
    completedAt: task.completedAt,
    reportCreatedAt: task.report?.createdAt ?? task.completedAt ?? task.createdAt,
    positioning: firstText([
      task.appProfile?.positioning,
      textValue(appStoreSummary?.description),
      textValue(googlePlaySummary?.summary),
      task.appProfile?.summary
    ], 220),
    platforms: normalizePlatforms(task),
    targetCustomers: customerSegments(customerSummary, task.appProfile?.targetUsers),
    features: featureItems(featureSummary, task.appProfile?.features),
    featureRisks: featureRisks(featureSummary),
    pricing: pricingItems(task, pricingSummary),
    pricingSource: pricingSource(task),
    ratingSummary: ratingSummary(task, appStoreRatings, googlePlayRatings),
    reviewStats: reviewStats(task),
    positiveInsights: insightTitles(reviewSummary?.positiveInsights, reviewSummary?.coverageThemes, "positive"),
    problemInsights: insightTitles(reviewSummary?.problemInsights, reviewSummary?.coverageThemes, "negative"),
    opportunityInsights: insightTitles(reviewSummary?.opportunityInsights, reviewSummary?.coverageThemes, "opportunity"),
    promotionSources: promotionSources(task, promotionSummary),
    sellingPoints: stringArray(promotionSummary?.coreSellingPoints).slice(0, 6),
    promotionSignals: promotionSignals(promotionSummary, task),
    communitySamples: communitySamples(task),
    communityTopics: communityTopics(communitySummary),
    dataCoverage: dataCoverage(task)
  };
}

function readAnalysis(task: ComparableTask, analysisType: string) {
  const result = task.analyses.find((analysis) => analysis.analysisType === analysisType);
  if (!result) return null;
  try {
    return JSON.parse(result.resultJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseSelectedIds(value: string | string[] | undefined, availableIds: string[]) {
  const rawValues = Array.isArray(value) ? value : value ? [value] : [];
  const available = new Set(availableIds);
  return Array.from(new Set(rawValues.flatMap((item) => item.split(",")).map((item) => item.trim()).filter((item) => available.has(item)))).slice(0, maxCompareCount);
}

function firstText(values: Array<string | null | undefined>, limit: number) {
  const value = values.find((item) => item?.trim())?.trim() ?? "";
  return trimText(value, limit);
}

function trimText(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => textValue(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    return splitValue(value);
  }
  return [];
}

function splitValue(value: string) {
  return value
    .split(/[、,，;；\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePlatforms(task: ComparableTask) {
  const values = [
    ...splitValue(task.appProfile?.platforms ?? ""),
    ...task.sources.filter((source) => source.status === "SUCCESS").map((source) => source.sourceType)
  ];
  const platformSet = new Set<string>();
  for (const value of values) {
    const normalized = value.toLowerCase();
    if (normalized.includes("google_play") || normalized.includes("google play") || normalized.includes("android")) platformSet.add("Android");
    else if (normalized.includes("app_store") || normalized.includes("app store") || normalized.includes("ios") || normalized.includes("iphone") || normalized.includes("ipad")) platformSet.add("iOS");
    else if (normalized.includes("website") || normalized.includes("web") || normalized.includes("官网")) platformSet.add("Web");
  }
  if (task.websiteUrl) platformSet.add("Web");
  return Array.from(platformSet);
}

function customerSegments(summary: Record<string, unknown> | null, fallback?: string | null) {
  const segments = Array.isArray(summary?.customerSegments) ? summary.customerSegments : [];
  const names = segments
    .map((item) => (item && typeof item === "object" ? textValue((item as Record<string, unknown>).segmentName) : ""))
    .filter(Boolean)
    .slice(0, 5);
  return names.length ? names : splitValue(fallback ?? "").slice(0, 5);
}

function featureItems(summary: Record<string, unknown> | null, fallback?: string | null) {
  const features = Array.isArray(summary?.features) ? summary.features : [];
  const items = features
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const record = item as Record<string, unknown>;
      const tag = textValue(record.tag);
      const ability = textValue(record.abilitySummary) || textValue(record.officialClaim);
      return [tag, trimText(ability, 90)].filter(Boolean).join("：");
    })
    .filter(Boolean)
    .slice(0, 6);
  return items.length ? items : splitValue(fallback ?? "").slice(0, 6);
}

function featureRisks(summary: Record<string, unknown> | null) {
  const features = Array.isArray(summary?.features) ? summary.features : [];
  return features
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      return stringArray((item as Record<string, unknown>).userCons);
    })
    .filter(Boolean)
    .slice(0, 6);
}

function pricingItems(task: ComparableTask, summary: Record<string, unknown> | null) {
  const aiPlans = Array.isArray(summary?.plans) ? summary.plans : [];
  const plans = aiPlans.length ? aiPlans : task.pricingPlans;
  return plans
    .map((plan) => {
      if (!plan || typeof plan !== "object") return "";
      const record = plan as Record<string, unknown>;
      const name = textValue(record.name);
      const monthly = textValue(record.monthlyPrice);
      const annual = textValue(record.annualPrice);
      const benefits = textValue(record.benefits) || textValue(record.features);
      const price = [monthly && `月付 ${monthly}`, annual && `年付 ${annual}`].filter(Boolean).join(" / ");
      return [name, price, trimText(benefits, 64)].filter(Boolean).join("：");
    })
    .filter(Boolean)
    .slice(0, 5);
}

function pricingSource(task: ComparableTask) {
  const source = task.sources.find((item) => item.sourceType === "PRICING" && item.status === "SUCCESS");
  return source?.url ?? task.pricingPlans.find((plan) => plan.sourceUrl)?.sourceUrl ?? "暂无定价页来源";
}

function ratingSummary(task: ComparableTask, appStoreRatings: Record<string, unknown> | null, googlePlayRatings: Record<string, unknown> | null) {
  const appRating = textValue(appStoreRatings?.averageRating) || numberText(appStoreRatings?.averageUserRating);
  const googleRating = textValue(googlePlayRatings?.score) || numberText(googlePlayRatings?.averageRating);
  const parts = [
    appRating ? `App Store ${appRating}` : "",
    googleRating ? `Google Play ${googleRating}` : ""
  ].filter(Boolean);
  if (parts.length) return parts.join(" / ");
  const ratings = task.reviews.map((review) => review.rating).filter((rating): rating is number => typeof rating === "number");
  if (!ratings.length) return "";
  return `评论均分 ${(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1)}`;
}

function numberText(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "";
}

function reviewStats(task: ComparableTask) {
  const byPlatform = task.reviews.reduce<Record<string, number>>((acc, review) => {
    acc[review.platform] = (acc[review.platform] ?? 0) + 1;
    return acc;
  }, {});
  const platformText = Object.entries(byPlatform).map(([platform, count]) => `${platform} ${count}`).join(" / ");
  return `入库 ${task.reviews.length} 条${platformText ? `（${platformText}）` : ""}`;
}

function insightTitles(value: unknown, coverageThemes: unknown, sentiment: string) {
  const direct = objectTitles(value);
  if (direct.length) return direct.slice(0, 6);
  if (!Array.isArray(coverageThemes)) return [];
  return coverageThemes
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const record = item as Record<string, unknown>;
      const itemSentiment = textValue(record.sentiment);
      if (itemSentiment !== sentiment) return "";
      return textValue(record.title) || textValue(record.theme) || textValue(record.primaryTheme);
    })
    .filter(Boolean)
    .slice(0, 6);
}

function objectTitles(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object") return "";
      const record = item as Record<string, unknown>;
      return textValue(record.title) || textValue(record.theme) || textValue(record.summary);
    })
    .filter(Boolean);
}

function promotionSources(task: ComparableTask, summary: Record<string, unknown> | null) {
  const sourceCoverage = textValue(summary?.sourceCoverage);
  if (sourceCoverage) return sourceCoverage;
  const counts = task.promotions.reduce<Record<string, number>>((acc, item) => {
    acc[item.platform] = (acc[item.platform] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).map(([platform, count]) => `${platform} ${count}`).join(" / ");
}

function promotionSignals(summary: Record<string, unknown> | null, task: ComparableTask) {
  const signals = Array.isArray(summary?.communicationSignals) ? summary.communicationSignals : [];
  const items = signals
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const record = item as Record<string, unknown>;
      return [textValue(record.title), trimText(textValue(record.summary), 90)].filter(Boolean).join("：");
    })
    .filter(Boolean)
    .slice(0, 5);
  if (items.length) return items;
  return task.promotions.map((item) => trimText(item.sellingPoints || item.content, 90)).filter(Boolean).slice(0, 5);
}

function communitySamples(task: ComparableTask) {
  const counts = task.communityItems.reduce<Record<string, number>>((acc, item) => {
    acc[item.platform] = (acc[item.platform] ?? 0) + 1;
    return acc;
  }, {});
  const sourceText = Object.entries(counts).map(([platform, count]) => `${platform} ${count}`).join(" / ");
  return `精选样本 ${task.communityItems.length} 条${sourceText ? `（${sourceText}）` : ""}`;
}

function communityTopics(summary: Record<string, unknown> | null) {
  return objectTitles(summary?.hotTopics).slice(0, 5);
}

function dataCoverage(task: ComparableTask) {
  const successful = new Set(task.sources.filter((source) => source.status === "SUCCESS").map((source) => source.sourceType));
  const items = [
    task.websiteUrl && successful.has("WEBSITE") ? "官网" : "",
    successful.has("PRICING") || task.pricingPlans.length ? "收费模式" : "",
    successful.has("APP_STORE") || task.reviews.some((review) => review.platform.includes("App Store")) ? "Apple App Store" : "",
    successful.has("GOOGLE_PLAY") || task.reviews.some((review) => review.platform.includes("Google Play")) ? "Google Play" : "",
    task.promotions.some((promotion) => promotion.platform.toLowerCase().includes("google")) ? "Google 广告" : "",
    task.promotions.some((promotion) => promotion.platform.toLowerCase().includes("meta") || promotion.platform.toLowerCase().includes("facebook")) ? "Meta 广告" : "",
    task.promotions.some((promotion) => promotion.platform.includes("官网")) ? "官网推广" : "",
    task.communityItems.some((item) => item.platform === "YouTube") ? "YouTube" : "",
    task.communityItems.some((item) => item.platform === "TikTok") ? "TikTok" : "",
    task.communityItems.some((item) => item.platform === "Reddit") ? "Reddit" : ""
  ].filter(Boolean);
  return Array.from(new Set(items));
}

function AppLogo({ appName, iconUrl }: { appName: string; iconUrl?: string | null }) {
  const initial = appName.trim().slice(0, 1).toUpperCase() || "?";
  return (
    <span className="compare-app-logo">
      {iconUrl ? <img src={iconUrl} alt={`${appName} logo`} /> : <span>{initial}</span>}
    </span>
  );
}
