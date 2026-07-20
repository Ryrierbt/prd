import type { Prisma } from "@prisma/client";
import { escapeHtml } from "@/lib/research/utils/text";

type ReportTask = Prisma.ResearchTaskGetPayload<{
  include: {
    sources: true;
    appProfile: true;
    pricingPlans: true;
    reviews: true;
    promotions: true;
    communityItems: true;
    googleResearchItems: true;
    analyses: true;
  };
}>;

export function generateResearchReport(task: ReportTask) {
  const generatedAt = new Date();
  const visibleSources = task.sources;
  const successfulSources = visibleSources.filter((source) => source.status === "SUCCESS");
  const failedSources = visibleSources.filter((source) => source.status === "FAILED");
  const analysisModel = reportAnalysisModel(task);
  const appStoreSummary = readAnalysis(task, "APP_STORE_SUMMARY");
  const appStoreRatings = readAnalysis(task, "APP_STORE_RATINGS");
  const deepSeekReviewSummary = readAnalysis(task, "DEEPSEEK_REVIEW_SUMMARY");
  const deepSeekProfileTranslation = readAnalysis(task, "DEEPSEEK_PROFILE_TRANSLATION");
  const deepSeekPricingSummary = readAnalysis(task, "DEEPSEEK_PRICING_SUMMARY");
  const deepSeekPromotionSummary = readAnalysis(task, "DEEPSEEK_PROMOTION_SUMMARY") ?? readAnalysis(task, "DEEPSEEK_GOOGLE_ADS_SUMMARY");
  const deepSeekPromotionPainPointFit = readAnalysis(task, "DEEPSEEK_PROMOTION_PAIN_POINT_FIT");
  const deepSeekFeatureAnalysis = readAnalysis(task, "DEEPSEEK_FEATURE_ANALYSIS");
  const deepSeekCustomerSegments = readAnalysis(task, "DEEPSEEK_CUSTOMER_SEGMENTS");
  const deepSeekCustomerSegmentsError = readAnalysis(task, "DEEPSEEK_CUSTOMER_SEGMENTS_ERROR");
  const googleResearch = readGoogleResearchAnalyses(task);
  const deepSeekCommunitySummary = readAnalysis(task, "DEEPSEEK_COMMUNITY_SUMMARY");
  const deepSeekCommunityError = readAnalysis(task, "DEEPSEEK_COMMUNITY_SUMMARY_ERROR");
  const supportedPlatforms = supportPlatformsValue(task, deepSeekProfileTranslation);
  const youtubeStats = communityPlatformStats(task.communityItems, "YouTube");
  const tiktokStats = communityPlatformStats(task.communityItems, "TikTok");
  const redditStats = communityPlatformStats(task.communityItems, "Reddit");

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
    .report-scope{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));margin-top:18px;border-top:1px solid #d8e2f3;border-bottom:1px solid #d8e2f3;background:#f8fbff}
    .report-scope-item{min-width:0;padding:12px 14px;border-right:1px solid #d8e2f3}
    .report-scope-item:last-child{border-right:0}
    .report-scope-item span,.report-scope-item small{display:block;color:#64748b;font-size:12px}
    .report-scope-item strong{display:block;margin:2px 0;color:#1d4ed8;font-size:20px;line-height:1.25;overflow-wrap:anywhere}
    .report-scope-item.model strong{font-size:13px;color:#0f172a}
    .tag{display:inline-block;margin:3px 4px 3px 0;padding:3px 8px;border:1px solid #c8daf8;border-radius:999px;color:#2563eb;background:#f1f6ff;font-size:12px}
    .feature-panel{padding:2px 0 0}
    .feature-list{display:grid;gap:8px}
    .feature-item{border:1px solid #d8e2f3;border-radius:8px;background:#fff;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.04)}
    .feature-item[open]{border-color:#a9c7f8;box-shadow:0 10px 24px rgba(37,99,235,.10)}
    .feature-item summary{display:flex;align-items:center;gap:10px;cursor:pointer;list-style:none;padding:13px 16px;font-weight:700;color:#0f172a}
    .feature-item summary::-webkit-details-marker{display:none}
    .feature-item summary::after{content:"展开";margin-left:auto;color:#64748b;font-size:12px;font-weight:500}
    .feature-item[open] summary::after{content:"收起"}
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
    .muted{color:#64748b}
    .source a{color:#2563eb;word-break:break-all}
    .warning{border-color:#ead28a;background:#fff9df}
    .review-module{display:grid;gap:18px}
    .review-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
    .review-head h2{margin-bottom:4px}
    .review-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}
    .review-filter{padding:7px 11px;border:1px solid #d8e2f3;border-radius:8px;background:#f8fbff;color:#334155;font-size:13px;white-space:nowrap}
    .review-metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}
    .review-platform-sources{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .review-platform-source{border:1px solid #d8e2f3;border-radius:8px;background:#f8fbff;padding:12px}
    .review-platform-source.failed{border-color:#fecaca;background:#fff8f8}
    .review-platform-source strong{display:block;color:#0f172a;font-size:13px}
    .review-platform-source span{display:block;margin-top:4px;color:#475569;font-size:12px;overflow-wrap:anywhere}
    .review-metric-card{border:1px solid #d8e2f3;border-radius:8px;background:#fff;padding:13px;min-width:0;box-shadow:0 1px 3px rgba(15,23,42,.04)}
    .review-metric-card span{display:block;margin-bottom:7px;color:#64748b;font-size:12px}
    .review-metric-card strong{display:block;color:#0f172a;font-size:26px;line-height:1.1}
    .review-metric-card small{display:block;margin-top:6px;color:#64748b;font-size:12px;overflow-wrap:anywhere}
    .stars{color:#f59e0b;letter-spacing:1px}
    .review-summary-overview{display:grid;grid-template-columns:38px 1fr auto;gap:10px;align-items:center;padding:11px;border:1px solid #bfdbfe;border-radius:8px;background:#f8fbff}
    .review-summary-mark{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:#dbeafe;color:#1d4ed8;font-weight:800}
    .review-summary-overview strong{display:block;margin-bottom:3px;color:#0f172a;font-size:13px}
    .review-summary-overview p{margin:0;color:#475569;font-size:13px;line-height:1.55;overflow-wrap:anywhere}
    .review-grid{display:grid;grid-template-columns:minmax(260px,36%) 1fr;gap:14px;align-items:start}
    .review-grid-sentiment{grid-template-columns:minmax(290px,36%) minmax(0,1fr)}
    .sentiment-card{border:1px solid #d8e2f3;border-radius:8px;background:#fff;padding:16px;min-width:0}
    .sentiment-layout{display:grid;grid-template-columns:150px 1fr;align-items:center;gap:18px}
    .sentiment-donut{width:150px;aspect-ratio:1;border-radius:50%;display:grid;place-items:center;position:relative;background:conic-gradient(#22c55e 0 var(--positive),#cbd5e1 var(--positive) var(--neutral),#ef4444 var(--neutral) var(--negative),#f59e0b var(--negative) 100%)}
    .sentiment-donut::after{content:"";position:absolute;inset:26px;border-radius:50%;background:#fff}
    .sentiment-donut strong{position:relative;z-index:1;font-size:24px}
    .sentiment-donut span{position:relative;z-index:1;display:block;color:#64748b;font-size:12px;text-align:center}
    .sentiment-legend{display:grid;gap:9px}
    .sentiment-legend div{display:grid;grid-template-columns:12px 1fr auto;align-items:center;gap:8px;color:#334155;font-size:13px}
    .legend-dot{width:10px;height:10px;border-radius:999px;background:#cbd5e1}
    .legend-dot.positive{background:#22c55e}.legend-dot.negative{background:#ef4444}.legend-dot.mixed{background:#f59e0b}
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
    .insight-more{display:flex;flex-direction:column;border-top:1px solid #eef4ff}
    .insight-more summary{order:1;padding:11px 14px;color:#2563eb;font-size:13px;font-weight:700;cursor:pointer}
    .insight-more[open] summary{border-top:1px solid #eef4ff}
    .insight-more[open] summary{order:2}
    .insight-more .insight-list{order:1}
    .insight-more .summary-open{display:none}
    .insight-more[open] .summary-closed{display:none}
    .insight-more[open] .summary-open{display:inline}
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
    .promotion-title{display:flex;align-items:center;gap:8px;margin:0 0 10px;color:#0f172a;font-size:16px}
    .promotion-title::before{content:"";display:block;width:3px;height:16px;border-radius:999px;background:#2563eb}
    .promotion-overview-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .promotion-card{border:1px solid #d8e2f3;border-radius:8px;background:#fff;padding:14px;min-width:0;box-shadow:0 1px 3px rgba(15,23,42,.04)}
    .promotion-card strong{display:block;margin-bottom:6px;color:#0f172a;font-size:14px;overflow-wrap:anywhere}
    .promotion-card p{margin:0;color:#334155;font-size:13px;line-height:1.55;overflow-wrap:anywhere}
    .promotion-card .promotion-tags{margin-top:9px}
    .promotion-signal-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    .promotion-signal{border:1px solid #d8e2f3;border-radius:8px;background:#fff;padding:14px;min-width:0}
    .promotion-signal strong{display:block;margin-bottom:5px;color:#0f172a}
    .promotion-signal p{margin:0 0 9px;color:#334155;font-size:13px;line-height:1.55;overflow-wrap:anywhere}
    .promotion-example-toggle{margin-top:10px;border-top:1px solid #e5eefc;padding-top:10px}
    .promotion-example-toggle summary{cursor:pointer;list-style:none;color:#2563eb;font-size:13px;font-weight:700}
    .promotion-example-toggle summary::-webkit-details-marker{display:none}
    .promotion-example-toggle summary::after{content:"展开";margin-left:6px;color:#64748b;font-size:12px;font-weight:500}
    .promotion-example-toggle[open] summary::after{content:"收起"}
    .promotion-example-list{display:grid;gap:8px;margin-top:10px}
    .promotion-example{border:1px solid #d8e2f3;border-radius:8px;background:#f8fbff;padding:10px}
    .promotion-example-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px}
    .promotion-example-head strong{margin:0;font-size:13px}
    .promotion-example p{margin:0;color:#334155;font-size:12px;line-height:1.55;overflow-wrap:anywhere}
    .promotion-example-image{display:block;width:100%;max-height:130px;object-fit:contain;margin-bottom:8px;border:1px solid #d8e2f3;border-radius:6px;background:#fff}
    .promotion-example a{display:inline-block;margin-top:7px;color:#2563eb;font-size:12px}
    .promotion-strategy-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    .promotion-strategy{position:relative;border:1px solid #d8e2f3;border-radius:8px;background:#fff;padding:15px;min-height:120px;overflow:hidden}
    .promotion-strategy strong{display:block;margin-bottom:8px;color:#0f172a}
    .promotion-strategy ul{margin:0;padding-left:18px;color:#334155;font-size:13px}
    .promotion-strategy li{margin:4px 0;overflow-wrap:anywhere}
    .promotion-painpoint-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .promotion-painpoint{border:1px solid #d8e2f3;border-radius:8px;background:#fff;padding:14px;min-width:0}
    .promotion-painpoint-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:7px}
    .promotion-painpoint-head strong{color:#0f172a;font-size:14px;overflow-wrap:anywhere}
    .promotion-painpoint p{margin:0;color:#334155;font-size:13px;line-height:1.55;overflow-wrap:anywhere}
    .promotion-painpoint-fit{margin-top:10px;padding:10px;border-radius:6px;background:#f8fbff}
    .promotion-painpoint-fit p{margin-top:6px}
    .ad-fit{display:inline-flex;align-items:center;padding:2px 7px;border-radius:999px;font-size:12px;font-weight:700}
    .ad-fit.hit{background:#dcfce7;color:#15803d}.ad-fit.partial{background:#fef3c7;color:#a16207}.ad-fit.miss{background:#fee2e2;color:#dc2626}.ad-fit.unknown{background:#e2e8f0;color:#475569}
    .promotion-painpoint-quote{margin-top:9px!important;color:#64748b!important;font-size:12px!important}
    .promotion-painpoint .promotion-tags{margin-top:10px}
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
    .community-module{display:grid;gap:16px}
    .community-module h2{margin-bottom:0}
    .community-proof{display:flex;flex-direction:column;gap:3px;margin-top:-8px;color:#64748b;font-size:12px;line-height:1.45}
    .community-proof strong{color:#1e40af;font-size:12px}
    .community-proof span{overflow-wrap:anywhere}
    .community-top-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,.85fr);gap:12px}
    .community-panel{border:1px solid #d8e2f3;border-radius:8px;background:#fff;padding:14px;min-width:0}
    .community-panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
    .community-panel-head h3{margin:0;color:#0f172a;font-size:16px}
    .community-topic-list{display:grid;gap:0;margin:0;padding:0;list-style:none}
    .community-topic{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:10px;align-items:start;padding:11px 0;border-top:1px solid #e5eefc}
    .community-topic:first-child{border-top:0;padding-top:0}
    .community-rank{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#eff6ff;color:#2563eb;font-size:12px;font-weight:700}
    .community-topic strong,.community-insight strong,.community-content strong{display:block;color:#0f172a;font-size:13px;overflow-wrap:anywhere}
    .community-topic p,.community-insight p,.community-content p{margin:3px 0 0;color:#475569;font-size:13px;line-height:1.5;overflow-wrap:anywhere}
    .community-evidence{color:#64748b;font-size:12px;white-space:nowrap}
    .community-platforms{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
    .community-platform{display:inline-block;padding:1px 6px;border-radius:999px;background:#f1f6ff;color:#2563eb;font-size:11px}
    .community-insight-list{display:grid;gap:10px}
    .community-insight{border-top:1px solid #e5eefc;padding-top:10px}
    .community-insight:first-child{border-top:0;padding-top:0}
    .community-evidence-links{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}
    .community-evidence-link{display:inline-flex;align-items:center;padding:2px 6px;border:1px solid #c9daf5;border-radius:4px;background:#f8fbff;color:#2563eb;font-size:11px;text-decoration:none}
    .community-evidence-link:hover{background:#eff6ff;border-color:#93b4e8}
    .community-analysis-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    .community-analysis-card{border:1px solid #d8e2f3;border-radius:8px;background:#fff;padding:14px;min-width:0}
    .community-analysis-card h3{margin:0 0 10px;font-size:15px}
    .community-analysis-card .community-insight{padding-top:9px;margin-top:9px}
    .community-empty{padding:15px;border:1px dashed #b9cff0;border-radius:8px;background:#f8fbff;color:#64748b}
    .community-content-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    .community-content{display:flex;flex-direction:column;gap:7px;border:1px solid #d8e2f3;border-radius:8px;background:#f8fbff;padding:13px;min-width:0}
    .community-content-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
    .community-content-meta{margin-top:auto;color:#64748b;font-size:12px;overflow-wrap:anywhere}
    .google-research-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .google-research-card{border:1px solid #d8e2f3;border-radius:8px;background:#f8fbff;padding:14px;min-width:0}
    .google-research-card h3{margin:0 0 6px;color:#1e3a8a;font-size:16px}
    .google-research-card p{margin:5px 0;color:#475569;font-size:13px;line-height:1.55}
    .google-research-card ul{margin:8px 0 0;padding-left:18px;color:#334155;font-size:13px}
    .google-research-card li{margin:4px 0}
    .google-research-evidence{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px;padding-top:9px;border-top:1px solid #d8e2f3}
    .google-research-evidence a{padding:2px 6px;border:1px solid #c9daf5;border-radius:4px;background:#fff;color:#2563eb;font-size:11px;text-decoration:none}
    .google-research-evidence a:hover{background:#eff6ff}
    @media(max-width:1100px){.review-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.insight-grid,.review-card-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:1100px){.promotion-signal-grid,.promotion-strategy-grid,.promotion-painpoint-grid,.promotion-material-grid,.community-analysis-grid,.community-content-grid,.google-research-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:860px){.layout{display:block}nav{position:static;height:auto}.report-scope,.info-grid,.review-metrics,.review-platform-sources{grid-template-columns:repeat(2,minmax(0,1fr))}.report-scope-item:nth-child(2n){border-right:0}.report-scope-item:nth-child(n+3){border-top:1px solid #d8e2f3}main{padding:18px}.feature-row,.feature-feedback,.customer-cards,.customer-detail-grid,.review-grid,.insight-grid,.review-card-grid,.promotion-overview-grid,.promotion-signal-grid,.promotion-strategy-grid,.promotion-painpoint-grid,.promotion-material-grid,.community-top-grid,.community-analysis-grid,.community-content-grid{grid-template-columns:1fr}.feature-label{padding-bottom:0}.feature-item summary{align-items:flex-start;flex-wrap:wrap}.feature-item summary::after{width:100%;margin-left:0}.customer-card-title,.review-head,.review-tabs-head{display:block}.customer-badges,.review-actions{margin-top:8px;justify-content:flex-start}.sentiment-layout{grid-template-columns:1fr}.sentiment-donut{margin:auto}.review-summary-overview{grid-template-columns:38px 1fr}.review-summary-overview .badge{grid-column:2}}
  </style>
</head>
<body>
  <div class="layout">
    <nav>
      <strong>${escapeHtml(task.appName)}</strong>
      <a class="active" href="#overview">报告概览</a>
      <a href="#profile">基础信息</a>
      <a href="#features">功能分析</a>
      <a href="#google-research">行业研究</a>
      <a href="#reviews">用户评价</a>
      <a href="#promotion">广告和推广</a>
      <a href="#community">社区分析</a>
      <a href="#pricing">收费模式</a>
      <a href="#sources">数据来源</a>
    </nav>
    <main>
      <section id="overview">
        <h1>${escapeHtml(task.appName)} 竞品调研报告</h1>
        <p class="muted">生成时间：${generatedAt.toLocaleString("zh-CN")}；最近采集时间：${latestFetchTime(task)}</p>
        <div class="report-scope">
          <div class="report-scope-item"><span>采集来源</span><strong>${successfulSources.length}/${visibleSources.length}</strong><small>成功 / 总计</small></div>
          <div class="report-scope-item"><span>定价方案</span><strong>${task.pricingPlans.length}</strong><small>已提取套餐</small></div>
          <div class="report-scope-item"><span>评价样本</span><strong>${task.reviews.length}</strong><small>Apple 与 Google Play</small></div>
          <div class="report-scope-item"><span>推广素材</span><strong>${task.promotions.length}</strong><small>官网、Google、Meta 等</small></div>
          <div class="report-scope-item"><span>YouTube</span><strong>${youtubeStats.videos}/${youtubeStats.comments}</strong><small>视频 / 评论</small></div>
          <div class="report-scope-item"><span>TikTok</span><strong>${tiktokStats.videos}/${tiktokStats.comments}</strong><small>视频 / 评论</small></div>
          <div class="report-scope-item"><span>Reddit</span><strong>${redditStats.posts}/${redditStats.comments}</strong><small>帖子 / 评论</small></div>
          <div class="report-scope-item model"><span>AI 分析模型</span><strong>${escapeHtml(analysisModel)}</strong><small>独立分析请求</small></div>
        </div>
        ${failedSources.length ? `<p class="warning">部分来源采集失败，报告已保留缺失说明，不会用推测内容冒充事实。</p>` : ""}
      </section>

      <section id="profile">
        <h2>基础信息</h2>
        <div class="info-grid">
          <div class="info-card"><strong>产品一句话介绍</strong><p>${escapeHtml(profileValue(deepSeekProfileTranslation, "summary", task.appProfile?.summary))}</p></div>
          <div class="info-card"><strong>产品定位</strong><p>${escapeHtml(profileValue(deepSeekProfileTranslation, "positioning", task.appProfile?.positioning))}</p></div>
          <div class="info-card"><strong>主要场景</strong><p>${escapeHtml(profileValue(deepSeekProfileTranslation, "useCases", task.appProfile?.useCases))}</p></div>
          <div class="info-card"><strong>支持平台</strong><p>${escapeHtml(supportedPlatforms)}</p></div>
        </div>
        ${renderCustomerSegments(deepSeekCustomerSegments, task.appProfile?.targetUsers, deepSeekCustomerSegmentsError)}
      </section>

      <section id="features">
        <h2>功能分析</h2>
        ${renderDeepSeekFeatureAnalysis(deepSeekFeatureAnalysis, task.appProfile?.features)}
      </section>

      <section id="google-research">
        ${renderGoogleResearchSection(googleResearch, task.googleResearchItems)}
      </section>

      <section id="reviews">
        ${renderReviewAnalysisSection(task, appStoreSummary, appStoreRatings, deepSeekReviewSummary)}
      </section>

      <section id="promotion">
        ${renderPromotionSection(task.promotions, deepSeekPromotionSummary, deepSeekPromotionPainPointFit)}
      </section>

      <section id="community">
        ${renderCommunitySection(task.communityItems, deepSeekCommunitySummary, deepSeekCommunityError)}
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

      <section id="sources">
        <h2>数据来源</h2>
        <table>
          <thead><tr><th>来源名称</th><th>类型</th><th>状态</th><th>采集时间</th><th>链接/错误</th></tr></thead>
          <tbody>
            ${visibleSources
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

type ReviewInsight = {
  title: string;
  summary: string;
  count: number;
  percent: number;
  quote: string;
  badge: string;
  badgeKind: "good" | "bad" | "medium";
};

function renderReviewAnalysisSection(
  task: ReportTask,
  appStoreSummary: Record<string, unknown> | null,
  appStoreRatings: Record<string, unknown> | null,
  deepSeekReviewSummary: Record<string, unknown> | null
) {
  const stats = buildReviewStats(task.reviews, appStoreSummary);
  const deepSeekInsights = reviewInsightGroups(deepSeekReviewSummary, stats.total);
  const positiveReviews = representativeReviews(task.reviews, "positive");
  const negativeReviews = representativeReviews(task.reviews, "negative");
  const requestReviews = representativeReviews(task.reviews, "request");
  const countries = inferReviewCountries(task.reviews);
  const sourceText = countries.length ? `来自 ${countries.length} 个国家/地区` : "国家/地区暂未识别";
  const samplingText = reviewSamplingSourceSummary(task.sources, stats.total);
  const reviewSourceText = samplingText ? `${sourceText}；${samplingText}` : sourceText;
  const ratingBreakdown = renderRatingBreakdown(appStoreRatings);
  const model = typeof deepSeekReviewSummary?.model === "string" ? deepSeekReviewSummary.model : "系统规则 + DeepSeek";
  const donutPositive = stats.total ? stats.positiveRate : 0;
  const donutNeutral = stats.total ? stats.positiveRate + stats.neutralRate : 100;
  const donutNegative = stats.total ? stats.positiveRate + stats.neutralRate + stats.negativeRate : 100;

  return `<div class="review-module">
    <div class="review-head">
      <div>
        <h2>用户评价分析</h2>
      </div>
      <div class="review-actions">
        <span class="review-filter">国家：全部国家</span>
        <span class="review-filter">时间范围：最近采集</span>
      </div>
    </div>
    <div class="review-metrics">
      <div class="review-metric-card"><span>分析评论数</span><strong>${escapeHtml(String(stats.total))}</strong><small>${escapeHtml(reviewSourceText)}</small></div>
      <div class="review-metric-card"><span>平均评分</span><strong>${escapeHtml(stats.averageRating)}<small class="stars">${escapeHtml(starText(stats.averageRating))}</small></strong><small>${ratingBreakdown || "基于可用评分样本"}</small></div>
      <div class="review-metric-card"><span>正面评论占比</span><strong>${stats.positiveRate}%</strong><small>${stats.positive} 条</small></div>
      <div class="review-metric-card"><span>中性评论占比</span><strong>${stats.neutralRate}%</strong><small>${stats.neutral} 条</small></div>
      <div class="review-metric-card"><span>负面评论占比</span><strong>${stats.negativeRate}%</strong><small>${stats.negative} 条</small></div>
      <div class="review-metric-card"><span>包含功能诉求</span><strong>${stats.featureRequests}</strong><small>${stats.featureRequestRate}% 的评论</small></div>
    </div>
    ${renderReviewPlatformSources(task.sources, task.reviews)}
    <div class="review-grid review-grid-sentiment">
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
      ${renderReviewOverview(deepSeekReviewSummary, model, stats)}
    </div>
    ${renderInsightGrid(deepSeekInsights.positiveInsights, deepSeekInsights.problemInsights, deepSeekInsights.opportunityInsights)}
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
    <p class="muted">数据基于已采集的 Apple App Store 与 Google Play 评价正文生成；评分概览和评论正文来自不同公开接口时，不会用评分数据伪造成单条评论。</p>
  </div>`;
}

function renderReviewPlatformSources(sources: ReportTask["sources"], reviews: ReviewItem[]) {
  const platforms = [
    { name: "Apple App Store", platform: "Apple App Store", sourceType: "APP_STORE_REVIEWS" },
    { name: "Google Play", platform: "Google Play Store", sourceType: "GOOGLE_PLAY_REVIEWS" }
  ];
  return `<div class="review-platform-sources">${platforms
    .map(({ name, platform, sourceType }) => {
      const source = sources.filter((item) => item.sourceType === sourceType).at(-1);
      const count = reviews.filter((review) => review.platform === platform).length;
      const payload = readSourcePayload(source);
      const fetchedCount = positiveInteger(payload?.fetchedReviewCount);
      const selectedCount = positiveInteger(payload?.selectedReviewCount) ?? count;
      const failed = source?.status === "FAILED";
      const sampledStatus =
        fetchedCount && fetchedCount > selectedCount
          ? `已采集，从 ${fetchedCount.toLocaleString("zh-CN")} 条抓取评论中过滤出 ${selectedCount.toLocaleString("zh-CN")} 条高质量样本`
          : `已采集，${count} 条高质量样本`;
      const status = failed ? source.errorMessage || "评论采集失败" : source?.status === "SUCCESS" ? sampledStatus : "未采集";
      return `<div class="review-platform-source${failed ? " failed" : ""}"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(status)}</span></div>`;
    })
    .join("")}</div>`;
}

function reviewSamplingSourceSummary(sources: ReportTask["sources"], analyzedCount: number) {
  const fetchedCount = reviewSourcePayloads(sources)
    .map((payload) => positiveInteger(payload.fetchedReviewCount))
    .filter((count): count is number => typeof count === "number")
    .reduce((sum, count) => sum + count, 0);

  if (!fetchedCount) return "";
  const formattedFetched = fetchedCount.toLocaleString("zh-CN");
  if (fetchedCount > analyzedCount) return `从 ${formattedFetched} 条抓取评论中过滤得到`;
  return `已分析全部 ${formattedFetched} 条抓取评论`;
}

function reviewSourcePayloads(sources: ReportTask["sources"]) {
  return ["APP_STORE_REVIEWS", "GOOGLE_PLAY_REVIEWS"]
    .map((sourceType) => sources.filter((source) => source.sourceType === sourceType && source.status === "SUCCESS").at(-1))
    .map(readSourcePayload)
    .filter((payload): payload is Record<string, unknown> => Boolean(payload));
}

function readSourcePayload(source?: ReportTask["sources"][number]) {
  if (!source?.rawContent) return null;
  try {
    const payload = JSON.parse(source.rawContent) as unknown;
    return payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function positiveInteger(value: unknown) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : NaN;
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
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

function renderReviewOverview(summary: Record<string, unknown> | null, model: string, stats: ReviewStats) {
  const overview = textValue(summary?.overview).slice(0, 180) || `当前共分析 ${stats.total} 条评论，正面占比 ${stats.positiveRate}%，负面占比 ${stats.negativeRate}%。`;
  return `<div class="review-summary-overview"><span class="review-summary-mark">AI</span><div><strong>总结概览</strong><p>${escapeHtml(overview)}</p></div><span class="badge">由 ${escapeHtml(model)} 生成</span></div>`;
}

function reviewInsightGroups(summary: Record<string, unknown> | null, totalReviews: number) {
  const groups = {
    positiveInsights: normalizeReviewInsights(summary?.positiveInsights, totalReviews, "正面", "good"),
    problemInsights: normalizeReviewInsights(summary?.problemInsights, totalReviews, "问题", "bad"),
    opportunityInsights: normalizeReviewInsights(summary?.opportunityInsights, totalReviews, "机会", "medium")
  };
  if (groups.positiveInsights.length || groups.problemInsights.length || groups.opportunityInsights.length || !Array.isArray(summary?.insights)) {
    return groups;
  }
  return {
    positiveInsights: normalizeReviewInsights(summary.insights.filter((item) => reviewInsightKindFromRecord(item) === "positive"), totalReviews, "正面", "good"),
    problemInsights: normalizeReviewInsights(summary.insights.filter((item) => reviewInsightKindFromRecord(item) === "problem"), totalReviews, "问题", "bad"),
    opportunityInsights: normalizeReviewInsights(summary.insights.filter((item) => reviewInsightKindFromRecord(item) === "opportunity"), totalReviews, "机会", "medium")
  };
}

function reviewInsightKindFromRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? textValue((value as Record<string, unknown>).kind) : "";
}

function normalizeReviewInsights(value: unknown, totalReviews: number, fallbackBadge: string, badgeKind: ReviewInsight["badgeKind"]) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const title = textValue(record.title).slice(0, 60);
      const summary = textValue(record.summary).slice(0, 140);
      const quote = textValue(record.quote).slice(0, 180);
      const reviewIndexes = Array.isArray(record.reviewIndexes)
        ? Array.from(new Set(record.reviewIndexes.map((index) => Number(index)).filter((index) => Number.isInteger(index) && index > 0)))
        : [];
      const confidence = textValue(record.confidence);
      const severity = textValue(record.severity);
      const badge = badgeKind === "bad" ? severity || confidence || fallbackBadge : confidence || severity || fallbackBadge;
      if (!title || (!summary && !quote)) return null;
      return {
        title,
        summary,
        count: reviewIndexes.length,
        percent: percent(reviewIndexes.length, totalReviews),
        quote,
        badge,
        badgeKind
      };
    })
    .filter((item): item is ReviewInsight => Boolean(item))
}

function renderInsightGrid(positiveInsights: ReviewInsight[], problemInsights: ReviewInsight[], opportunityInsights: ReviewInsight[]) {
  const cards = [
    renderInsightCard("用户认可的亮点", positiveInsights, "good"),
    renderInsightCard("用户集中抱怨的问题", problemInsights, "bad"),
    renderInsightCard("用户诉求与产品机会", opportunityInsights, "opportunity")
  ].filter(Boolean);
  return cards.length ? `<div class="insight-grid">${cards.join("")}</div>` : "";
}

function renderInsightCard(title: string, insights: ReviewInsight[], kind: "good" | "bad" | "opportunity") {
  if (!insights.length) return "";
  const visibleInsights = insights.slice(0, 5);
  const hiddenInsights = insights.slice(5);
  return `<div class="insight-card ${kind}"><h3>${escapeHtml(title)}</h3><ol class="insight-list">${visibleInsights.map(renderInsightItem).join("")}</ol>${
    hiddenInsights.length
      ? `<details class="insight-more"><summary><span class="summary-closed">展开其余 ${hiddenInsights.length} 个主题</span><span class="summary-open">收起其余 ${hiddenInsights.length} 个主题</span></summary><ol class="insight-list">${hiddenInsights.map((insight, index) => renderInsightItem(insight, index + 5)).join("")}</ol></details>`
      : ""
  }</div>`;
}

function renderInsightItem(insight: ReviewInsight, index: number) {
  return `<li><span class="insight-rank">${index + 1}</span><span class="insight-main"><strong>${escapeHtml(insight.title)}</strong><span>${escapeHtml(insight.summary)}${insight.quote ? ` · “${escapeHtml(insight.quote)}”` : ""}${insight.count ? ` · ${insight.count} 条证据（${insight.percent}%）` : ""}</span></span><span class="severity ${insight.badgeKind}">${escapeHtml(insight.badge)}</span></li>`;
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

function trimText(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function percent(count: number, total: number) {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

function renderDeepSeekFeatureAnalysis(summary: Record<string, unknown> | null, fallbackFeatures?: string | null) {
  const features = Array.isArray(summary?.features)
    ? summary.features.map(normalizeFeatureAnalysisItem).filter((feature): feature is FeatureAnalysisItem => Boolean(feature))
    : [];
  if (!features.length) {
    return renderFallbackFeatureAnalysis(fallbackFeatures);
  }

  return `<div class="feature-panel"><div class="feature-list">${features
    .map(
      (feature, index) => `<details class="feature-item"${index === 0 ? " open" : ""}><summary>${escapeHtml(feature.tag)}</summary><div class="feature-body"><div class="feature-row"><div class="feature-label">综合能力判断</div><div class="feature-value">${escapeHtml(localizedAbilitySummary(feature.abilitySummary))}</div></div><div class="feature-row"><div class="feature-label">证据来源</div><div class="feature-value">${feature.evidenceSources.map((source) => `<span class="tag">${escapeHtml(featureEvidenceSourceLabel(source))}</span>`).join("") || "暂未标注"}</div></div><div class="feature-feedback"><div class="feature-feedback-box"><strong>用户正向反馈</strong>${renderFeatureList(feature.userPros, "暂无用户评价反馈，当前仅保留多来源能力证据。")}</div><div class="feature-feedback-box risk"><strong>用户负向反馈 / 风险</strong>${renderFeatureList(feature.userCons, "暂无用户评价反馈，尚未发现明确风险。")}</div></div></div></details>`
    )
    .join("")}</div></div>`;
}

type FeatureAnalysisItem = {
  tag: string;
  abilitySummary: string;
  evidenceSources: string[];
  userPros: string[];
  userCons: string[];
};

function normalizeFeatureAnalysisItem(value: unknown): FeatureAnalysisItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const tag = textValue(record.tag).slice(0, 24);
  const abilitySummary = (textValue(record.abilitySummary) || textValue(record.officialClaim)).slice(0, 560);
  if (!tag || !abilitySummary) return null;
  return {
    tag,
    abilitySummary,
    evidenceSources: stringArray(record.evidenceSources).slice(0, 5),
    userPros: stringArray(record.userPros).slice(0, 2),
    userCons: stringArray(record.userCons).slice(0, 2)
  };
}

function renderFeatureList(items: string[], emptyText: string) {
  if (!items.length) return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(localizedFeatureFeedback(item))}</li>`).join("")}</ul>`;
}

function localizedAbilitySummary(value: string) {
  return looksMostlyEnglish(value) ? `待重新生成中文说明：${value}` : value;
}

function localizedFeatureFeedback(value: string) {
  return looksMostlyEnglish(value) ? "该条反馈来自英文评论，请重新生成中文功能分析后展示。" : value;
}

function featureEvidenceSourceLabel(value: string) {
  return value === "视频字幕" ? "社区视频字幕" : value;
}

function looksMostlyEnglish(value: string) {
  const letters = value.match(/[A-Za-z]/g)?.length ?? 0;
  const chinese = value.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  return letters > 20 && letters > chinese * 2;
}

function renderFallbackFeatureAnalysis(value?: string | null) {
  const tags = value?.split(/[、,]/).map((item) => item.trim()).filter(Boolean) ?? [];
  if (!tags.length) return "<p>暂未获取</p>";

  return `<div class="feature-panel"><div class="feature-list">${tags
    .map(
      (tag, index) => `<details class="feature-item"${index === 0 ? " open" : ""}><summary>${escapeHtml(tag)}</summary><div class="feature-body"><div class="feature-row"><div class="feature-label">综合能力判断</div><div class="feature-value">公开文本中出现该功能关键词，尚未完成 DeepSeek 结构化分析。</div></div><div class="feature-row"><div class="feature-label">证据来源</div><div class="feature-value"><span class="tag">官网</span><span class="tag">App Store</span></div></div><div class="feature-feedback"><div class="feature-feedback-box"><strong>用户正向反馈</strong><p class="muted">暂无用户评价反馈。</p></div><div class="feature-feedback-box risk"><strong>用户负向反馈 / 风险</strong><p class="muted">暂无用户评价反馈。</p></div></div></div></details>`
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

  const groups: Array<[string, string]> = [
    ["core", "核心客户群体"],
    ["high_value", "高价值客户"],
    ["secondary", "次级客户"],
    ["potential", "潜在客户群体"]
  ];

	  return `<div class="customer-module"><div class="customer-head"><h3>目标客户群体</h3><span class="badge">查看全部</span></div><div class="customer-tabs">${groups
	    .map(([type, label], index) => `<button class="customer-tab${index === 0 ? " active" : ""}" type="button" data-customer-tab="${escapeHtml(type)}">${escapeHtml(label)}</button>`)
	    .join("")}</div>${groups
	    .map(([type], index) => renderCustomerCardsPanel(type, prioritizedCustomerSegments(segments.filter((segment) => segment.segmentType === type)).slice(0, 3), index === 0))
	    .join("")}</div>`;
}

function renderCustomerCardsPanel(type: string, segments: CustomerSegment[], active: boolean) {
  return `<div class="customer-cards${active ? " active" : ""}" data-customer-panel="${escapeHtml(type)}">${segments.length ? segments.map((segment) => renderCustomerCard(segment, false)).join("") : `<p class="muted">暂无该分类客户群体。</p>`}</div>`;
}

function renderCustomerCard(segment: CustomerSegment, open: boolean) {
  return `<details class="customer-card"${open ? " open" : ""}><summary><div class="customer-card-title"><strong>${escapeHtml(segment.segmentName)}</strong><div class="customer-badges"><span class="badge">${escapeHtml(industryFitLabel(segment.industryFit))}</span><span class="badge">${escapeHtml(confidenceLabel(segment.confidence))}</span>${segment.isInferred ? `<span class="badge warning">推断</span>` : ""}</div></div><div class="customer-preview"><div><strong>行业：</strong>${escapeHtml(segment.industry || "暂未判断")}</div><div><strong>细分行业：</strong>${escapeHtml(joinList(segment.subIndustries))}</div><div><strong>典型岗位：</strong>${escapeHtml(joinList(segment.roles))}</div><div><strong>核心场景：</strong>${escapeHtml(joinList(segment.useCases))}</div><div><strong>核心痛点：</strong>${escapeHtml(joinList(segment.painPoints))}</div><div><strong>购买动机：</strong>${escapeHtml(joinList(segment.paymentMotivations))}</div></div><div class="customer-more">更多详情（组织类型、能力需求、决策者等）</div></summary><div class="customer-detail"><div class="customer-detail-grid"><div class="customer-detail-item"><strong>组织类型</strong><span>${escapeHtml(segment.organizationType || "暂未判断")}</span></div><div class="customer-detail-item"><strong>企业规模</strong><span>${escapeHtml(segment.companySize || "暂未判断")}</span></div><div class="customer-detail-item"><strong>典型部门</strong><span>${escapeHtml(joinList(segment.departments))}</span></div><div class="customer-detail-item"><strong>核心任务</strong><span>${escapeHtml(joinList(segment.jobsToBeDone))}</span></div><div class="customer-detail-item"><strong>需要能力</strong><span>${escapeHtml(joinList(segment.requiredCapabilities))}</span></div><div class="customer-detail-item"><strong>使用者</strong><span>${escapeHtml(joinList(segment.users))}</span></div><div class="customer-detail-item"><strong>决策者</strong><span>${escapeHtml(joinList(segment.buyers))}</span></div><div class="customer-detail-item"><strong>预期价值</strong><span>${escapeHtml(joinList(segment.expectedValue))}</span></div><div class="customer-detail-item"><strong>证据来源</strong><span>${escapeHtml(joinList(segment.evidenceSources))}</span></div><div class="customer-detail-item"><strong>匹配原因</strong><span>${escapeHtml(segment.industryFitReason || "暂未判断")}</span></div></div></div></details>`;
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

function profileValue(translation: Record<string, unknown> | null, field: string, fallback?: string | null) {
  return typeof translation?.[field] === "string" && translation[field].trim() ? translation[field] : fallback || "暂未获取";
}

function supportPlatformsValue(task: ReportTask, translation: Record<string, unknown> | null) {
  const values = splitPlatformText(profileValue(translation, "platforms", task.appProfile?.platforms));
  const successfulSourceTypes = new Set(task.sources.filter((source) => source.status === "SUCCESS").map((source) => source.sourceType));
  if (successfulSourceTypes.has("APP_STORE") || task.reviews.some((review) => review.platform === "Apple App Store")) {
    values.push("iOS");
  }
  if (successfulSourceTypes.has("GOOGLE_PLAY") || task.reviews.some((review) => review.platform === "Google Play Store")) {
    values.push("Android");
  }
  const normalized = uniquePlatformValues(values).filter((value) => value !== "暂未获取");
  return normalized.length ? normalized.join("、") : "暂未获取";
}

function splitPlatformText(value: string) {
  return value
    .split(/[、,，\/／;；\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniquePlatformValues(values: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const key = platformKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(platformLabel(value));
  }
  return output;
}

function platformKey(value: string) {
  const normalized = value.toLowerCase();
  if (/google\s*play|谷歌应用|安卓应用|android/.test(normalized)) return "android";
  if (/app\s*store|apple|ios|iphone|ipad|苹果/.test(normalized)) return "ios";
  if (/web|website|browser|网页|官网/.test(normalized)) return "web";
  return normalized.replace(/\s+/g, "");
}

function platformLabel(value: string) {
  const key = platformKey(value);
  if (key === "android") return "Android";
  if (key === "ios") return "iOS";
  if (key === "web") return "Web";
  return value;
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
  if (value === "unknown") return "暂未判断";
  return "暂未获取";
}

function latestFetchTime(task: ReportTask) {
  const times = task.sources
    .map((source) => source.fetchedAt?.getTime())
    .filter((time): time is number => Boolean(time));
  return times.length ? new Date(Math.max(...times)).toLocaleString("zh-CN") : "暂未获取";
}

function communityPlatformStats(items: ReportTask["communityItems"], platform: string) {
  return {
    videos: items.filter((item) => item.platform === platform && item.itemType === "VIDEO").length,
    posts: items.filter((item) => item.platform === platform && item.itemType === "POST").length,
    comments: items.filter((item) => item.platform === platform && item.itemType === "COMMENT").length
  };
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

type GoogleResearchItem = ReportTask["googleResearchItems"][number];

const googleResearchDimensionLabels: Record<string, string> = {
  industry_trends: "行业趋势",
  technology_changes: "技术变化",
  competitor_movements: "竞品动态",
  user_demand_changes: "用户需求变化"
};

function readGoogleResearchAnalyses(task: ReportTask) {
  return Object.keys(googleResearchDimensionLabels).map((dimension) => ({
    dimension,
    label: googleResearchDimensionLabels[dimension],
    summary: readAnalysis(task, `DEEPSEEK_GOOGLE_RESEARCH_${dimension.toUpperCase()}`),
    error: readAnalysis(task, `DEEPSEEK_GOOGLE_RESEARCH_${dimension.toUpperCase()}_ERROR`)
  }));
}

function renderGoogleResearchSection(analyses: ReturnType<typeof readGoogleResearchAnalyses>, items: GoogleResearchItem[]) {
  const total = items.length;
  return `<div class="google-research-module"><h2>行业研究</h2><p class="muted">基于 Google 公开文章，按四个维度分别分析；共采集 ${total} 篇文章，每个维度独立调用一次 AI。</p><div class="google-research-grid">${analyses.map((entry) => {
    const summary = entry.summary;
    const error = textValue(entry.error?.message);
    const dimensionItems = items.filter((item) => item.dimension === entry.dimension);
    if (!summary) {
      return `<article class="google-research-card"><h3>${escapeHtml(entry.label)}</h3><p class="muted">${escapeHtml(error || (dimensionItems.length ? "该维度暂未生成分析。" : "该维度暂无可用文章。"))}</p>${renderGoogleResearchArticleLinks(dimensionItems)}</article>`;
    }
    const findings = stringArray(summary.keyFindings).slice(0, 6);
    const implications = stringArray(summary.implications).slice(0, 4);
    return `<article class="google-research-card"><h3>${escapeHtml(textValue(summary.title) || entry.label)}</h3><p>${escapeHtml(textValue(summary.summary))}</p>${findings.length ? `<strong>关键发现</strong><ul>${findings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}${implications.length ? `<strong>产品启示</strong><ul>${implications.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}${renderGoogleResearchEvidence(summary.evidence, dimensionItems)}</article>`;
  }).join("")}</div></div>`;
}

function renderGoogleResearchArticleLinks(items: GoogleResearchItem[]) {
  if (!items.length) return "";
  return `<div class="google-research-evidence"><span class="muted">采集文章：</span>${items.slice(0, 8).map((item, index) => `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer" title="${escapeHtml(item.title)}">原文 ${index + 1}</a>`).join("")}</div>`;
}

function renderGoogleResearchEvidence(value: unknown, items: GoogleResearchItem[]) {
  if (!Array.isArray(value)) return renderGoogleResearchArticleLinks(items);
  const indexes = value.flatMap((entry) => entry && typeof entry === "object" && Array.isArray((entry as Record<string, unknown>).articleIndexes) ? (entry as Record<string, unknown>).articleIndexes as unknown[] : []).map(Number).filter((index) => Number.isInteger(index) && index > 0);
  const uniqueIndexes = Array.from(new Set(indexes)).filter((index) => items[index - 1]);
  if (!uniqueIndexes.length) return renderGoogleResearchArticleLinks(items);
  return `<div class="google-research-evidence"><span class="muted">证据出处：</span>${uniqueIndexes.map((index) => `<a href="${escapeHtml(items[index - 1].sourceUrl)}" target="_blank" rel="noreferrer" title="${escapeHtml(items[index - 1].title)}">文章 ${index}</a>`).join("")}</div>`;
}

function reportAnalysisModel(task: ReportTask) {
  const models = task.analyses
    .filter((analysis) => analysis.analysisType.startsWith("DEEPSEEK_"))
    .flatMap((analysis) => {
      try {
        const value = JSON.parse(analysis.resultJson) as Record<string, unknown>;
        return typeof value.model === "string" && value.model.trim() ? [value.model.trim()] : [];
      } catch {
        return [];
      }
    });
  const uniqueModels = Array.from(new Set(models));
  return uniqueModels.length ? uniqueModels.join(" / ") : "未配置或降级";
}

type CommunityItem = ReportTask["communityItems"][number];

type CommunityEvidenceInsight = {
  title: string;
  summary: string;
  evidenceIndexes: number[];
};

type CommunityTopic = CommunityEvidenceInsight & {
  platforms: string[];
  heat: string;
};

type CommunityFlow = {
  fromProduct: string;
  toProducts: string[];
  reason: string;
  evidenceIndexes: number[];
};

type CommunityReviewGap = {
  title: string;
  reviewerClaim: string;
  userFeedback: string;
  gap: string;
  evidenceIndexes: number[];
};

type CommunityOpportunity = CommunityEvidenceInsight;

function renderCommunitySection(items: CommunityItem[], summary: Record<string, unknown> | null, errorSummary: Record<string, unknown> | null) {
  if (!items.length) {
    const error = textValue(errorSummary?.message);
    return `<div class="community-module"><h2>社区分析</h2>${error ? `<p class="warning">社区讨论分析失败：${escapeHtml(error)}</p>` : ""}<div class="community-empty">暂未采集到可用的社区帖子、视频或评论。请检查 YouTube、Reddit、TikTok 等公开内容状态。</div></div>`;
  }

  const analysis = normalizeCommunityAnalysis(summary);
  const representativeItems = representativeCommunityItems(items);
  const youtubeStats = communityPlatformStats(items, "YouTube");
  const redditStats = communityPlatformStats(items, "Reddit");
  const tiktokStats = communityPlatformStats(items, "TikTok");
  const error = textValue(errorSummary?.message);
  return `<div class="community-module">
    <h2>社区分析</h2>
    <div class="community-proof">
      <span><strong>精选样本 ${items.length} 条</strong> · YouTube ${youtubeStats.videos}/${youtubeStats.comments} · Reddit ${redditStats.posts}/${redditStats.comments} · TikTok ${tiktokStats.videos}/${tiktokStats.comments}</span>
      <span>已过滤低相关内容，优先保留贴主观点、代表评论、竞品比较和使用体验证据。</span>
    </div>
    ${error ? `<p class="warning">AI 社区分析失败：${escapeHtml(error)}。下方仍保留已采集的代表内容。</p>` : ""}
    <div class="community-top-grid">
      <div class="community-panel">
        <div class="community-panel-head"><h3>跨平台核心议题 Top 5</h3></div>
        ${analysis.hotTopics.length ? `<ol class="community-topic-list">${analysis.hotTopics.map((item, index) => renderCommunityTopic(item, index, items)).join("")}</ol>` : `<p class="community-empty">暂无足够证据生成核心议题。</p>`}
      </div>
      <div class="community-panel">
        <div class="community-panel-head"><h3>用户需求与产品选择动因</h3></div>
        ${renderCommunityInsightList(analysis.alternativeReasons, "暂无明确的产品选择动因。", items)}
      </div>
    </div>
    <div class="community-analysis-grid">
      ${renderCommunityFlowCard(analysis.competitorFlows, items)}
      ${renderCommunityGapCard(analysis.reviewGaps, items)}
      ${renderCommunityOpportunityCard(analysis.opportunities, items)}
    </div>
    <div>
      <div class="community-panel-head"><h3>代表视频和评论</h3><span class="badge">可打开原始来源</span></div>
      <div class="community-content-grid">${representativeItems.map(renderCommunityContent).join("")}</div>
    </div>
  </div>`;
}

function normalizeCommunityAnalysis(summary: Record<string, unknown> | null) {
  const records = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : []);
  const indexes = (value: unknown) => reportNumberList(value, 8);
  const evidence = (value: Record<string, unknown>): CommunityEvidenceInsight | null => {
    const title = textValue(value.title).slice(0, 48);
    const summaryText = textValue(value.summary).slice(0, 140);
    const evidenceIndexes = indexes(value.evidenceIndexes);
    return title && summaryText && evidenceIndexes.length ? { title, summary: summaryText, evidenceIndexes } : null;
  };
  const hotTopics = records(summary?.hotTopics)
    .map((value) => {
      const base = evidence(value);
      return base ? { ...base, platforms: stringArray(value.platforms).slice(0, 2), heat: textValue(value.heat).slice(0, 8) } : null;
    })
    .filter((item): item is CommunityTopic => Boolean(item))
    .slice(0, 5);
  const alternativeReasons = records(summary?.alternativeReasons).map(evidence).filter((item): item is CommunityEvidenceInsight => Boolean(item)).slice(0, 5);
  const competitorFlows = records(summary?.competitorFlows)
    .map((value) => {
      const fromProduct = textValue(value.fromProduct).slice(0, 60);
      const toProducts = stringArray(value.toProducts).slice(0, 5);
      const reason = textValue(value.reason).slice(0, 140);
      const evidenceIndexes = indexes(value.evidenceIndexes);
      return fromProduct && toProducts.length && reason && evidenceIndexes.length ? { fromProduct, toProducts, reason, evidenceIndexes } : null;
    })
    .filter((item): item is CommunityFlow => Boolean(item))
    .slice(0, 5);
  const reviewGaps = records(summary?.reviewGaps)
    .map((value) => {
      const title = textValue(value.title).slice(0, 48);
      const reviewerClaim = textValue(value.reviewerClaim).slice(0, 110);
      const userFeedback = textValue(value.userFeedback).slice(0, 110);
      const gap = textValue(value.gap).slice(0, 140);
      const evidenceIndexes = indexes(value.evidenceIndexes);
      return title && reviewerClaim && userFeedback && gap && evidenceIndexes.length ? { title, reviewerClaim, userFeedback, gap, evidenceIndexes } : null;
    })
    .filter((item): item is CommunityReviewGap => Boolean(item))
    .slice(0, 5);
  const opportunities = records(summary?.opportunities)
    .map((value) => {
      const base = evidence(value);
      return base;
    })
    .filter((item): item is CommunityOpportunity => Boolean(item))
    .slice(0, 5);
  return { hotTopics, alternativeReasons, competitorFlows, reviewGaps, opportunities };
}

function renderCommunityTopic(item: CommunityTopic, index: number, sourceItems: CommunityItem[]) {
  const platforms = item.platforms.length ? item.platforms : ["社区样本"];
  return `<li class="community-topic"><span class="community-rank">${index + 1}</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.summary)}</p><div class="community-platforms">${platforms.map((platform) => `<span class="community-platform">${escapeHtml(platform)}</span>`).join("")}</div>${renderCommunityEvidenceLinks(item.evidenceIndexes, sourceItems)}</div></li>`;
}

function renderCommunityInsightList(items: CommunityEvidenceInsight[], emptyText: string, sourceItems: CommunityItem[]) {
  return items.length
    ? `<div class="community-insight-list">${items.map((item) => `<div class="community-insight"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.summary)}</p>${renderCommunityEvidenceLinks(item.evidenceIndexes, sourceItems)}</div>`).join("")}</div>`
    : `<p class="muted">${escapeHtml(emptyText)}</p>`;
}

function renderCommunityFlowCard(items: CommunityFlow[], sourceItems: CommunityItem[]) {
  return `<div class="community-analysis-card"><h3>社区提及品牌与替代方案</h3>${items.length ? `<div class="community-insight-list">${items.map((item) => `<div class="community-insight"><strong>${escapeHtml(item.fromProduct)} -> ${escapeHtml(item.toProducts.join("、"))}</strong><p>${escapeHtml(item.reason)}</p><div class="community-platforms">${item.toProducts.map((product) => `<span class="community-platform">${escapeHtml(product)}</span>`).join("")}</div>${renderCommunityEvidenceLinks(item.evidenceIndexes, sourceItems)}</div>`).join("")}</div>` : `<p class="muted">样本中暂无明确提及的品牌或替代方案。</p>`}</div>`;
}

function renderCommunityGapCard(items: CommunityReviewGap[], sourceItems: CommunityItem[]) {
  return `<div class="community-analysis-card"><h3>不同内容来源的观点差异</h3>${items.length ? `<div class="community-insight-list">${items.map((item) => `<div class="community-insight"><strong>${escapeHtml(item.title)}</strong><p>来源一：${escapeHtml(item.reviewerClaim)}</p><p>来源二：${escapeHtml(item.userFeedback)}</p><p>${escapeHtml(item.gap)}</p>${renderCommunityEvidenceLinks(item.evidenceIndexes, sourceItems)}</div>`).join("")}</div>` : `<p class="muted">暂无多来源观点差异证据。</p>`}</div>`;
}

function renderCommunityOpportunityCard(items: CommunityOpportunity[], sourceItems: CommunityItem[]) {
  return `<div class="community-analysis-card"><h3>待验证的产品启示</h3>${items.length ? `<div class="community-insight-list">${items.map((item) => `<div class="community-insight"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.summary)}</p>${renderCommunityEvidenceLinks(item.evidenceIndexes, sourceItems)}</div>`).join("")}</div>` : `<p class="muted">暂无可提炼的待验证启示。</p>`}</div>`;
}

function renderCommunityEvidenceLinks(indexes: number[], sourceItems: CommunityItem[]) {
  const links = indexes.map((index) => {
    const source = sourceItems[index - 1];
    if (!source) return null;
    const label = `证据 ${index}`;
    const sourceTitle = source.title || trimText(source.content, 80) || `${source.platform} 内容`;
    return source.sourceUrl
      ? `<a class="community-evidence-link" href="${escapeHtml(source.sourceUrl)}" target="_blank" rel="noreferrer" title="${escapeHtml(sourceTitle)}">${label}</a>`
      : `<span class="community-evidence-link" title="${escapeHtml(sourceTitle)}">${label}</span>`;
  }).filter(Boolean);
  return links.length ? `<div class="community-evidence-links" aria-label="证据出处">${links.join("")}</div>` : "";
}

function representativeCommunityItems(items: CommunityItem[]) {
  const selected: CommunityItem[] = [];
  const add = (item: CommunityItem) => {
    if (!selected.some((existing) => existing.id === item.id) && selected.length < 6) selected.push(item);
  };
  const sorted = [...items].sort((left, right) => (right.score ?? 0) - (left.score ?? 0) || (right.publishedAt?.getTime() ?? 0) - (left.publishedAt?.getTime() ?? 0));
  for (const type of ["POST", "VIDEO", "COMMENT"]) sorted.filter((item) => item.itemType === type).slice(0, 2).forEach(add);
  sorted.forEach(add);
  return selected;
}

function renderCommunityContent(item: CommunityItem) {
  const title = item.title || trimText(item.content, 64) || "社区内容";
  const type = item.itemType === "VIDEO" ? `${item.platform} 视频` : item.itemType === "POST" ? `${item.platform} 帖子` : `${item.platform} 评论`;
  const metadata = [item.author || "匿名", item.publishedAt ? item.publishedAt.toLocaleDateString("zh-CN") : "日期未知", item.score !== null ? `热度 ${item.score}` : ""].filter(Boolean).join(" · ");
  return `<article class="community-content"><div class="community-content-head"><span class="badge">${escapeHtml(type)}</span><span class="community-evidence">${escapeHtml(item.platform)}</span></div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(trimText(item.content, 180))}</p><span class="community-content-meta">${escapeHtml(metadata)}</span>${item.sourceUrl ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">打开来源</a>` : ""}</article>`;
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

type PromotionStrategy = {
  title: string;
  points: string[];
};

type PromotionPainPoint = {
  title: string;
  summary: string;
  reviewIndexes: number[];
  quote: string;
  severity: string;
  confidence: string;
  adFit: "命中" | "部分命中" | "未命中" | "无法判断";
  adFitReason: string;
  matchedAdIndexes: number[];
};

function renderPromotionSection(
  promotions: PromotionItem[],
  summary: Record<string, unknown> | null,
  painPointSummary: Record<string, unknown> | null
) {
  const analysis = normalizePromotionAnalysis(promotions, summary);

  if (!promotions.length && !hasPromotionSummary(summary)) {
    return `<div class="promotion-module"><h2>广告和推广</h2><div class="promotion-empty">当前没有足够素材生成广告推广分析。重新采集广告源后，此处会展示覆盖渠道、目标人群、传播信息和策略总结。</div></div>`;
  }

  return `<div class="promotion-module">
    <h2>广告和推广</h2>
    <div>
      <h3 class="promotion-title">推广概览</h3>
      <div class="promotion-overview-grid">${analysis.overview.map(renderPromotionOverviewCard).join("")}</div>
    </div>
    <div>
      <h3 class="promotion-title">核心传播信息</h3>
      <div class="promotion-signal-grid">${analysis.communicationSignals.map((item) => renderPromotionSignalCard(item, promotions)).join("")}</div>
    </div>
    <div>
      <h3 class="promotion-title">策略总结</h3>
      <div class="promotion-strategy-grid">${analysis.strategySummary.map(renderPromotionStrategyCard).join("")}</div>
    </div>
    ${renderPromotionPainPointFit(painPointSummary)}
    ${renderPromotionMaterials(promotions)}
  </div>`;
}

function renderPromotionOverviewCard(item: PromotionOverviewItem) {
  return `<div class="promotion-card"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.summary || "暂未判断")}</p>${item.details.length ? `<div class="promotion-tags">${item.details.map((detail) => `<span class="tag">${escapeHtml(detail)}</span>`).join("")}</div>` : ""}</div>`;
}

function renderPromotionSignalCard(item: PromotionSignal, promotions: PromotionItem[]) {
  const examples = selectPromotionExamples(item, promotions);
  return `<div class="promotion-signal">
    <strong>${escapeHtml(item.title)}</strong>
    <p>${escapeHtml(item.summary || "暂未判断")}</p>
    <div class="promotion-tags">${item.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
    ${examples.length ? `<details class="promotion-example-toggle"><summary>查看模范广告</summary><div class="promotion-example-list">${examples.map(renderPromotionExample).join("")}</div></details>` : ""}
  </div>`;
}

function renderPromotionExample(item: PromotionItem) {
  const content = trimText(extractPromotionDisplayText(item.content), 170);
  const imageUrl = promotionImageUrl(item.sourceUrl);
  return `<article class="promotion-example">
    ${imageUrl ? `<img class="promotion-example-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.title || "广告素材")}" loading="lazy" />` : ""}
    <div class="promotion-example-head"><strong>${escapeHtml(item.title || item.platform)}</strong><span class="badge">${escapeHtml(item.platform)}</span></div>
    <p>${escapeHtml(content || "暂未提取到广告正文")}</p>
    ${item.sourceUrl ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">打开来源</a>` : ""}
  </article>`;
}

function renderPromotionStrategyCard(item: PromotionStrategy) {
  return `<div class="promotion-strategy"><strong>${escapeHtml(item.title)}</strong><ul>${item.points.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul></div>`;
}

function renderPromotionPainPointFit(summary: Record<string, unknown> | null) {
  const painPoints = normalizePromotionPainPoints(summary);
  if (!painPoints.length) return "";

  return `<div>
    <h3 class="promotion-title">用户痛点与广告命中</h3>
    <div class="promotion-painpoint-grid">${painPoints.map(renderPromotionPainPoint).join("")}</div>
  </div>`;
}

function renderPromotionPainPoint(item: PromotionPainPoint) {
  const fitClass = item.adFit === "命中" ? "hit" : item.adFit === "部分命中" ? "partial" : item.adFit === "未命中" ? "miss" : "unknown";
  const tags = [
    `评论证据 ${item.reviewIndexes.length} 条`,
    item.matchedAdIndexes.length ? `广告证据 ${item.matchedAdIndexes.length} 条` : "无直接广告证据",
    item.severity ? `严重度：${item.severity}` : "",
    item.confidence ? `置信度：${item.confidence}` : ""
  ].filter(Boolean);
  return `<article class="promotion-painpoint">
    <div class="promotion-painpoint-head"><strong>${escapeHtml(item.title)}</strong><span class="severity ${item.severity === "高" ? "bad" : item.severity === "低" ? "good" : "medium"}">严重度：${escapeHtml(item.severity || "未标注")}</span></div>
    <p>${escapeHtml(item.summary)}</p>
    <div class="promotion-painpoint-fit"><span class="ad-fit ${fitClass}">广告${escapeHtml(item.adFit)}</span><p>${escapeHtml(item.adFitReason)}</p></div>
    <div class="promotion-tags">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
    ${item.quote ? `<p class="promotion-painpoint-quote">评论摘录：“${escapeHtml(item.quote)}”</p>` : ""}
  </article>`;
}

function normalizePromotionPainPoints(summary: Record<string, unknown> | null) {
  if (!Array.isArray(summary?.painPoints)) return [];
  return summary.painPoints
    .map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const item = value as Record<string, unknown>;
      const adFit = textValue(item.adFit);
      if (!["命中", "部分命中", "未命中", "无法判断"].includes(adFit)) return null;
      const title = textValue(item.title).slice(0, 32);
      const summaryText = textValue(item.summary).slice(0, 140);
      const reviewIndexes = reportNumberList(item.reviewIndexes, 8);
      const adFitReason = textValue(item.adFitReason).slice(0, 140);
      if (!title || !summaryText || !reviewIndexes.length || !adFitReason) return null;
      return {
        title,
        summary: summaryText,
        reviewIndexes,
        quote: textValue(item.quote).slice(0, 180),
        severity: textValue(item.severity).slice(0, 8),
        confidence: textValue(item.confidence).slice(0, 8),
        adFit: adFit as PromotionPainPoint["adFit"],
        adFitReason,
        matchedAdIndexes: reportNumberList(item.matchedAdIndexes, 8)
      };
    })
    .filter((item): item is PromotionPainPoint => Boolean(item))
    .slice(0, 6);
}

function reportNumberList(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0).slice(0, limit);
}

function renderPromotionMaterials(promotions: PromotionItem[]) {
  if (!promotions.length) return "";
  return `<details class="promotion-detail"><summary><span>详细广告素材</span></summary><div class="promotion-detail-body"><div class="promotion-material-grid">${promotions
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

function selectPromotionExamples(signal: PromotionSignal, promotions: PromotionItem[]) {
  const queryTerms = promotionExampleTerms([signal.title, signal.summary, ...signal.tags].join(" "));
  const scored = promotions
    .map((promotion, index) => ({
      promotion,
      index,
      score: promotionExampleScore(queryTerms, promotion)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const selected: PromotionItem[] = [];
  const selectedPlatforms = new Set<string>();
  for (const item of scored) {
    const platformKey = item.promotion.platform.toLowerCase();
    if (selected.length < 2 && !selectedPlatforms.has(platformKey)) {
      selected.push(item.promotion);
      selectedPlatforms.add(platformKey);
    }
  }
  for (const item of scored) {
    if (selected.length >= 2) break;
    if (!selected.includes(item.promotion)) selected.push(item.promotion);
  }

  return selected;
}

function promotionExampleScore(queryTerms: string[], promotion: PromotionItem) {
  const haystack = [
    promotion.platform,
    promotion.title,
    extractPromotionDisplayText(promotion.content),
    promotion.targetAudience,
    promotion.useCase,
    promotion.sellingPoints
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!haystack.trim()) return 0;

  let score = 0;
  for (const term of queryTerms) {
    if (!term) continue;
    if (haystack.includes(term)) score += term.length > 4 ? 2 : 1;
  }
  if (promotionImageUrl(promotion.sourceUrl)) score += 1;
  if (extractPromotionDisplayText(promotion.content).length > 40) score += 1;
  return score;
}

function promotionExampleTerms(value: string) {
  const normalized = value.toLowerCase();
  const phraseMatches = normalized.match(/[a-z][a-z0-9+.-]{2,}(?:\s+[a-z][a-z0-9+.-]{2,})?/g) ?? [];
  const chineseMatches = normalized.match(/[\u4e00-\u9fa5]{2,}/g) ?? [];
  return Array.from(new Set([...phraseMatches, ...chineseMatches].map((term) => term.trim()).filter((term) => !promotionStopTerms.has(term)))).slice(0, 18);
}

const promotionStopTerms = new Set(["and", "the", "for", "with", "广告", "推广", "核心", "卖点", "信息", "官方", "定位", "来源"]);

function extractPromotionDisplayText(value: string) {
  const ocr = /OCR文字：([^：]+?)(?:OCR失败：|素材下载失败：|目标链接：|图片素材：|视频素材：|$)/i.exec(value)?.[1];
  if (ocr?.trim()) return ocr.trim();
  return value
    .replace(/本地图片：\S+/g, "")
    .replace(/本地HTML素材：\S+/g, "")
    .replace(/目标链接：\S+/g, "")
    .replace(/图片素材：\S+/g, "")
    .replace(/视频素材：\S+/g, "")
    .trim();
}

function promotionImageUrl(value?: string | null) {
  return value && /^\/ad-assets\/.+\.(?:png|jpe?g|gif|webp)$/i.test(value) ? value : "";
}

function normalizePromotionAnalysis(promotions: PromotionItem[], summary: Record<string, unknown> | null) {
  const platformCounts = platformCountsFromPromotions(promotions);
  const channels = promotionArray(summary?.channels, 6, 24);
  const targetAudiences = promotionArray(summary?.targetAudiences, 6, 32);
  const coreSellingPoints = promotionArray(summary?.coreSellingPoints, 8, 32);
  const overview = promotionObjectArray(summary?.overview, normalizePromotionOverviewItem, 5).filter((item) => isPromotionOverviewCard(item.title));
  const communicationSignals = promotionObjectArray(summary?.communicationSignals, normalizePromotionSignal, 3).filter((item) => !isPromotionDirectionCard(item.title));
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
          { title: "核心卖点", summary: sellingPoints || "暂未判断", details: normalizedSellingPoints.slice(0, 4) }
        ],
    communicationSignals: communicationSignals.length
      ? communicationSignals
      : buildFallbackPromotionSignals(promotions, normalizedSellingPoints, useCases),
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

function isPromotionOverviewCard(title: string) {
  return ["覆盖来源", "核心卖点"].includes(title.trim());
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
