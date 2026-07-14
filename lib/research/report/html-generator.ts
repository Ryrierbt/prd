import type { Prisma } from "@prisma/client";
import { countCategories, extractKeywords } from "@/lib/research/analysis/reviews";
import { escapeHtml } from "@/lib/research/utils/text";

type ReportTask = Prisma.ResearchTaskGetPayload<{
  include: {
    sources: true;
    appProfile: true;
    pricingPlans: true;
    reviews: true;
    promotions: true;
    analyses: true;
  };
}>;

export function generateResearchReport(task: ReportTask) {
  const generatedAt = new Date();
  const successfulSources = task.sources.filter((source) => source.status === "SUCCESS");
  const failedSources = task.sources.filter((source) => source.status === "FAILED");
  const completeness = Math.round((successfulSources.length / Math.max(task.sources.length, 1)) * 100);
  const categoryCounts = countCategories(task.reviews);
  const keywords = extractKeywords(task.reviews.map((review) => `${review.title ?? ""} ${review.content}`));
  const reviewTotal = task.reviews.length;
  const appStoreSummary = readAnalysis(task, "APP_STORE_SUMMARY");
  const appStoreRatings = readAnalysis(task, "APP_STORE_RATINGS");
  const deepSeekReviewSummary = readAnalysis(task, "DEEPSEEK_REVIEW_SUMMARY");
  const deepSeekProfileTranslation = readAnalysis(task, "DEEPSEEK_PROFILE_TRANSLATION");
  const deepSeekPricingSummary = readAnalysis(task, "DEEPSEEK_PRICING_SUMMARY");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(task.appName)} 竞品调研报告</title>
  <style>
    html{scroll-behavior:smooth}
    body{margin:0;background:#f7f6f1;color:#17211b;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.65}
    .layout{display:grid;grid-template-columns:240px 1fr;min-height:100vh}
    nav{position:sticky;top:0;height:100vh;padding:28px 20px;border-right:1px solid #d9ded2;background:#fff}
    nav a{display:block;margin:6px 0;padding:7px 8px;color:#42624a;text-decoration:none;font-size:14px;border-left:2px solid transparent}
    nav a:hover,nav a.active{border-left-color:#42624a;background:#dfeee3;color:#17211b}
    main{max-width:1080px;padding:32px}
    section{margin-bottom:24px;padding:24px;border:1px solid #d9ded2;border-radius:8px;background:#fff;scroll-margin-top:20px}
    h1,h2,h3{margin:0 0 12px}
    h1{font-size:32px}
    h2{font-size:22px}
    table{width:100%;border-collapse:collapse;font-size:14px}
    th,td{border-top:1px solid #d9ded2;padding:10px;text-align:left;vertical-align:top}
    th{background:#dfeee3;color:#17211b}
    .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    .metric{border:1px solid #d9ded2;border-radius:8px;padding:14px;background:#fbfbf8}
    .metric strong{display:block;font-size:24px}
    .tag{display:inline-block;margin:3px 4px 3px 0;padding:3px 8px;border:1px solid #d9ded2;border-radius:999px;color:#42624a;font-size:12px}
    .bar{height:10px;border-radius:999px;background:#dfeee3;overflow:hidden}
    .bar span{display:block;height:100%;background:#42624a}
    .muted{color:#647067}
    .source a{color:#42624a;word-break:break-all}
    .warning{border-color:#ead28a;background:#fff9df}
    .ai-summary{white-space:pre-wrap;padding:14px;border:1px solid #d9ded2;background:#fbfbf8}
    @media(max-width:860px){.layout{display:block}nav{position:static;height:auto}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}main{padding:18px}}
  </style>
</head>
<body>
  <div class="layout">
    <nav>
      <strong>${escapeHtml(task.appName)}</strong>
      <a class="active" href="#overview">报告概览</a>
      <a href="#profile">基础信息</a>
      <a href="#pricing">收费模式</a>
      <a href="#features">功能分析</a>
      <a href="#reviews">用户评价</a>
      <a href="#promotion">广告和推广</a>
      <a href="#conclusion">综合结论</a>
      <a href="#sources">数据来源</a>
    </nav>
    <main>
      <section id="overview">
        <h1>${escapeHtml(task.appName)} 竞品调研报告</h1>
        <p class="muted">生成时间：${generatedAt.toLocaleString("zh-CN")}；最近采集时间：${latestFetchTime(task)}</p>
        <div class="grid">
          <div class="metric"><span>数据来源</span><strong>${task.sources.length}</strong></div>
          <div class="metric"><span>成功来源</span><strong>${successfulSources.length}</strong></div>
          <div class="metric"><span>用户评价</span><strong>${reviewTotal}</strong></div>
          <div class="metric"><span>完整度</span><strong>${completeness}%</strong></div>
        </div>
        ${failedSources.length ? `<p class="warning">部分来源采集失败，报告已保留缺失说明，不会用推测内容冒充事实。</p>` : ""}
      </section>

      <section id="profile">
        <h2>基础信息</h2>
        <table>
          <tr><th>产品一句话介绍</th><td>${escapeHtml(profileValue(deepSeekProfileTranslation, "summary", task.appProfile?.summary))}</td></tr>
          <tr><th>产品定位</th><td>${escapeHtml(profileValue(deepSeekProfileTranslation, "positioning", task.appProfile?.positioning))}</td></tr>
          <tr><th>目标用户</th><td>${escapeHtml(profileValue(deepSeekProfileTranslation, "targetUsers", task.appProfile?.targetUsers))}</td></tr>
          <tr><th>主要场景</th><td>${escapeHtml(profileValue(deepSeekProfileTranslation, "useCases", task.appProfile?.useCases))}</td></tr>
          <tr><th>支持平台</th><td>${escapeHtml(profileValue(deepSeekProfileTranslation, "platforms", task.appProfile?.platforms))}</td></tr>
        </table>
      </section>

      <section id="pricing">
        <h2>收费模式</h2>
        <table>
          <thead><tr><th>套餐</th><th>月付价格</th><th>年付价格</th><th>币种</th><th>计费口径</th><th>核心权益</th><th>来源</th></tr></thead>
          <tbody>
            ${task.pricingPlans
              .map(
                (plan) => `<tr><td>${escapeHtml(plan.name)}</td><td>${escapeHtml(plan.monthlyPrice || "暂未获取")}</td><td>${escapeHtml(plan.annualPrice || "暂未获取")}</td><td>${escapeHtml(plan.currency || "暂未获取")}</td><td>${formatBillingPeriod(plan.billingPeriod)}</td><td>${escapeHtml(pricingBenefitsValue(deepSeekPricingSummary, plan.name, plan.features))}</td><td><a href="${escapeHtml(plan.sourceUrl || "#")}" target="_blank" rel="noreferrer">打开来源</a></td></tr>`
              )
              .join("") || `<tr><td colspan="7">暂未获取定价信息</td></tr>`}
          </tbody>
        </table>
        <p class="muted">价格保留原始币种与页面价格，不自动换算人民币。</p>
      </section>

      <section id="features">
        <h2>功能分析</h2>
        ${renderTags(task.appProfile?.features)}
        <p class="muted">以上为系统根据官网和 App Store 公开文本提取的功能关键词，属于系统分析。</p>
      </section>

      <section id="reviews">
        <h2>用户评价</h2>
        ${renderAppStoreRatings(appStoreSummary, appStoreRatings)}
        ${renderDeepSeekReviewSummary(deepSeekReviewSummary)}
        <h3>分类分布</h3>
        ${Object.entries(categoryCounts)
          .map(([category, count]) => {
            const percent = reviewTotal ? Math.round((count / reviewTotal) * 100) : 0;
            return `<p>${escapeHtml(category)}：${count} 条 / ${percent}%</p><div class="bar"><span style="width:${percent}%"></span></div>`;
          })
          .join("") || "<p>暂未获取评价分类</p>"}
        <h3>高频关键词</h3>
        ${keywords.map((item) => `<span class="tag">${escapeHtml(item.keyword)} ${item.count}</span>`).join("") || "暂未获取"}
        <h3>代表性评价</h3>
        ${task.reviews
          .slice(0, 8)
          .map(
            (review) => `<article><strong>${escapeHtml(review.title || "无标题")}</strong><p>${escapeHtml(review.content)}</p><p class="muted">${escapeHtml(review.platform)} · ${escapeHtml(String(review.rating ?? "无评分"))} 星 · ${escapeHtml(review.author || "匿名")} · <a href="${escapeHtml(review.sourceUrl || "#")}" target="_blank" rel="noreferrer">来源</a></p></article>`
          )
          .join("") || "<p>暂未获取用户评价正文。评分概览与评论正文属于不同公开接口，当前未将评分数据伪造成单条评论。</p>"}
      </section>

      <section id="promotion">
        <h2>广告和推广</h2>
        ${task.promotions
          .map(
            (item) => `<article><h3>${escapeHtml(item.title || item.platform)}</h3><p>${escapeHtml(item.content)}</p><p><span class="tag">${escapeHtml(item.targetAudience || "目标人群暂未获取")}</span><span class="tag">${escapeHtml(item.useCase || "场景暂未获取")}</span><span class="tag">${escapeHtml(item.sellingPoints || "卖点暂未获取")}</span></p><p class="source"><a href="${escapeHtml(item.sourceUrl || "#")}" target="_blank" rel="noreferrer">打开来源</a></p></article>`
          )
          .join("") || "<p>暂未获取推广内容</p>"}
      </section>

      <section id="conclusion">
        <h2>综合结论</h2>
        <p><strong>产品优势：</strong>${escapeHtml(inferStrengths(task))}</p>
        <p><strong>集中问题：</strong>${escapeHtml(inferProblems(task))}</p>
        <p><strong>定价特征：</strong>${escapeHtml(task.pricingPlans.length ? "存在免费/付费/企业套餐结构，具体以来源页原始价格为准。" : "暂未获取足够定价数据。")}</p>
        <p><strong>继续调研问题：</strong>Google Play 评价、更多媒体评测、广告资料库和长期价格变化仍需后续扩展。</p>
      </section>

      <section id="sources">
        <h2>数据来源</h2>
        <table>
          <thead><tr><th>来源名称</th><th>类型</th><th>状态</th><th>采集时间</th><th>链接/错误</th></tr></thead>
          <tbody>
            ${task.sources
              .map(
                (source) => `<tr><td>${escapeHtml(source.sourceName)}</td><td>${escapeHtml(source.sourceType)}</td><td>${escapeHtml(source.status)}</td><td>${source.fetchedAt?.toLocaleString("zh-CN") ?? "暂未获取"}</td><td class="source">${source.status === "SUCCESS" ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.url)}</a>` : escapeHtml(source.errorMessage || "未知错误")}</td></tr>`
              )
              .join("")}
          </tbody>
        </table>
      </section>
    </main>
  </div>
  <script>
    const links = Array.from(document.querySelectorAll('nav a'));
    const sections = Array.from(document.querySelectorAll('main section'));
    links.forEach((link) => link.addEventListener('click', (event) => {
      const id = link.getAttribute('href')?.slice(1);
      const section = id ? document.getElementById(id) : null;
      if (!section) return;
      event.preventDefault();
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      links.forEach((item) => item.classList.toggle('active', item === link));
    }));
    const observer = new IntersectionObserver((entries) => {
      const current = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!current) return;
      links.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === '#' + current.target.id));
    }, { rootMargin: '-20% 0px -65% 0px', threshold: [0, 0.2, 0.6] });
    sections.forEach((section) => observer.observe(section));
  </script>
</body>
</html>`;
}

function renderTags(value?: string | null) {
  const tags = value?.split(/[、,]/).map((item) => item.trim()).filter(Boolean) ?? [];
  return tags.length ? tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("") : "<p>暂未获取</p>";
}

function profileValue(translation: Record<string, unknown> | null, field: string, fallback?: string | null) {
  return typeof translation?.[field] === "string" && translation[field].trim() ? translation[field] : fallback || "暂未获取";
}

function pricingBenefitsValue(summary: Record<string, unknown> | null, planName: string, fallback?: string | null) {
  const plans = Array.isArray(summary?.plans) ? summary.plans : [];
  const match = plans.find(
    (plan) => typeof plan === "object" && plan !== null && (plan as Record<string, unknown>).name === planName
  ) as Record<string, unknown> | undefined;
  return typeof match?.benefits === "string" && match.benefits.trim() ? match.benefits : fallback || "暂未获取";
}

function formatBillingPeriod(value?: string | null) {
  if (value === "month") return "月付";
  if (value === "year") return "年付";
  if (value === "month/year") return "月付 / 年付";
  return "暂未获取";
}

function latestFetchTime(task: ReportTask) {
  const times = task.sources
    .map((source) => source.fetchedAt?.getTime())
    .filter((time): time is number => Boolean(time));
  return times.length ? new Date(Math.max(...times)).toLocaleString("zh-CN") : "暂未获取";
}

function inferStrengths(task: ReportTask) {
  const positive = task.reviews.filter((review) => review.sentiment === "positive").length;
  const featureText = task.appProfile?.features || "";
  if (positive || featureText) {
    return `公开评价中好评 ${positive} 条；官网/商店文本突出 ${featureText || "AI、转写、总结等能力"}。`;
  }
  return "暂未获取足够信息。";
}

function inferProblems(task: ReportTask) {
  const negativeReviews = task.reviews.filter((review) => review.sentiment === "negative" || review.categories?.includes("价格反馈"));
  if (negativeReviews.length) {
    return negativeReviews
      .slice(0, 3)
      .map((review) => review.title || review.content.slice(0, 40))
      .join("；");
  }
  return "暂未从当前样本中提取到集中问题。";
}

function readAnalysis(task: ReportTask, analysisType: string) {
  const result = task.analyses.find((analysis) => analysis.analysisType === analysisType);
  if (!result) return null;

  try {
    return JSON.parse(result.resultJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function renderAppStoreRatings(summary: Record<string, unknown> | null, ratings: Record<string, unknown> | null) {
  if (!summary && !ratings) return "";

  const average = typeof summary?.rating === "number" ? summary.rating.toFixed(2) : "暂未获取";
  const ratingCount = typeof summary?.ratingCount === "number" ? summary.ratingCount.toLocaleString("zh-CN") : "暂未获取";
  const histogram = ratings?.histogram && typeof ratings.histogram === "object" ? (ratings.histogram as Record<string, number>) : null;
  const histogramTags = histogram
    ? Object.entries(histogram)
        .sort(([left], [right]) => Number(right) - Number(left))
        .map(([star, count]) => `<span class="tag">${escapeHtml(star)} 星 ${Number(count).toLocaleString("zh-CN")}</span>`)
        .join("")
    : "暂未获取";

  return `<h3>App Store 评分概览</h3><p>平均评分：${escapeHtml(average)} / 5；公开评分数：${escapeHtml(ratingCount)}</p><p>${histogramTags}</p>`;
}

function renderDeepSeekReviewSummary(summary: Record<string, unknown> | null) {
  if (!summary || typeof summary.content !== "string") return "";

  const content = summary.content;
  const reviewCount = typeof summary.reviewCount === "number" ? summary.reviewCount : "若干";
  const model = typeof summary.model === "string" ? summary.model : "DeepSeek";
  return `<h3>DeepSeek 评价总结</h3><p class="muted">基于 ${escapeHtml(String(reviewCount))} 条公开评论生成，模型：${escapeHtml(model)}</p><div class="ai-summary">${escapeHtml(content)}</div>`;
}
