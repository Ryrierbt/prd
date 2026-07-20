export const taskStatuses = {
  waiting: "WAITING",
  identifying: "IDENTIFYING",
  collectingWebsite: "COLLECTING_WEBSITE",
  collectingGoogle: "COLLECTING_GOOGLE",
  collectingPricing: "COLLECTING_PRICING",
  collectingReviews: "COLLECTING_REVIEWS",
  collectingCommunity: "COLLECTING_COMMUNITY",
  collectingPromotion: "COLLECTING_PROMOTION",
  collectionReview: "COLLECTION_REVIEW",
  analyzing: "ANALYZING",
  generatingReport: "GENERATING_REPORT",
  completed: "COMPLETED",
  partial: "PARTIAL_COMPLETED",
  failed: "FAILED"
} as const;

export type TaskStatus = (typeof taskStatuses)[keyof typeof taskStatuses];

export const statusLabels: Record<TaskStatus, string> = {
  WAITING: "等待开始",
  IDENTIFYING: "正在识别 App",
  COLLECTING_WEBSITE: "正在收集官网信息",
  COLLECTING_GOOGLE: "正在收集行业研究",
  COLLECTING_PRICING: "正在收集价格和套餐",
  COLLECTING_REVIEWS: "正在收集用户评价",
  COLLECTING_COMMUNITY: "正在收集社区讨论",
  COLLECTING_PROMOTION: "正在收集广告及推广信息",
  COLLECTION_REVIEW: "采集完成，等待确认",
  ANALYZING: "正在分析和分类",
  GENERATING_REPORT: "正在生成报告",
  COMPLETED: "已完成",
  PARTIAL_COMPLETED: "部分完成",
  FAILED: "失败"
};

export const statusOrder: Array<{ status: TaskStatus; progress: number }> = [
  { status: taskStatuses.waiting, progress: 0 },
  { status: taskStatuses.identifying, progress: 8 },
  { status: taskStatuses.collectingWebsite, progress: 22 },
  { status: taskStatuses.collectingGoogle, progress: 30 },
  { status: taskStatuses.collectingPricing, progress: 38 },
  { status: taskStatuses.collectingReviews, progress: 55 },
  { status: taskStatuses.collectingCommunity, progress: 66 },
  { status: taskStatuses.collectingPromotion, progress: 70 },
  { status: taskStatuses.collectionReview, progress: 82 },
  { status: taskStatuses.analyzing, progress: 84 },
  { status: taskStatuses.generatingReport, progress: 94 },
  { status: taskStatuses.completed, progress: 100 }
];
