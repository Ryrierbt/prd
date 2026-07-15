import type { Prisma } from "@prisma/client";
import { extractKeywords } from "@/lib/research/analysis/reviews";
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
  const keywords = extractKeywords(task.reviews.map((review) => `${review.title ?? ""} ${review.content}`));
  const reviewTotal = task.reviews.length;
  const appStoreSummary = readAnalysis(task, "APP_STORE_SUMMARY");
  const appStoreRatings = readAnalysis(task, "APP_STORE_RATINGS");
  const deepSeekReviewSummary = readAnalysis(task, "DEEPSEEK_REVIEW_SUMMARY");
  const deepSeekProfileTranslation = readAnalysis(task, "DEEPSEEK_PROFILE_TRANSLATION");
  const deepSeekPricingSummary = readAnalysis(task, "DEEPSEEK_PRICING_SUMMARY");
  const deepSeekPromotionSummary = readAnalysis(task, "DEEPSEEK_PROMOTION_SUMMARY") ?? readAnalysis(task, "DEEPSEEK_GOOGLE_ADS_SUMMARY");
  const deepSeekFeatureAnalysis = readAnalysis(task, "DEEPSEEK_FEATURE_ANALYSIS");
  const deepSeekCustomerSegments = readAnalysis(task, "DEEPSEEK_CUSTOMER_SEGMENTS");
  const deepSeekCustomerSegmentsError = readAnalysis(task, "DEEPSEEK_CUSTOMER_SEGMENTS_ERROR");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(task.appName)} 竞品调研报告</title>
  <style>
    html{scroll-behavior:smooth}
    body{margin:0;background:#f5f8ff;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.65}
    .layout{display:grid;grid-template-columns:240px 1fr;min-height:100vh}
    nav{position:sticky;top:0;height:100vh;padding:28px 20px;border-right:1px solid #d8e2f3;background:#fff}
    nav a{display:block;margin:6px 0;padding:7px 8px;color:#315f9f;text-decoration:none;font-size:14px;border-left:2px solid transparent}
    nav a:hover,nav a.active{border-left-color:#2563eb;background:#eaf2ff;color:#0f172a}
    main{max-width:1080px;padding:32px}
    section{margin-bottom:24px;padding:24px;border:1px solid #d8e2f3;border-radius:8px;background:#fff;scroll-margin-top:20px;box-shadow:0 8px 22px rgba(37,99,235,.05)}
    h1,h2,h3{margin:0 0 12px}
    h1{font-size:32px}
    h2{font-size:22px}
    table{width:100%;border-collapse:collapse;font-size:14px}
    th,td{border-top:1px solid #d8e2f3;padding:10px;text-align:left;vertical-align:top}
    th{background:#eaf2ff;color:#0f172a}
    .info-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    .info-card{border:1px solid #d8e2f3;border-radius:8px;background:#fff;padding:14px;min-height:72px}
    .info-card strong{display:block;margin-bottom:5px;color:#1e3a8a;font-size:13px}
    .info-card p{margin:0;color:#0f172a;font-size:13px;line-height:1.55}
    .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    .metric{border:1px solid #d8e2f3;border-radius:8px;padding:14px;background:#f8fbff}
    .metric strong{display:block;font-size:24px}
    .tag{display:inline-block;margin:3px 4px 3px 0;padding:3px 8px;border:1px solid #c8daf8;border-radius:999px;color:#2563eb;background:#f1f6ff;font-size:12px}
    .feature-panel{padding:2px 0 0}
    .feature-meta{margin:0 0 14px;color:#475569;font-size:14px}
    .feature-list{display:grid;gap:8px}
    .feature-item{border:1px solid #d8e2f3;border-radius:8px;background:#fff;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.04)}
    .feature-item[open]{border-color:#a9c7f8;box-shadow:0 10px 24px rgba(37,99,235,.10)}
    .feature-item summary{display:flex;align-items:center;gap:10px;cursor:pointer;list-style:none;padding:13px 16px;font-weight:700;color:#0f172a}
    .feature-item summary::-webkit-details-marker{display:none}
    .feature-item summary::after{content:"展开";margin-left:auto;color:#64748b;font-size:12px;font-weight:500}
    .feature-item[open] summary::after{content:"收起"}
    .feature-item summary span{display:inline-block;padding:2px 8px;border:1px solid #bfdbfe;border-radius:999px;color:#1d4ed8;background:#eff6ff;font-size:12px;font-weight:500}
    .feature-body{margin:0 16px 16px;border:1px solid #d8e2f3;border-radius:8px;background:#f8fbff;overflow:hidden}
    .feature-row{display:grid;grid-template-columns:150px 1fr;border-bottom:1px solid #d8e2f3}
    .feature-row:last-child{border-bottom:0}
    .feature-label{padding:11px 14px;font-weight:700;color:#1e3a8a;background:#eef5ff}
    .feature-value{padding:11px 14px}
    .feature-feedback{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px 14px}
    .feature-feedback-box{border-radius:8px;padding:12px;background:#eef6ff}
    .feature-feedback-box.risk{background:#fff8ec}
    .feature-feedback-box strong{display:block;margin-bottom:6px}
    .feature-feedback-box ul{margin:0;padding-left:18px}
    .customer-module{margin-top:22px;padding-top:8px}
    .customer-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
    .customer-head h3{margin:0}
    .customer-tabs{display:flex;flex-wrap:wrap;gap:14px;margin:10px 0 18px;border-bottom:1px solid #d8e2f3}
    .customer-tab{appearance:none;border:0;background:transparent;padding:9px 2px;color:#475569;font:inherit;font-size:13px;cursor:pointer;border-bottom:2px solid transparent}
    .customer-tab.active{color:#2563eb;border-bottom-color:#2563eb;font-weight:700}
    .customer-cards{display:none;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:8px 0 18px}
    .customer-cards.active{display:grid}
    .customer-card{border:1px solid #d8e2f3;border-radius:8px;background:#fff;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.04)}
    .customer-card[open]{border-color:#a9c7f8;box-shadow:0 10px 24px rgba(37,99,235,.09)}
    .customer-card summary{cursor:pointer;list-style:none;padding:14px}
    .customer-card summary::-webkit-details-marker{display:none}
    .customer-card-title{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}
    .customer-card-title strong{font-size:16px;color:#0f172a}
    .customer-badges{display:flex;flex-wrap:wrap;gap:6px}
    .badge{display:inline-block;padding:2px 8px;border-radius:999px;border:1px solid #c8daf8;background:#f1f6ff;color:#2563eb;font-size:12px;white-space:nowrap}
    .badge.warning{border-color:#f7d58d;background:#fff8ec;color:#9a5b00}
    .customer-preview{display:grid;gap:7px;color:#334155;font-size:13px}
    .customer-preview div strong{color:#1e3a8a}
    .customer-more{margin:10px 0 0;padding-top:8px;border-top:1px solid #edf3ff;color:#475569;font-size:12px}
    .customer-detail{padding:0 14px 14px}
    .customer-detail-grid{display:grid;grid-template-columns:1fr;gap:0;border:1px solid #d8e2f3;border-radius:8px;background:#f8fbff;overflow:hidden}
    .customer-detail-item{display:grid;grid-template-columns:96px minmax(0,1fr);gap:10px;padding:9px 12px;border-bottom:1px solid #e5eefc;min-width:0}
    .customer-detail-item:last-child{border-bottom:0}
    .customer-detail-item strong{display:block;color:#1e3a8a}
    .customer-detail-item span{display:block;min-width:0;overflow-wrap:anywhere;word-break:break-word}
    .customer-summary-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .customer-summary-card{border:1px solid #d8e2f3;border-radius:8px;background:#f8fbff;padding:12px}
    .customer-summary-card strong{display:block;color:#0f172a;margin-bottom:6px}
    .industry-share{font-size:22px;font-weight:800;color:#2563eb;margin:4px 0}
    .muted{color:#64748b}
    .source a{color:#2563eb;word-break:break-all}
    .warning{border-color:#ead28a;background:#fff9df}
    .review-module{display:grid;gap:18px}
    .review-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
    .review-head h2{margin-bottom:4px}
    .review-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}
    .review-filter{padding:7px 11px;border:1px solid #d8e2f3;border-radius:8px;background:#f8fbff;color:#334155;font-size:13px;white-space:nowrap}
    .review-notice{padding:10px 12px;border:1px solid #bfdbfe;border-radius:8px;background:#eff6ff;color:#1d4ed8;font-size:13px}
    .review-metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}
    .review-metric-card{border:1px solid #d8e2f3;border-radius:8px;background:#fff;padding:13px;min-width:0;box-shadow:0 1px 3px rgba(15,23,42,.04)}
    .review-metric-card span{display:block;margin-bottom:7px;color:#64748b;font-size:12px}
    .review-metric-card strong{display:block;color:#0f172a;font-size:26px;line-height:1.1}
    .review-metric-card small{display:block;margin-top:6px;color:#64748b;font-size:12px;overflow-wrap:anywhere}
    .stars{color:#f59e0b;letter-spacing:1px}
    .review-summary-card{border:1px solid #d8e2f3;border-radius:8px;background:#fff;padding:16px}
    .review-summary-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
    .review-summary-head h3{margin:0}
    .review-summary-overview{display:grid;grid-template-columns:44px 1fr;gap:12px;align-items:center;margin-bottom:14px;padding:14px;border:1px solid #bfdbfe;border-radius:8px;background:#f8fbff}
    .review-summary-mark{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:#dbeafe;color:#1d4ed8;font-weight:800}
    .review-summary-overview strong{display:block;margin-bottom:4px;color:#0f172a}
    .review-summary-overview p{margin:0;color:#334155;font-size:13px;line-height:1.55;overflow-wrap:anywhere}
    .review-summary-layout{display:grid;grid-template-columns:1fr minmax(0,1.75fr);gap:14px}
    .review-summary-side{display:grid;gap:12px}
    .review-summary-panel{border:1px solid #d8e2f3;border-radius:8px;background:#fff;padding:14px;min-width:0}
    .review-summary-panel.good{border-color:#bbf7d0;background:#f7fffb}
    .review-summary-panel.bad{border-color:#fecaca;background:#fff8f8}
    .review-summary-panel.opportunity{border-color:#bfdbfe;background:#f8fbff}
    .review-summary-panel h4{margin:0 0 9px;color:#0f172a;font-size:15px}
    .review-summary-panel p{margin:0;color:#334155;font-size:13px;line-height:1.6;overflow-wrap:anywhere}
    .review-summary-keywords{display:flex;align-items:center;gap:8px;margin-top:14px;padding:10px 12px;border:1px solid #d8e2f3;border-radius:8px;background:#f8fbff}
    .review-summary-keywords strong{white-space:nowrap;color:#1e3a8a;font-size:13px}
    .review-summary-keywords div{display:flex;flex-wrap:wrap;gap:6px}
    .review-grid{display:grid;grid-template-columns:minmax(260px,36%) 1fr;gap:14px}
    .sentiment-card,.topic-card{border:1px solid #d8e2f3;border-radius:8px;background:#fff;padding:16px;min-width:0}
    .topic-card{overflow-x:auto}
    .sentiment-layout{display:grid;grid-template-columns:150px 1fr;align-items:center;gap:18px}
    .sentiment-donut{width:150px;aspect-ratio:1;border-radius:50%;display:grid;place-items:center;position:relative;background:conic-gradient(#22c55e 0 var(--positive),#cbd5e1 var(--positive) var(--neutral),#ef4444 var(--neutral) var(--negative),#f59e0b var(--negative) 100%)}
    .sentiment-donut::after{content:"";position:absolute;inset:26px;border-radius:50%;background:#fff}
    .sentiment-donut strong{position:relative;z-index:1;font-size:24px}
    .sentiment-donut span{position:relative;z-index:1;display:block;color:#64748b;font-size:12px;text-align:center}
    .sentiment-legend{display:grid;gap:9px}
    .sentiment-legend div{display:grid;grid-template-columns:12px 1fr auto;align-items:center;gap:8px;color:#334155;font-size:13px}
    .legend-dot{width:10px;height:10px;border-radius:999px;background:#cbd5e1}
    .legend-dot.positive{background:#22c55e}.legend-dot.negative{background:#ef4444}.legend-dot.mixed{background:#f59e0b}
    .topic-table{width:100%;min-width:620px;font-size:13px}
    .topic-table th,.topic-table td{padding:9px 8px}
    .topic-table td{overflow-wrap:anywhere}
    .topic-bar{width:86px;height:7px;border-radius:999px;background:#e5edf8;overflow:hidden}
    .topic-bar span{display:block;height:100%;border-radius:999px;background:#2563eb}
    .count-good{color:#15803d}.count-bad{color:#dc2626}
    .insight-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
    .insight-card{border:1px solid #d8e2f3;border-radius:8px;background:#fff;overflow:hidden;min-width:0}
    .insight-card h3{margin:0;padding:13px 14px;border-bottom:1px solid #e5eefc;background:#f8fbff;font-size:16px}
    .insight-card.good h3{background:#ecfdf5;color:#047857}
    .insight-card.bad h3{background:#fff1f2;color:#dc2626}
    .insight-card.opportunity h3{background:#f5f3ff;color:#6d28d9}
    .insight-list{display:grid;gap:0;margin:0;padding:0;list-style:none}
    .insight-list li{display:grid;grid-template-columns:24px 1fr auto;gap:9px;padding:12px 14px;border-bottom:1px solid #eef4ff;min-width:0}
    .insight-list li:last-child{border-bottom:0}
    .insight-rank{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#eff6ff;color:#2563eb;font-size:12px;font-weight:700}
    .insight-main{min-width:0}
    .insight-main strong{display:block;color:#0f172a;font-size:13px}
    .insight-main span{display:block;margin-top:3px;color:#64748b;font-size:12px;overflow-wrap:anywhere}
    .severity{align-self:start;padding:2px 7px;border-radius:999px;background:#eff6ff;color:#2563eb;font-size:12px;white-space:nowrap}
    .severity.good{background:#dcfce7;color:#15803d}.severity.bad{background:#fee2e2;color:#dc2626}.severity.medium{background:#fef3c7;color:#a16207}
    .review-tabs-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:4px 0 0}
    .review-tabs{display:flex;flex-wrap:wrap;gap:16px;border-bottom:1px solid #d8e2f3}
    .review-tab{appearance:none;border:0;background:transparent;padding:10px 0;color:#475569;font:inherit;font-size:13px;cursor:pointer;border-bottom:2px solid transparent}
    .review-tab.active{color:#2563eb;border-bottom-color:#2563eb;font-weight:700}
    .review-panel{display:none;margin-top:12px}
    .review-panel.active{display:block}
    .review-card-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    .review-card{display:flex;flex-direction:column;gap:9px;border:1px solid #d8e2f3;border-radius:8px;background:#fff;padding:13px;min-width:0}
    .review-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px;color:#334155;font-size:12px}
    .review-card strong{font-size:13px;color:#0f172a;overflow-wrap:anywhere}
    .review-card p{margin:0;color:#334155;font-size:13px;line-height:1.55;overflow-wrap:anywhere}
    .review-card-tags{margin-top:auto}
    .promotion-module{display:grid;gap:16px}
    .promotion-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:16px;border-bottom:1px solid #e5eefc}
    .promotion-head h2{margin-bottom:4px}
    .promotion-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;min-width:420px}
    .promotion-stat{border:1px solid #d8e2f3;border-radius:8px;background:#fff;padding:12px;text-align:center}
    .promotion-stat strong{display:block;color:#1d4ed8;font-size:24px;line-height:1.1}
    .promotion-stat span{display:block;margin-top:5px;color:#475569;font-size:12px}
    .promotion-title{display:flex;align-items:center;gap:8px;margin:0 0 10px;color:#0f172a;font-size:16px}
    .promotion-title::before{content:"";display:block;width:3px;height:16px;border-radius:999px;background:#2563eb}
    .promotion-overview-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    .promotion-card{border:1px solid #d8e2f3;border-radius:8px;background:#fff;padding:14px;min-width:0;box-shadow:0 1px 3px rgba(15,23,42,.04)}
    .promotion-card strong{display:block;margin-bottom:6px;color:#0f172a;font-size:14px;overflow-wrap:anywhere}
    .promotion-card p{margin:0;color:#334155;font-size:13px;line-height:1.55;overflow-wrap:anywhere}
    .promotion-card .promotion-tags{margin-top:9px}
    .promotion-signal-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    .promotion-signal{border:1px solid #d8e2f3;border-radius:8px;background:#fff;padding:14px;min-width:0}
    .promotion-signal strong{display:block;margin-bottom:5px;color:#0f172a}
    .promotion-signal p{margin:0 0 9px;color:#334155;font-size:13px;line-height:1.55;overflow-wrap:anywhere}
    .promotion-audience-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .promotion-audience{border:1px solid #d8e2f3;border-radius:8px;background:#fff;padding:14px;min-width:0}
    .promotion-audience-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px}
    .promotion-audience-head strong{color:#0f172a;overflow-wrap:anywhere}
    .promotion-audience dl{display:grid;gap:6px;margin:0}
    .promotion-audience div{display:grid;grid-template-columns:82px minmax(0,1fr);gap:8px;color:#334155;font-size:13px}
    .promotion-audience dt{color:#1e3a8a;font-weight:700}
    .promotion-audience dd{margin:0;overflow-wrap:anywhere}
    .promotion-strategy-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    .promotion-strategy{position:relative;border:1px solid #d8e2f3;border-radius:8px;background:#fff;padding:15px;min-height:120px;overflow:hidden}
    .promotion-strategy strong{display:block;margin-bottom:8px;color:#0f172a}
    .promotion-strategy ul{margin:0;padding-left:18px;color:#334155;font-size:13px}
    .promotion-strategy li{margin:4px 0;overflow-wrap:anywhere}
    .promotion-tags{display:flex;flex-wrap:wrap;gap:5px}
    .promotion-empty{padding:16px;border:1px dashed #b9cff0;border-radius:8px;background:#f8fbff;color:#64748b}
    .promotion-detail{border:1px solid #d8e2f3;border-radius:8px;background:#fff;overflow:hidden}
    .promotion-detail summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;cursor:pointer;list-style:none;font-weight:700;color:#0f172a}
    .promotion-detail summary::-webkit-details-marker{display:none}
    .promotion-detail summary::after{content:"展开";color:#64748b;font-size:12px;font-weight:500}
    .promotion-detail[open] summary::after{content:"收起"}
    .promotion-detail-body{padding:0 16px 16px;border-top:1px solid #e5eefc}
    .promotion-material-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:14px}
    .promotion-material{display:flex;flex-direction:column;gap:9px;border:1px solid #d8e2f3;border-radius:8px;background:#f8fbff;padding:12px;min-width:0}
    .promotion-material-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
    .promotion-material-head strong{color:#0f172a;font-size:14px;overflow-wrap:anywhere}
    .promotion-material p{margin:0;color:#334155;font-size:13px;line-height:1.55;overflow-wrap:anywhere}
    .promotion-material-image{display:block;width:100%;max-height:160px;object-fit:contain;border:1px solid #d8e2f3;border-radius:8px;background:#fff}
    .promotion-material-source{margin-top:auto;font-size:13px}
    @media(max-width:1100px){.review-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.insight-grid,.review-card-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:1100px){.promotion-head{display:block}.promotion-stats{min-width:0;margin-top:12px}.promotion-overview-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.promotion-signal-grid,.promotion-strategy-grid,.promotion-material-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:860px){.layout{display:block}nav{position:static;height:auto}.grid,.info-grid,.review-metrics,.promotion-stats{grid-template-columns:repeat(2,minmax(0,1fr))}main{padding:18px}.feature-row,.feature-feedback,.customer-cards,.customer-detail-grid,.customer-summary-grid,.review-grid,.review-summary-layout,.insight-grid,.review-card-grid,.promotion-overview-grid,.promotion-signal-grid,.promotion-audience-grid,.promotion-strategy-grid,.promotion-material-grid{grid-template-columns:1fr}.feature-label{padding-bottom:0}.feature-item summary{align-items:flex-start;flex-wrap:wrap}.feature-item summary::after{width:100%;margin-left:0}.customer-card-title,.review-head,.review-tabs-head{display:block}.customer-badges,.review-actions{margin-top:8px;justify-content:flex-start}.sentiment-layout{grid-template-columns:1fr}.sentiment-donut{margin:auto}.review-summary-keywords{display:block}.review-summary-keywords div{margin-top:8px}}
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
        <div class="info-grid">
          <div class="info-card"><strong>产品一句话介绍</strong><p>${escapeHtml(profileValue(deepSeekProfileTranslation, "summary", task.appProfile?.summary))}</p></div>
          <div class="info-card"><strong>产品定位</strong><p>${escapeHtml(profileValue(deepSeekProfileTranslation, "positioning", task.appProfile?.positioning))}</p></div>
          <div class="info-card"><strong>主要场景</strong><p>${escapeHtml(profileValue(deepSeekProfileTranslation, "useCases", task.appProfile?.useCases))}</p></div>
          <div class="info-card"><strong>支持平台</strong><p>${escapeHtml(profileValue(deepSeekProfileTranslation, "platforms", task.appProfile?.platforms))}</p></div>
        </div>
        ${renderCustomerSegments(deepSeekCustomerSegments, task.appProfile?.targetUsers, deepSeekCustomerSegmentsError)}
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
        ${renderDeepSeekFeatureAnalysis(deepSeekFeatureAnalysis, task.appProfile?.features)}
      </section>

      <section id="reviews">
        ${renderReviewAnalysisSection(task, appStoreSummary, appStoreRatings, deepSeekReviewSummary, keywords)}
      </section>

      <section id="promotion">
        ${renderPromotionSection(task.promotions, deepSeekPromotionSummary)}
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
    document.querySelectorAll('.customer-module').forEach((module) => {
      const tabs = Array.from(module.querySelectorAll('[data-customer-tab]'));
      const panels = Array.from(module.querySelectorAll('[data-customer-panel]'));
      tabs.forEach((tab) => tab.addEventListener('click', () => {
        const target = tab.getAttribute('data-customer-tab');
        tabs.forEach((item) => item.classList.toggle('active', item === tab));
        panels.forEach((panel) => panel.classList.toggle('active', panel.getAttribute('data-customer-panel') === target));
      }));
    });
    document.querySelectorAll('.review-module').forEach((module) => {
      const tabs = Array.from(module.querySelectorAll('[data-review-tab]'));
      const panels = Array.from(module.querySelectorAll('[data-review-panel]'));
      tabs.forEach((tab) => tab.addEventListener('click', () => {
        const target = tab.getAttribute('data-review-tab');
        tabs.forEach((item) => item.classList.toggle('active', item === tab));
        panels.forEach((panel) => panel.classList.toggle('active', panel.getAttribute('data-review-panel') === target));
      }));
    });
  </script>
</body>
</html>`;
}

type ReviewItem = ReportTask["reviews"][number];

type ReviewStats = {
  total: number;
  averageRating: string;
  ratingCount: string;
  positive: number;
  neutral: number;
  negative: number;
  featureRequests: number;
  positiveRate: number;
  neutralRate: number;
  negativeRate: number;
  featureRequestRate: number;
};

type ReviewTopic = {
  name: string;
  categories: string[];
  keywords: string[];
  count: number;
  coverage: number;
  positive: number;
  negative: number;
  tags: string[];
};

type ReviewInsight = {
  title: string;
  count: number;
  percent: number;
  quote: string;
  badge: string;
  badgeKind: "good" | "bad" | "medium";
};

type ReviewTopicDefinition = {
  name: string;
  categories: string[];
  keywords: string[];
  tags: string[];
};

const reviewTopicDefinitions: ReviewTopicDefinition[] = [
  { name: "会议总结", categories: ["功能反馈", "用户诉求"], keywords: ["summary", "summaries", "summarize", "recap", "notes", "action item"], tags: ["摘要质量", "行动项", "会后纪要"] },
  { name: "转写准确率", categories: ["准确性问题"], keywords: ["accurate", "accuracy", "transcribe", "transcription", "wrong", "mistake"], tags: ["转写准确率", "识别错误", "文本质量"] },
  { name: "多人识别", categories: ["准确性问题"], keywords: ["speaker", "speakers", "identify", "recognition", "diarization"], tags: ["说话人识别", "多人会议", "角色区分"] },
  { name: "录音记录", categories: ["功能反馈", "用户诉求"], keywords: ["record", "recording", "audio", "listen", "voice"], tags: ["会议录音", "音频记录", "实时捕捉"] },
  { name: "搜索回溯", categories: ["功能反馈", "用户诉求"], keywords: ["search", "find", "history", "lookup"], tags: ["全文搜索", "历史记录", "知识回溯"] },
  { name: "导出分享", categories: ["功能反馈", "用户诉求"], keywords: ["export", "share", "download", "pdf", "doc", "copy"], tags: ["导出", "分享", "文件格式"] },
  { name: "日历同步", categories: ["功能反馈", "稳定性问题", "用户诉求"], keywords: ["calendar", "sync", "zoom", "meet", "teams"], tags: ["日历集成", "会议同步", "视频会议"] },
  { name: "工作流集成", categories: ["功能反馈", "用户诉求"], keywords: ["crm", "salesforce", "hubspot", "slack", "notion", "zapier"], tags: ["CRM", "协作工具", "自动化"] },
  { name: "崩溃错误", categories: ["稳定性问题"], keywords: ["crash", "bug", "freeze", "stop", "error"], tags: ["崩溃", "Bug", "异常中断"] },
  { name: "性能速度", categories: ["稳定性问题", "用户体验问题"], keywords: ["slow", "delay", "lag", "loading", "speed"], tags: ["加载速度", "延迟", "响应性能"] },
  { name: "价格价值", categories: ["价格反馈"], keywords: ["price", "expensive", "cost", "paid", "subscription"], tags: ["价格", "订阅", "性价比"] },
  { name: "取消扣费", categories: ["价格反馈", "用户体验问题"], keywords: ["cancel", "refund", "charge", "billing", "trial"], tags: ["取消订阅", "扣费", "退款"] },
  { name: "免费额度", categories: ["价格反馈", "用户诉求"], keywords: ["free", "trial", "limit", "minutes", "quota"], tags: ["免费试用", "额度限制", "分钟数"] },
  { name: "易用上手", categories: ["用户体验问题"], keywords: ["easy", "intuitive", "confusing", "difficult", "hard"], tags: ["学习成本", "操作流程", "界面体验"] },
  { name: "客服支持", categories: ["用户体验问题", "其他"], keywords: ["support", "service", "help", "response", "contact"], tags: ["客服响应", "问题处理", "帮助支持"] }
];

function renderReviewAnalysisSection(
  task: ReportTask,
  appStoreSummary: Record<string, unknown> | null,
  appStoreRatings: Record<string, unknown> | null,
  deepSeekReviewSummary: Record<string, unknown> | null,
  keywords: Array<{ keyword: string; count: number }>
) {
  const stats = buildReviewStats(task.reviews, appStoreSummary);
  const topics = buildReviewTopics(task.reviews);
  const positiveInsights = buildPositiveInsights(task.reviews, topics);
  const problemInsights = buildProblemInsights(task.reviews, topics);
  const opportunityInsights = buildOpportunityInsights(task.reviews, topics);
  const positiveReviews = representativeReviews(task.reviews, "positive");
  const negativeReviews = representativeReviews(task.reviews, "negative");
  const requestReviews = representativeReviews(task.reviews, "request");
  const countries = inferReviewCountries(task.reviews);
  const sourceText = countries.length ? `来自 ${countries.length} 个国家/地区` : "国家/地区暂未识别";
  const ratingBreakdown = renderRatingBreakdown(appStoreRatings);
  const summarySections = reviewSummarySections(deepSeekReviewSummary, stats, topics);
  const model = typeof deepSeekReviewSummary?.model === "string" ? deepSeekReviewSummary.model : "系统规则 + DeepSeek";
  const donutPositive = stats.total ? stats.positiveRate : 0;
  const donutNeutral = stats.total ? stats.positiveRate + stats.neutralRate : 100;
  const donutNegative = stats.total ? stats.positiveRate + stats.neutralRate + stats.negativeRate : 100;

  return `<div class="review-module">
    <div class="review-head">
      <div>
        <h2>用户评价分析</h2>
        <p class="muted">分析范围：App Store 最近 ${escapeHtml(String(stats.total))} 条评论${stats.ratingCount !== "暂未获取" ? `；公开评分数 ${escapeHtml(stats.ratingCount)}` : ""}</p>
      </div>
      <div class="review-actions">
        <span class="review-filter">国家：全部国家</span>
        <span class="review-filter">时间范围：最近采集</span>
      </div>
    </div>
    <div class="review-notice">一级评论可能涉及多个主题，因此主题提及占比相加可能超过 100%。</div>
    <div class="review-metrics">
      <div class="review-metric-card"><span>分析评论数</span><strong>${escapeHtml(String(stats.total))}</strong><small>${escapeHtml(sourceText)}</small></div>
      <div class="review-metric-card"><span>平均评分</span><strong>${escapeHtml(stats.averageRating)}<small class="stars">${escapeHtml(starText(stats.averageRating))}</small></strong><small>${ratingBreakdown || "基于可用评分样本"}</small></div>
      <div class="review-metric-card"><span>正面评论占比</span><strong>${stats.positiveRate}%</strong><small>${stats.positive} 条</small></div>
      <div class="review-metric-card"><span>中性评论占比</span><strong>${stats.neutralRate}%</strong><small>${stats.neutral} 条</small></div>
      <div class="review-metric-card"><span>负面评论占比</span><strong>${stats.negativeRate}%</strong><small>${stats.negative} 条</small></div>
      <div class="review-metric-card"><span>包含功能诉求</span><strong>${stats.featureRequests}</strong><small>${stats.featureRequestRate}% 的评论</small></div>
    </div>
    ${renderReviewAISummary(summarySections, model, stats, positiveInsights, problemInsights, opportunityInsights, keywords)}
    <div class="review-grid">
      <div class="sentiment-card">
        <h3>情感分布</h3>
        <div class="sentiment-layout">
          <div class="sentiment-donut" style="--positive:${donutPositive}%;--neutral:${donutNeutral}%;--negative:${donutNegative}%"><div><strong>${stats.total}</strong><span>总评论数</span></div></div>
          <div class="sentiment-legend">
            <div><span class="legend-dot positive"></span><span>正面</span><strong>${stats.positiveRate}%（${stats.positive} 条）</strong></div>
            <div><span class="legend-dot"></span><span>中性</span><strong>${stats.neutralRate}%（${stats.neutral} 条）</strong></div>
            <div><span class="legend-dot negative"></span><span>负面</span><strong>${stats.negativeRate}%（${stats.negative} 条）</strong></div>
            <div><span class="legend-dot mixed"></span><span>功能诉求</span><strong>${stats.featureRequestRate}%（${stats.featureRequests} 条）</strong></div>
          </div>
        </div>
      </div>
      <div class="topic-card">
        <h3>主题关注度</h3>
        ${renderReviewTopicTable(topics)}
      </div>
    </div>
    <div class="insight-grid">
      ${renderInsightCard("用户认可的亮点 Top 5", positiveInsights, "good")}
      ${renderInsightCard("用户集中抱怨的问题 Top 5", problemInsights, "bad")}
      ${renderInsightCard("用户诉求与产品机会 Top 5", opportunityInsights, "opportunity")}
    </div>
    <div>
      <div class="review-tabs-head">
        <h3>代表性评论</h3>
        <span class="badge">展示可用样本</span>
      </div>
      <div class="review-tabs">
        <button class="review-tab active" type="button" data-review-tab="positive">正面评价（${positiveReviews.length}）</button>
        <button class="review-tab" type="button" data-review-tab="negative">负面评价（${negativeReviews.length}）</button>
        <button class="review-tab" type="button" data-review-tab="request">功能诉求（${requestReviews.length}）</button>
      </div>
      ${renderReviewPanel("positive", positiveReviews, true)}
      ${renderReviewPanel("negative", negativeReviews, false)}
      ${renderReviewPanel("request", requestReviews, false)}
    </div>
    <p class="muted">数据基于已采集的 App Store 评价正文生成；评分概览和评论正文来自不同公开接口时，不会用评分数据伪造成单条评论。</p>
  </div>`;
}

function buildReviewStats(reviews: ReviewItem[], appStoreSummary: Record<string, unknown> | null): ReviewStats {
  const total = reviews.length;
  const positive = reviews.filter((review) => reviewSentiment(review) === "positive").length;
  const neutral = reviews.filter((review) => reviewSentiment(review) === "neutral").length;
  const negative = reviews.filter((review) => reviewSentiment(review) === "negative").length;
  const featureRequests = reviews.filter((review) => hasAnyCategory(review, ["功能反馈", "用户诉求"])).length;
  const sampleRatings = reviews.map((review) => review.rating).filter((rating): rating is number => typeof rating === "number");
  const sampleAverage = sampleRatings.length ? sampleRatings.reduce((sum, rating) => sum + rating, 0) / sampleRatings.length : null;
  const rating = typeof appStoreSummary?.rating === "number" ? appStoreSummary.rating : sampleAverage;
  const ratingCount = typeof appStoreSummary?.ratingCount === "number" ? appStoreSummary.ratingCount.toLocaleString("zh-CN") : "暂未获取";

  return {
    total,
    averageRating: typeof rating === "number" ? rating.toFixed(1) : "暂未获取",
    ratingCount,
    positive,
    neutral,
    negative,
    featureRequests,
    positiveRate: percent(positive, total),
    neutralRate: percent(neutral, total),
    negativeRate: percent(negative, total),
    featureRequestRate: percent(featureRequests, total)
  };
}

function buildReviewTopics(reviews: ReviewItem[]) {
  return reviewTopicDefinitions
    .map((definition) => {
      const matched = reviews.filter((review) => reviewMatchesTopic(review, definition));
      return {
        name: definition.name,
        categories: definition.categories,
        keywords: definition.keywords,
        count: matched.length,
        coverage: percent(matched.length, reviews.length),
        positive: matched.filter((review) => reviewSentiment(review) === "positive").length,
        negative: matched.filter((review) => reviewSentiment(review) === "negative").length,
        tags: definition.tags
      };
    })
    .filter((topic) => topic.count > 0)
    .sort((left, right) => right.count - left.count);
}

function renderReviewTopicTable(topics: ReviewTopic[]) {
  if (!topics.length) return "<p class=\"muted\">暂未获取评价主题。</p>";

  return `<table class="topic-table"><thead><tr><th>主题</th><th>提及评论数</th><th>覆盖率</th><th>正面数</th><th>负面数</th><th>主要二级标签</th></tr></thead><tbody>${topics
    .slice(0, 8)
    .map(
      (topic) => `<tr><td>${escapeHtml(topic.name)}</td><td>${topic.count}</td><td><div class="topic-bar"><span style="width:${Math.min(topic.coverage, 100)}%"></span></div>${topic.coverage}%</td><td class="count-good">${topic.positive}</td><td class="count-bad">${topic.negative}</td><td>${topic.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</td></tr>`
    )
    .join("")}</tbody></table>`;
}

function renderReviewAISummary(
  sections: ReviewSummarySections,
  model: string,
  stats: ReviewStats,
  positiveInsights: ReviewInsight[],
  problemInsights: ReviewInsight[],
  opportunityInsights: ReviewInsight[],
  keywords: Array<{ keyword: string; count: number }>
) {
  const positiveDominant = stats.positive >= stats.negative;
  const positivePanel = buildSummaryPanelContent(sections.positive, positiveInsights);
  const problemPanel = buildSummaryPanelContent(sections.problem, problemInsights);
  const opportunityPanel = buildSummaryPanelContent(sections.opportunity, opportunityInsights);
  const primary = positiveDominant
    ? { title: "主要好评", kind: "good" as const, content: positivePanel }
    : { title: "主要问题", kind: "bad" as const, content: problemPanel };
  const secondary = positiveDominant
    ? { title: "主要问题", kind: "bad" as const, content: problemPanel }
    : { title: "主要好评", kind: "good" as const, content: positivePanel };
  const keywordTags = keywords.slice(0, 8).map((item) => `<span class="tag">${escapeHtml(item.keyword)} ${item.count}</span>`).join("");

  return `<div class="review-summary-card">
    <div class="review-summary-head"><h3>AI 综合总结</h3><span class="badge">由 ${escapeHtml(model)} 生成</span></div>
    <div class="review-summary-overview"><span class="review-summary-mark">AI</span><div><strong>总结概览</strong><p>${escapeHtml(sections.overview)}</p></div></div>
    <div class="review-summary-layout">
      <div class="review-summary-side">
        ${renderReviewSummaryMiniPanel(secondary.title, secondary.content, secondary.kind)}
        ${renderReviewSummaryMiniPanel("产品机会", opportunityPanel, "opportunity")}
      </div>
      ${renderReviewSummaryMainPanel(primary.title, primary.content, primary.kind)}
    </div>
    ${keywordTags ? `<div class="review-summary-keywords"><strong>高频关键词</strong><div>${keywordTags}</div></div>` : ""}
  </div>`;
}

function renderReviewSummaryMiniPanel(title: string, content: SummaryPanelContent, kind: "good" | "bad" | "opportunity") {
  return `<div class="review-summary-panel ${kind}"><h4>${escapeHtml(title)}</h4><p>${escapeHtml(content.summary)}</p></div>`;
}

function renderReviewSummaryMainPanel(title: string, content: SummaryPanelContent, kind: "good" | "bad") {
  return `<div class="review-summary-panel ${kind}"><h4>${escapeHtml(title)}</h4><p>${escapeHtml(content.summary)}</p></div>`;
}

type ReviewSummarySections = {
  overview: string;
  positive: string;
  problem: string;
  opportunity: string;
};

type SummaryPanelContent = {
  summary: string;
};

function buildSummaryPanelContent(text: string, insights: ReviewInsight[]): SummaryPanelContent {
  const summary = text || (insights[0] ? `${insights[0].title}。${insights[0].quote}` : "当前样本暂未形成明确结论。");
  return { summary };
}

function splitReviewSummarySections(content: string) {
  const jsonSections = parseReviewSummaryJson(content);
  if (jsonSections) return jsonSections;

  const normalized = content.replace(/\s+/g, " ").trim();
  const positive = extractSummarySection(normalized, ["主要好评", "好评"], ["主要问题", "产品机会"]);
  const problem = extractSummarySection(normalized, ["主要问题", "问题"], ["主要好评", "产品机会"]);
  const opportunity = extractSummarySection(normalized, ["产品机会", "机会"], ["主要好评", "主要问题"]);
  const firstSectionIndex = findFirstSummarySectionIndex(normalized);
  const overview = (firstSectionIndex > 0 ? normalized.slice(0, firstSectionIndex) : normalized).trim().slice(0, 180);

  return {
    overview: overview || "基于当前 App Store 评价样本，以下按主要好评、主要问题和产品机会拆分总结。",
    positive,
    problem,
    opportunity
  };
}

function parseReviewSummaryJson(content: string) {
  try {
    const value = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()) as Record<string, unknown>;
    const overview = textValue(value.overview || value.summary).slice(0, 220);
    const positive = textValue(value.positive || value.mainPraise || value.good).slice(0, 220);
    const problem = textValue(value.problem || value.mainProblems || value.bad).slice(0, 220);
    const opportunity = textValue(value.opportunity || value.productOpportunities).slice(0, 220);
    if (!overview && !positive && !problem && !opportunity) return null;
    return {
      overview: overview || "基于当前 App Store 评价样本，以下按主要好评、主要问题和产品机会拆分总结。",
      positive,
      problem,
      opportunity
    };
  } catch {
    return null;
  }
}

function findFirstSummarySectionIndex(content: string) {
  const indexes = ["主要好评", "主要问题", "产品机会", "好评", "问题", "机会"]
    .map((label) => content.search(summaryLabelPattern(label)))
    .filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
}

function extractSummarySection(content: string, labels: string[], nextLabels: string[]) {
  for (const label of labels) {
    const marker = summaryLabelPattern(label);
    const match = content.match(marker);
    if (!match || match.index === undefined) continue;
    const start = match.index + match[0].length;
    const rest = content.slice(start);
    const nextIndexes = nextLabels
      .flatMap((nextLabel) => {
        const nextMatch = rest.match(summaryLabelPattern(nextLabel));
        return nextMatch?.index === undefined ? [] : [nextMatch.index];
      })
      .sort((left, right) => left - right);
    return rest.slice(0, nextIndexes[0] ?? undefined).trim().slice(0, 220);
  }
  return "";
}

function summaryLabelPattern(label: string) {
  return new RegExp(`(?:\\*\\*)?${label}(?:\\*\\*)?[：:]`);
}

function buildPositiveInsights(reviews: ReviewItem[], topics: ReviewTopic[]) {
  const insights = topics
    .filter((topic) => topic.positive > 0)
    .map((topic) => {
      const sample = reviews.find((review) => reviewSentiment(review) === "positive" && reviewMatchesTopic(review, topic));
      return {
        title: positiveInsightTitle(topic.name),
        count: topic.positive,
        percent: percent(topic.positive, reviews.length),
        quote: reviewSnippet(sample),
        badge: "正面",
        badgeKind: "good" as const
      };
    });
  return insights.length ? insights.slice(0, 5) : fallbackInsights("暂无明显正向亮点", "当前样本中正面评价不足，建议扩大采集范围。", "正面", "good");
}

function buildProblemInsights(reviews: ReviewItem[], topics: ReviewTopic[]) {
  const insights = topics
    .filter((topic) => topic.negative > 0)
    .map((topic) => {
      const sample = reviews.find((review) => reviewSentiment(review) === "negative" && reviewMatchesTopic(review, topic));
      const problemPercent = percent(topic.negative, reviews.length);
      return {
        title: problemInsightTitle(topic.name),
        count: topic.negative,
        percent: problemPercent,
        quote: reviewSnippet(sample),
        badge: problemPercent >= 20 ? "严重" : problemPercent >= 10 ? "中等" : "低频",
        badgeKind: problemPercent >= 20 ? ("bad" as const) : ("medium" as const)
      };
    });
  return insights.length ? insights.slice(0, 5) : fallbackInsights("暂无集中负面问题", "当前样本中未出现高频差评主题。", "低频", "medium");
}

function buildOpportunityInsights(reviews: ReviewItem[], topics: ReviewTopic[]) {
  const requestTopics = topics.filter((topic) => topic.categories.some((category) => category === "功能反馈" || category === "用户诉求"));
  const insights = requestTopics.map((topic) => {
    const sample = reviews.find((review) => reviewMatchesTopic(review, topic));
    return {
      title: opportunityTitle(topic.name),
      count: topic.count,
      percent: topic.coverage,
      quote: reviewSnippet(sample),
      badge: "机会",
      badgeKind: "medium" as const
    };
  });
  return insights.length ? insights.slice(0, 5) : fallbackInsights("暂无明确功能诉求", "当前评论没有提取到 wish、please、export 等诉求信号。", "机会", "medium");
}

function renderInsightCard(title: string, insights: ReviewInsight[], kind: "good" | "bad" | "opportunity") {
  return `<div class="insight-card ${kind}"><h3>${escapeHtml(title)}</h3><ol class="insight-list">${insights
    .map(
      (insight, index) => `<li><span class="insight-rank">${index + 1}</span><span class="insight-main"><strong>${escapeHtml(insight.title)}</strong><span>${insight.count} 条评论（${insight.percent}%） · “${escapeHtml(insight.quote)}”</span></span><span class="severity ${insight.badgeKind}">${escapeHtml(insight.badge)}</span></li>`
    )
    .join("")}</ol></div>`;
}

function renderReviewPanel(type: string, reviews: ReviewItem[], active: boolean) {
  return `<div class="review-panel${active ? " active" : ""}" data-review-panel="${escapeHtml(type)}">${reviews.length ? `<div class="review-card-grid">${reviews.map(renderReviewCard).join("")}</div>` : `<p class="muted">暂无该类型代表性评论。</p>`}</div>`;
}

function renderReviewCard(review: ReviewItem) {
  const categories = reviewCategories(review).filter((category) => category !== "好评" && category !== "差评" && category !== "其他").slice(0, 2);
  const sentiment = reviewSentiment(review);
  const sentimentLabel = sentiment === "positive" ? "正面" : sentiment === "negative" ? "负面" : "中性";
  const title = review.title || review.content.slice(0, 28) || "无标题";
  const sourceUrl = review.sourceUrl || "#";
  return `<article class="review-card">
    <div class="review-card-head"><span>${escapeHtml(reviewLocaleLabel(review))}</span><span class="stars">${escapeHtml(starText(review.rating ?? "暂未获取"))}</span></div>
    <strong>${escapeHtml(title)}</strong>
    <p>${escapeHtml(trimText(review.content, 180))}</p>
    <p class="muted">${escapeHtml(review.author || "匿名")} · ${review.publishedAt ? review.publishedAt.toLocaleDateString("zh-CN") : "日期未知"} · <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">来源</a></p>
    <div class="review-card-tags">${categories.map((category) => `<span class="tag">${escapeHtml(category)}</span>`).join("")}<span class="severity ${sentiment === "positive" ? "good" : sentiment === "negative" ? "bad" : "medium"}">${sentimentLabel}</span></div>
  </article>`;
}

function representativeReviews(reviews: ReviewItem[], type: "positive" | "negative" | "request") {
  return reviews
    .filter((review) => {
      if (type === "request") return hasAnyCategory(review, ["功能反馈", "用户诉求"]);
      return reviewSentiment(review) === type;
    })
    .slice(0, 4);
}

function reviewSummarySections(summary: Record<string, unknown> | null, stats: ReviewStats, topics: ReviewTopic[]): ReviewSummarySections {
  const structured = {
    overview: textValue(summary?.overview).slice(0, 220),
    positive: textValue(summary?.positive).slice(0, 220),
    problem: textValue(summary?.problem).slice(0, 220),
    opportunity: textValue(summary?.opportunity).slice(0, 220)
  };
  if (structured.overview || structured.positive || structured.problem || structured.opportunity) {
    return {
      overview: structured.overview || "基于当前 App Store 评价样本，以下按主要好评、主要问题和产品机会拆分总结。",
      positive: structured.positive,
      problem: structured.problem,
      opportunity: structured.opportunity
    };
  }

  if (typeof summary?.content === "string" && summary.content.trim()) {
    return splitReviewSummarySections(summary.content);
  }

  const topTopic = topics[0]?.name ?? "暂未形成集中主题";
  return {
    overview: `当前共分析 ${stats.total} 条评论，正面评论占比 ${stats.positiveRate}%，负面评论占比 ${stats.negativeRate}%。用户最常提及的主题是「${topTopic}」。`,
    positive: "",
    problem: "",
    opportunity: ""
  };
}

function renderRatingBreakdown(ratings: Record<string, unknown> | null) {
  const histogram = ratings?.histogram && typeof ratings.histogram === "object" ? (ratings.histogram as Record<string, number>) : null;
  if (!histogram) return "";
  return Object.entries(histogram)
    .sort(([left], [right]) => Number(right) - Number(left))
    .slice(0, 3)
    .map(([star, count]) => `${star}星 ${Number(count).toLocaleString("zh-CN")}`)
    .join(" / ");
}

function reviewCategories(review: ReviewItem) {
  return review.categories?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
}

function hasAnyCategory(review: ReviewItem, categories: string[]) {
  const values = reviewCategories(review);
  return categories.some((category) => values.includes(category));
}

function reviewMatchesTopic(review: ReviewItem, topic: Pick<ReviewTopicDefinition, "categories" | "keywords">) {
  if (!hasAnyCategory(review, topic.categories)) return false;
  if (!topic.keywords.length) return true;
  const text = `${review.title ?? ""} ${review.content}`.toLowerCase();
  return topic.keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function reviewSentiment(review: ReviewItem) {
  if (review.sentiment === "positive" || review.sentiment === "neutral" || review.sentiment === "negative") return review.sentiment;
  if (typeof review.rating === "number") return review.rating >= 4 ? "positive" : review.rating <= 2 ? "negative" : "neutral";
  return "neutral";
}

function inferReviewCountries(reviews: ReviewItem[]) {
  return Array.from(new Set(reviews.map(reviewLocaleLabel).filter((label) => label !== "App Store")));
}

function reviewLocaleLabel(review: ReviewItem) {
  const url = review.sourceUrl || "";
  const match = url.match(/(?:itunes|apps)\.apple\.com\/([a-z]{2})\//i);
  const code = match?.[1]?.toLowerCase();
  const names: Record<string, string> = {
    us: "美国",
    gb: "英国",
    ca: "加拿大",
    au: "澳大利亚",
    de: "德国",
    fr: "法国",
    it: "意大利",
    es: "西班牙",
    nl: "荷兰",
    se: "瑞典",
    cn: "中国"
  };
  return code && names[code] ? names[code] : review.platform || "App Store";
}

function starText(value: string | number | null | undefined) {
  const rating = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(rating)) return "暂无评分";
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return "★".repeat(full) + "☆".repeat(5 - full);
}

function reviewSnippet(review?: ReviewItem) {
  if (!review) return "暂无代表性原文";
  return trimText(review.title || review.content, 48);
}

function trimText(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function percent(count: number, total: number) {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

function positiveInsightTitle(topic: string) {
  const titles: Record<string, string> = {
    会议总结: "会议总结能力被认可",
    转写准确率: "转写准确率获得正反馈",
    多人识别: "多人识别效果被认可",
    录音记录: "录音记录体验稳定",
    搜索回溯: "搜索回溯帮助复盘",
    导出分享: "导出分享提升协作效率",
    日历同步: "会议同步流程较顺畅",
    工作流集成: "工作流集成带来效率提升",
    崩溃错误: "稳定性表现获得正反馈",
    性能速度: "响应速度体验较好",
    价格价值: "价格价值被部分用户接受",
    取消扣费: "订阅管理体验被认可",
    免费额度: "免费额度降低试用门槛",
    易用上手: "操作体验较容易上手",
    客服支持: "客服支持获得正反馈"
  };
  return titles[topic] ?? `${topic}获得正向反馈`;
}

function problemInsightTitle(topic: string) {
  const titles: Record<string, string> = {
    会议总结: "会议总结质量不稳定",
    转写准确率: "转写准确性仍有争议",
    多人识别: "多人识别容易出错",
    录音记录: "录音记录存在中断风险",
    搜索回溯: "搜索回溯能力不足",
    导出分享: "导出分享流程受阻",
    日历同步: "日历或会议同步失败",
    工作流集成: "工作流集成覆盖不足",
    崩溃错误: "崩溃、Bug 或异常中断",
    性能速度: "加载慢或响应延迟",
    价格价值: "价格和订阅价值争议",
    取消扣费: "取消订阅或扣费争议",
    免费额度: "免费额度或试用限制",
    易用上手: "使用流程不够顺滑",
    客服支持: "客服响应和问题处理不足"
  };
  return titles[topic] ?? `${topic}存在负面反馈`;
}

function opportunityTitle(topic: string) {
  const titles: Record<string, string> = {
    会议总结: "强化摘要结构和行动项",
    转写准确率: "提升复杂场景转写准确率",
    多人识别: "补强多人识别和角色区分",
    录音记录: "优化录音稳定性和异常恢复",
    搜索回溯: "增强跨会议搜索与回溯",
    导出分享: "扩展导出格式和分享链路",
    日历同步: "提升日历和会议平台同步可靠性",
    工作流集成: "补齐 CRM 与协作工具集成",
    崩溃错误: "优先修复高频稳定性问题",
    性能速度: "优化加载速度和实时响应",
    价格价值: "重塑套餐价值表达",
    取消扣费: "降低订阅取消和退款摩擦",
    免费额度: "优化试用额度和转化路径",
    易用上手: "简化新用户上手路径",
    客服支持: "提升问题响应和支持闭环"
  };
  if (titles[topic]) return titles[topic];
  return `${topic}可转化为产品机会`;
}

function fallbackInsights(title: string, quote: string, badge: string, badgeKind: "good" | "bad" | "medium") {
  return [{ title, count: 0, percent: 0, quote, badge, badgeKind }];
}

function renderDeepSeekFeatureAnalysis(summary: Record<string, unknown> | null, fallbackFeatures?: string | null) {
  const features = Array.isArray(summary?.features)
    ? summary.features.map(normalizeFeatureAnalysisItem).filter((feature): feature is FeatureAnalysisItem => Boolean(feature))
    : [];
  if (!features.length) {
    return renderFallbackFeatureAnalysis(fallbackFeatures);
  }

  const model = typeof summary?.model === "string" ? summary.model : "DeepSeek";
  const sourceCount = typeof summary?.sourceCount === "number" ? summary.sourceCount : "若干";
  const reviewCount = typeof summary?.reviewCount === "number" ? summary.reviewCount : "若干";
  const promotionCount = typeof summary?.promotionCount === "number" ? summary.promotionCount : "若干";

  return `<div class="feature-panel"><p class="feature-meta">基于 ${escapeHtml(String(sourceCount))} 个公开来源、${escapeHtml(String(reviewCount))} 条 App Store 评价和 ${escapeHtml(String(promotionCount))} 条广告/推广素材生成 · 模型：${escapeHtml(model)}</p><div class="feature-list">${features
    .map(
      (feature, index) => `<details class="feature-item"${index === 0 ? " open" : ""}><summary>${escapeHtml(feature.tag)}<span>可信度：${escapeHtml(feature.confidence)}</span></summary><div class="feature-body"><div class="feature-row"><div class="feature-label">官方声称能力</div><div class="feature-value">${escapeHtml(localizedOfficialClaim(feature.officialClaim))}</div></div><div class="feature-row"><div class="feature-label">证据来源</div><div class="feature-value">${feature.evidenceSources.map((source) => `<span class="tag">${escapeHtml(source)}</span>`).join("") || "暂未标注"}</div></div><div class="feature-feedback"><div class="feature-feedback-box"><strong>用户正向反馈</strong>${renderFeatureList(feature.userPros, "暂无用户评价反馈，当前仅保留官方/商店/广告证据。")}</div><div class="feature-feedback-box risk"><strong>用户负向反馈 / 风险</strong>${renderFeatureList(feature.userCons, "暂无用户评价反馈，尚未发现明确风险。")}</div></div></div></details>`
    )
    .join("")}</div></div>`;
}

type FeatureAnalysisItem = {
  tag: string;
  officialClaim: string;
  evidenceSources: string[];
  userPros: string[];
  userCons: string[];
  confidence: string;
};

function normalizeFeatureAnalysisItem(value: unknown): FeatureAnalysisItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const tag = textValue(record.tag).slice(0, 24);
  const officialClaim = textValue(record.officialClaim).slice(0, 140);
  if (!tag || !officialClaim) return null;
  return {
    tag,
    officialClaim,
    evidenceSources: stringArray(record.evidenceSources).slice(0, 4),
    userPros: stringArray(record.userPros).slice(0, 2),
    userCons: stringArray(record.userCons).slice(0, 2),
    confidence: ["高", "中", "低"].includes(textValue(record.confidence)) ? textValue(record.confidence) : "中"
  };
}

function renderFeatureList(items: string[], emptyText: string) {
  if (!items.length) return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function localizedOfficialClaim(value: string) {
  return looksMostlyEnglish(value) ? `待重新生成中文说明：${value}` : value;
}

function looksMostlyEnglish(value: string) {
  const letters = value.match(/[A-Za-z]/g)?.length ?? 0;
  const chinese = value.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  return letters > 20 && letters > chinese * 2;
}

function renderFallbackFeatureAnalysis(value?: string | null) {
  const tags = value?.split(/[、,]/).map((item) => item.trim()).filter(Boolean) ?? [];
  if (!tags.length) return "<p>暂未获取</p>";

  return `<div class="feature-panel"><p class="feature-meta">基于官网和 App Store 公开文本提取。配置 DeepSeek 后会补充官方能力、用户评价优缺点和可信度。</p><div class="feature-list">${tags
    .map(
      (tag, index) => `<details class="feature-item"${index === 0 ? " open" : ""}><summary>${escapeHtml(tag)}<span>可信度：待分析</span></summary><div class="feature-body"><div class="feature-row"><div class="feature-label">官方声称能力</div><div class="feature-value">公开文本中出现该功能关键词，尚未完成 DeepSeek 结构化分析。</div></div><div class="feature-row"><div class="feature-label">证据来源</div><div class="feature-value"><span class="tag">官网</span><span class="tag">App Store</span></div></div><div class="feature-feedback"><div class="feature-feedback-box"><strong>用户正向反馈</strong><p class="muted">暂无用户评价反馈。</p></div><div class="feature-feedback-box risk"><strong>用户负向反馈 / 风险</strong><p class="muted">暂无用户评价反馈。</p></div></div></div></details>`
    )
    .join("")}</div></div>`;
}

type CustomerSegment = {
  segmentName: string;
  segmentType: string;
  industry: string;
  subIndustries: string[];
  organizationType: string;
  companySize: string;
  departments: string[];
  roles: string[];
  useCases: string[];
  jobsToBeDone: string[];
  painPoints: string[];
  requiredCapabilities: string[];
  buyers: string[];
  users: string[];
  paymentMotivations: string[];
  expectedValue: string[];
  industryFit: string;
  industryFitReason: string;
  evidenceSources: string[];
  isInferred: boolean;
  confidence: string;
};

function renderCustomerSegments(summary: Record<string, unknown> | null, fallbackTargetUsers?: string | null, errorSummary?: Record<string, unknown> | null) {
  const segments = Array.isArray(summary?.customerSegments)
    ? summary.customerSegments.map(normalizeCustomerSegment).filter((segment): segment is CustomerSegment => Boolean(segment))
    : [];

  if (!segments.length) {
    const errorMessage = typeof errorSummary?.message === "string" ? errorSummary.message : "";
    return `<div class="customer-module"><h3>目标客户群体</h3>${errorMessage ? `<p class="warning">结构化客户画像生成失败：${escapeHtml(errorMessage)}。当前显示旧版粗粒度目标用户字段。</p>` : ""}<p class="muted">${escapeHtml(fallbackTargetUsers || "暂无结构化客户画像。配置 DeepSeek 后，可基于官网、定价、App Store、评论和广告生成分层客户画像。")}</p></div>`;
  }

  const model = typeof summary?.model === "string" ? summary.model : "DeepSeek";
  const sourceCount = typeof summary?.sourceCount === "number" ? summary.sourceCount : "若干";
  const reviewCount = typeof summary?.reviewCount === "number" ? summary.reviewCount : "若干";
  const promotionCount = typeof summary?.promotionCount === "number" ? summary.promotionCount : "若干";
  const groups: Array<[string, string]> = [
    ["core", "核心客户群体"],
    ["high_value", "高价值客户"],
    ["secondary", "次级客户"],
    ["potential", "潜在客户群体"]
  ];

  return `<div class="customer-module"><div class="customer-head"><h3>目标客户群体</h3><span class="badge">查看全部</span></div><div class="customer-tabs">${groups
    .map(([type, label], index) => `<button class="customer-tab${index === 0 ? " active" : ""}" type="button" data-customer-tab="${escapeHtml(type)}">${escapeHtml(label)}</button>`)
    .join("")}</div><p class="feature-meta">基于 ${escapeHtml(String(sourceCount))} 个公开来源、${escapeHtml(String(reviewCount))} 条 App Store 评价和 ${escapeHtml(String(promotionCount))} 条广告/推广素材生成 · 模型：${escapeHtml(model)}</p>${groups
    .map(([type], index) => renderCustomerCardsPanel(type, prioritizedCustomerSegments(segments.filter((segment) => segment.segmentType === type)).slice(0, 3), index === 0))
    .join("")}${renderIndustryDistribution(segments)}</div>`;
}

function renderCustomerCardsPanel(type: string, segments: CustomerSegment[], active: boolean) {
  return `<div class="customer-cards${active ? " active" : ""}" data-customer-panel="${escapeHtml(type)}">${segments.length ? segments.map((segment) => renderCustomerCard(segment, false)).join("") : `<p class="muted">暂无该分类客户群体。</p>`}</div>`;
}

function renderCustomerCard(segment: CustomerSegment, open: boolean) {
  return `<details class="customer-card"${open ? " open" : ""}><summary><div class="customer-card-title"><strong>${escapeHtml(segment.segmentName)}</strong><div class="customer-badges"><span class="badge">${escapeHtml(industryFitLabel(segment.industryFit))}</span><span class="badge">${escapeHtml(confidenceLabel(segment.confidence))}</span>${segment.isInferred ? `<span class="badge warning">推断</span>` : ""}</div></div><div class="customer-preview"><div><strong>行业：</strong>${escapeHtml(segment.industry || "暂未判断")}</div><div><strong>细分行业：</strong>${escapeHtml(joinList(segment.subIndustries))}</div><div><strong>典型岗位：</strong>${escapeHtml(joinList(segment.roles))}</div><div><strong>核心场景：</strong>${escapeHtml(joinList(segment.useCases))}</div><div><strong>核心痛点：</strong>${escapeHtml(joinList(segment.painPoints))}</div><div><strong>购买动机：</strong>${escapeHtml(joinList(segment.paymentMotivations))}</div></div><div class="customer-more">更多详情（组织类型、能力需求、决策者等）</div></summary><div class="customer-detail"><div class="customer-detail-grid"><div class="customer-detail-item"><strong>组织类型</strong><span>${escapeHtml(segment.organizationType || "暂未判断")}</span></div><div class="customer-detail-item"><strong>企业规模</strong><span>${escapeHtml(segment.companySize || "暂未判断")}</span></div><div class="customer-detail-item"><strong>典型部门</strong><span>${escapeHtml(joinList(segment.departments))}</span></div><div class="customer-detail-item"><strong>核心任务</strong><span>${escapeHtml(joinList(segment.jobsToBeDone))}</span></div><div class="customer-detail-item"><strong>需要能力</strong><span>${escapeHtml(joinList(segment.requiredCapabilities))}</span></div><div class="customer-detail-item"><strong>使用者</strong><span>${escapeHtml(joinList(segment.users))}</span></div><div class="customer-detail-item"><strong>决策者</strong><span>${escapeHtml(joinList(segment.buyers))}</span></div><div class="customer-detail-item"><strong>预期价值</strong><span>${escapeHtml(joinList(segment.expectedValue))}</span></div><div class="customer-detail-item"><strong>证据来源</strong><span>${escapeHtml(joinList(segment.evidenceSources))}</span></div><div class="customer-detail-item"><strong>匹配原因</strong><span>${escapeHtml(segment.industryFitReason || "暂未判断")}</span></div></div></div></details>`;
}

function renderIndustryDistribution(segments: CustomerSegment[]) {
  const industries = Array.from(
    segments.reduce<Map<string, { count: number; fit: string; reasons: string[] }>>((acc, segment) => {
      if (!segment.industry) return acc;
      const current = acc.get(segment.industry) ?? { count: 0, fit: segment.industryFit, reasons: [] };
      current.count += 1;
      current.fit = strongerIndustryFit(current.fit, segment.industryFit);
      if (segment.industryFitReason) current.reasons.push(segment.industryFitReason);
      acc.set(segment.industry, current);
      return acc;
    }, new Map())
  ).slice(0, 8);
  if (!industries.length) return "";

  const total = segments.length || 1;
  return `<h3>行业分布</h3><div class="customer-summary-grid">${industries
    .map(([industry, item]) => `<div class="customer-summary-card"><strong>${escapeHtml(industry)}</strong><div class="industry-share">${Math.round((item.count / total) * 100)}%</div><p>${escapeHtml(industryFitLabel(item.fit))}</p></div>`)
    .join("")}</div>`;
}

function prioritizedCustomerSegments(segments: CustomerSegment[]) {
  const typeRank: Record<string, number> = { core: 0, high_value: 1, secondary: 2, potential: 3 };
  const fitRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return [...segments].sort((left, right) => {
    const typeDiff = (typeRank[left.segmentType] ?? 9) - (typeRank[right.segmentType] ?? 9);
    if (typeDiff) return typeDiff;
    return (fitRank[left.industryFit] ?? 9) - (fitRank[right.industryFit] ?? 9);
  });
}

function normalizeCustomerSegment(value: unknown): CustomerSegment | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const segmentName = textValue(record.segmentName).slice(0, 60);
  const industry = textValue(record.industry).slice(0, 40);
  const roles = stringArray(record.roles).slice(0, 6);
  const useCases = stringArray(record.useCases).slice(0, 5);
  if (!segmentName || !industry || (!roles.length && !useCases.length)) return null;

  return {
    segmentName,
    segmentType: normalizeSegmentType(record.segmentType),
    industry,
    subIndustries: stringArray(record.subIndustries).slice(0, 5),
    organizationType: textValue(record.organizationType).slice(0, 40),
    companySize: textValue(record.companySize).slice(0, 32),
    departments: stringArray(record.departments).slice(0, 5),
    roles,
    useCases,
    jobsToBeDone: stringArray(record.jobsToBeDone).slice(0, 5),
    painPoints: stringArray(record.painPoints).slice(0, 5),
    requiredCapabilities: stringArray(record.requiredCapabilities).slice(0, 6),
    buyers: stringArray(record.buyers).slice(0, 5),
    users: stringArray(record.users).slice(0, 5),
    paymentMotivations: stringArray(record.paymentMotivations).slice(0, 5),
    expectedValue: stringArray(record.expectedValue).slice(0, 5),
    industryFit: normalizeIndustryFit(record.industryFit),
    industryFitReason: textValue(record.industryFitReason).slice(0, 140),
    evidenceSources: stringArray(record.evidenceSources).slice(0, 6),
    isInferred: record.isInferred === true,
    confidence: normalizeEnglishConfidence(record.confidence)
  };
}

function joinList(items: string[]) {
  return items.length ? items.join("、") : "暂未判断";
}

function normalizeSegmentType(value: unknown) {
  const text = textValue(value);
  return text === "core" || text === "high_value" || text === "secondary" || text === "potential" ? text : "secondary";
}

function normalizeIndustryFit(value: unknown) {
  const text = textValue(value);
  return text === "high" || text === "medium" || text === "low" ? text : "medium";
}

function normalizeEnglishConfidence(value: unknown) {
  const text = textValue(value);
  return text === "high" || text === "medium" || text === "low" ? text : "medium";
}

function industryFitLabel(value: string) {
  if (value === "high") return "高匹配";
  if (value === "low") return "低匹配";
  return "中匹配";
}

function confidenceLabel(value: string) {
  if (value === "high") return "置信度：高";
  if (value === "low") return "置信度：低";
  return "置信度：中";
}

function strongerIndustryFit(left: string, right: string) {
  const rank: Record<string, number> = { low: 1, medium: 2, high: 3 };
  return (rank[right] ?? 2) > (rank[left] ?? 2) ? right : left;
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

function readAnalysis(task: ReportTask, analysisType: string) {
  const result = task.analyses.find((analysis) => analysis.analysisType === analysisType);
  if (!result) return null;

  try {
    return JSON.parse(result.resultJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}

type PromotionItem = ReportTask["promotions"][number];

type PromotionOverviewItem = {
  title: string;
  summary: string;
  details: string[];
};

type PromotionSignal = {
  title: string;
  summary: string;
  tags: string[];
};

type PromotionAudienceScenario = {
  segment: string;
  coreAppeal: string;
  scenarios: string[];
  channels: string[];
};

type PromotionStrategy = {
  title: string;
  points: string[];
};

function renderPromotionSection(promotions: PromotionItem[], summary: Record<string, unknown> | null) {
  const analysis = normalizePromotionAnalysis(promotions, summary);
  const model = textValue(summary?.model) || "DeepSeek";
  const adCount = typeof summary?.adCount === "number" ? summary.adCount : promotions.length;
  const channelCount = analysis.channels.length || Object.keys(platformCountsFromPromotions(promotions)).length;
  const sellingPointCount = analysis.coreSellingPoints.length;
  const audienceCount = analysis.audienceScenarios.length || analysis.targetAudiences.length;

  if (!promotions.length && !hasPromotionSummary(summary)) {
    return `<div class="promotion-module"><div class="promotion-head"><div><h2>广告和推广</h2><p class="muted">暂未获取广告或官网推广素材。</p></div></div><div class="promotion-empty">当前没有足够素材生成广告推广分析。重新采集广告源后，此处会展示覆盖渠道、目标人群、传播信息和策略总结。</div></div>`;
  }

  return `<div class="promotion-module">
    <div class="promotion-head">
      <div>
        <h2>广告和推广</h2>
        <p class="muted">DeepSeek 广告和推广综合分析</p>
        <p class="muted">基于 ${escapeHtml(String(adCount))} 条官网、Google、Meta 等可用推广素材生成 · 模型：${escapeHtml(model)}</p>
      </div>
      <div class="promotion-stats">
        <div class="promotion-stat"><strong>${escapeHtml(String(adCount))}</strong><span>推广素材</span></div>
        <div class="promotion-stat"><strong>${escapeHtml(String(channelCount))}</strong><span>覆盖渠道</span></div>
        <div class="promotion-stat"><strong>${escapeHtml(String(sellingPointCount))}</strong><span>核心卖点</span></div>
        <div class="promotion-stat"><strong>${escapeHtml(String(audienceCount))}</strong><span>重点人群</span></div>
      </div>
    </div>
    <div>
      <h3 class="promotion-title">推广概览</h3>
      <div class="promotion-overview-grid">${analysis.overview.map(renderPromotionOverviewCard).join("")}</div>
    </div>
    <div>
      <h3 class="promotion-title">核心传播信息</h3>
      <div class="promotion-signal-grid">${analysis.communicationSignals.map(renderPromotionSignalCard).join("")}</div>
    </div>
    <div>
      <h3 class="promotion-title">目标人群与场景</h3>
      <div class="promotion-audience-grid">${analysis.audienceScenarios.map(renderPromotionAudienceCard).join("")}</div>
    </div>
    <div>
      <h3 class="promotion-title">策略总结</h3>
      <div class="promotion-strategy-grid">${analysis.strategySummary.map(renderPromotionStrategyCard).join("")}</div>
    </div>
    ${renderPromotionMaterials(promotions)}
  </div>`;
}

function renderPromotionOverviewCard(item: PromotionOverviewItem) {
  return `<div class="promotion-card"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.summary || "暂未判断")}</p>${item.details.length ? `<div class="promotion-tags">${item.details.map((detail) => `<span class="tag">${escapeHtml(detail)}</span>`).join("")}</div>` : ""}</div>`;
}

function renderPromotionSignalCard(item: PromotionSignal) {
  return `<div class="promotion-signal"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.summary || "暂未判断")}</p><div class="promotion-tags">${item.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div></div>`;
}

function renderPromotionAudienceCard(item: PromotionAudienceScenario) {
  return `<div class="promotion-audience"><div class="promotion-audience-head"><strong>${escapeHtml(item.segment)}</strong><span class="badge">${escapeHtml(item.channels[0] || "渠道待判断")}</span></div><dl><div><dt>核心诉求</dt><dd>${escapeHtml(item.coreAppeal || "暂未判断")}</dd></div><div><dt>高频场景</dt><dd>${escapeHtml(joinList(item.scenarios))}</dd></div><div><dt>触达渠道</dt><dd>${item.channels.map((channel) => `<span class="tag">${escapeHtml(channel)}</span>`).join("") || "暂未判断"}</dd></div></dl></div>`;
}

function renderPromotionStrategyCard(item: PromotionStrategy) {
  return `<div class="promotion-strategy"><strong>${escapeHtml(item.title)}</strong><ul>${item.points.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul></div>`;
}

function renderPromotionMaterials(promotions: PromotionItem[]) {
  if (!promotions.length) return "";
  return `<details class="promotion-detail"><summary><span>详细广告素材</span><span class="badge">${promotions.length} 条</span></summary><div class="promotion-detail-body"><div class="promotion-material-grid">${promotions
    .map(renderPromotionMaterial)
    .join("")}</div></div></details>`;
}

function renderPromotionMaterial(item: PromotionItem) {
  const imageUrl = promotionImageUrl(item.sourceUrl);
  const tags = [item.targetAudience, item.useCase, item.sellingPoints].filter((value): value is string => Boolean(value?.trim())).flatMap(splitChineseList).slice(0, 5);
  return `<article class="promotion-material">
    ${imageUrl ? `<img class="promotion-material-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.title || "广告素材")}" loading="lazy" />` : ""}
    <div class="promotion-material-head"><strong>${escapeHtml(item.title || item.platform)}</strong><span class="badge">${escapeHtml(item.platform)}</span></div>
    <p>${escapeHtml(trimText(item.content, 220))}</p>
    <div class="promotion-tags">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
    <p class="promotion-material-source"><a href="${escapeHtml(item.sourceUrl || "#")}" target="_blank" rel="noreferrer">打开来源</a></p>
  </article>`;
}

function promotionImageUrl(value?: string | null) {
  return value && /^\/ad-assets\/.+\.(?:png|jpe?g|gif|webp)$/i.test(value) ? value : "";
}

function normalizePromotionAnalysis(promotions: PromotionItem[], summary: Record<string, unknown> | null) {
  const platformCounts = platformCountsFromPromotions(promotions);
  const channels = promotionArray(summary?.channels, 6, 24);
  const targetAudiences = promotionArray(summary?.targetAudiences, 6, 32);
  const coreSellingPoints = promotionArray(summary?.coreSellingPoints, 8, 32);
  const overview = promotionObjectArray(summary?.overview, normalizePromotionOverviewItem, 5).filter((item) => !isPromotionDirectionCard(item.title));
  const communicationSignals = promotionObjectArray(summary?.communicationSignals, normalizePromotionSignal, 3).filter((item) => !isPromotionDirectionCard(item.title));
  const audienceScenarios = promotionObjectArray(summary?.audienceScenarios, normalizePromotionAudienceScenario, 4);
  const strategySummary = promotionObjectArray(summary?.strategySummary, normalizePromotionStrategy, 3);
  const sourceCoverage = textValue(summary?.sourceCoverage) || formatPlatformCounts(summary?.platformCounts) || formatPlatformCounts(platformCounts);
  const targetAudience = textValue(summary?.targetAudience) || joinList(uniquePromotionValues(promotions, "targetAudience").slice(0, 4));
  const promotionDirection = textValue(summary?.promotionDirection);
  const useCases = textValue(summary?.useCases) || joinList(uniquePromotionValues(promotions, "useCase").slice(0, 4));
  const sellingPoints = textValue(summary?.sellingPoints) || joinList(uniquePromotionValues(promotions, "sellingPoints").slice(0, 4));
  const normalizedChannels = channels.length ? channels : Object.keys(platformCounts).slice(0, 6);
  const normalizedAudiences = targetAudiences.length ? targetAudiences : splitChineseList(targetAudience).slice(0, 6);
  const normalizedSellingPoints = coreSellingPoints.length ? coreSellingPoints : splitChineseList(sellingPoints).slice(0, 8);

  return {
    channels: normalizedChannels,
    targetAudiences: normalizedAudiences,
    coreSellingPoints: normalizedSellingPoints,
    overview: overview.length
	      ? overview
	      : [
	          { title: "覆盖来源", summary: sourceCoverage || "暂未判断", details: normalizedChannels.slice(0, 4) },
	          { title: "面向人群", summary: targetAudience || "暂未判断", details: normalizedAudiences.slice(0, 4) },
	          { title: "使用场景", summary: useCases || "暂未判断", details: splitChineseList(useCases).slice(0, 4) },
	          { title: "核心卖点", summary: sellingPoints || "暂未判断", details: normalizedSellingPoints.slice(0, 4) }
	        ],
	    communicationSignals: communicationSignals.length
	      ? communicationSignals
	      : buildFallbackPromotionSignals(promotions, normalizedSellingPoints, useCases),
    audienceScenarios: audienceScenarios.length
      ? audienceScenarios
      : buildFallbackAudienceScenarios(promotions, normalizedAudiences, normalizedChannels, useCases),
    strategySummary: strategySummary.length
      ? strategySummary
      : buildFallbackPromotionStrategies(normalizedChannels, normalizedAudiences, normalizedSellingPoints, promotionDirection)
  };
}

function normalizePromotionOverviewItem(value: Record<string, unknown>): PromotionOverviewItem | null {
  const title = textValue(value.title).slice(0, 24);
  const summary = textValue(value.summary).slice(0, 140);
  if (!title || !summary) return null;
  return { title, summary, details: promotionArray(value.details, 4, 24) };
}

function normalizePromotionSignal(value: Record<string, unknown>): PromotionSignal | null {
  const title = textValue(value.title).slice(0, 28);
  const summary = textValue(value.summary).slice(0, 120);
  if (!title || !summary) return null;
  return { title, summary, tags: promotionArray(value.tags, 5, 20) };
}

function normalizePromotionAudienceScenario(value: Record<string, unknown>): PromotionAudienceScenario | null {
  const segment = textValue(value.segment).slice(0, 32);
  if (!segment) return null;
  return {
    segment,
    coreAppeal: textValue(value.coreAppeal).slice(0, 90),
    scenarios: promotionArray(value.scenarios, 4, 28),
    channels: promotionArray(value.channels, 4, 24)
  };
}

function normalizePromotionStrategy(value: Record<string, unknown>): PromotionStrategy | null {
  const title = textValue(value.title).slice(0, 28);
  const points = promotionArray(value.points, 4, 60);
  if (!title || !points.length) return null;
  return { title, points };
}

function buildFallbackPromotionSignals(promotions: PromotionItem[], sellingPoints: string[], useCases: string) {
  const sourceSignals = uniquePromotionValues(promotions, "sellingPoints").slice(0, 3);
  const signals = [
    { title: "核心卖点聚焦", summary: sellingPoints.join("、") || sourceSignals.join("、") || "暂未提取到明确卖点", tags: sellingPoints.slice(0, 5) },
    { title: "场景覆盖", summary: useCases || "围绕官网和广告素材中的使用场景归纳", tags: splitChineseList(useCases).slice(0, 5) }
  ];
  return signals.filter((signal) => signal.summary !== "暂未提取到明确卖点" || signal.tags.length);
}

function isPromotionDirectionCard(title: string) {
  return title.trim() === "推广方向";
}

function buildFallbackAudienceScenarios(promotions: PromotionItem[], audiences: string[], channels: string[], useCases: string) {
  const promotionAudiences = audiences.length ? audiences : uniquePromotionValues(promotions, "targetAudience").slice(0, 4);
  const scenarioTags = splitChineseList(useCases).length ? splitChineseList(useCases) : uniquePromotionValues(promotions, "useCase").slice(0, 4);
  const values = promotionAudiences.length ? promotionAudiences : ["目标用户待判断"];
  return values.slice(0, 4).map((audience) => ({
    segment: audience,
    coreAppeal: "根据广告文案中的人群、场景和卖点归纳，具体需结合原始素材复核。",
    scenarios: scenarioTags.slice(0, 3),
    channels: channels.slice(0, 3)
  }));
}

function buildFallbackPromotionStrategies(channels: string[], audiences: string[], sellingPoints: string[], direction: string) {
  return [
    {
      title: "主打卖点策略",
      points: [
        sellingPoints.length ? `围绕 ${sellingPoints.slice(0, 3).join("、")} 建立主要传播信息` : "当前素材卖点不足，需要继续补充广告文案和官网推广页",
        direction || "将广告文案与官网定位合并判断，避免单一渠道误判"
      ].filter(Boolean)
    },
    {
      title: "人群覆盖策略",
      points: [
        audiences.length ? `覆盖 ${audiences.slice(0, 3).join("、")} 等重点人群` : "人群标签不足，建议补充 Meta、Google 和官网案例来源",
        "按人群拆分核心诉求和使用场景，便于后续竞品对比"
      ]
    },
    {
      title: "渠道投放策略",
      points: [
        channels.length ? `当前覆盖 ${channels.slice(0, 4).join("、")}` : "渠道覆盖不足，暂不能判断投放重心",
        "结合官网、Google、Meta 等来源交叉验证推广重点"
      ]
    }
  ];
}

function platformCountsFromPromotions(promotions: PromotionItem[]) {
  return promotions.reduce<Record<string, number>>((acc, item) => {
    acc[item.platform] = (acc[item.platform] ?? 0) + 1;
    return acc;
  }, {});
}

function uniquePromotionValues(promotions: PromotionItem[], field: "targetAudience" | "useCase" | "sellingPoints") {
  return Array.from(new Set(promotions.flatMap((item) => splitChineseList(item[field] || "")).filter(Boolean)));
}

function promotionObjectArray<T>(value: unknown, normalize: (value: Record<string, unknown>) => T | null, limit: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item && typeof item === "object" && !Array.isArray(item) ? normalize(item as Record<string, unknown>) : null))
    .filter((item): item is T => Boolean(item))
    .slice(0, limit);
}

function promotionArray(value: unknown, limit: number, textLimit: number) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => textValue(item).slice(0, textLimit)).filter(Boolean).slice(0, limit);
}

function splitChineseList(value: string) {
  return value
    .split(/[、,，;；/]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasPromotionSummary(summary: Record<string, unknown> | null) {
  if (!summary) return false;
  return Boolean(
    textValue(summary.sourceCoverage) ||
      textValue(summary.targetAudience) ||
      textValue(summary.promotionDirection) ||
      textValue(summary.useCases) ||
      textValue(summary.sellingPoints) ||
      Array.isArray(summary.overview) ||
      Array.isArray(summary.communicationSignals) ||
      Array.isArray(summary.audienceScenarios) ||
      Array.isArray(summary.strategySummary)
  );
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => textValue(item).slice(0, 90)).filter(Boolean);
}

function formatPlatformCounts(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return Object.entries(value as Record<string, unknown>)
    .filter(([, count]) => typeof count === "number")
    .map(([platform, count]) => `${platform} ${count} 条`)
    .join("；");
}
