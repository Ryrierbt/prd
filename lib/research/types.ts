export type CollectedPage = {
  url: string;
  title: string;
  description: string;
  text: string;
  rawHtml: string;
  fetchedAt: Date;
};

export type SourceStatus = "SUCCESS" | "FAILED";

export type ReviewCategory =
  | "好评"
  | "差评"
  | "功能反馈"
  | "价格反馈"
  | "稳定性问题"
  | "准确性问题"
  | "用户体验问题"
  | "用户诉求"
  | "其他";

