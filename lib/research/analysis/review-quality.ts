export type ReviewQualityInput = {
  title?: string | null;
  content?: string | null;
  rating?: number | null;
  categories?: string[];
  updated?: Date | string | null;
  version?: string | null;
};

export function selectHighQualityReviewIndexes(reviews: ReviewQualityInput[], limit: number, fetchLimit = 200) {
  return reviews
    .map((review, index) => ({ review, index }))
    .sort((left, right) => reviewTime(right.review) - reviewTime(left.review))
    .slice(0, fetchLimit)
    .map((item, recencyIndex) => ({ ...item, recencyIndex, score: reviewQualityScore(item.review) }))
    .sort((left, right) => right.score - left.score || left.recencyIndex - right.recencyIndex)
    .slice(0, limit)
    .map((item) => item.index);
}

function reviewQualityScore(review: ReviewQualityInput) {
  const text = review.content?.replace(/\s+/g, " ").trim() ?? "";
  const title = review.title?.replace(/\s+/g, " ").trim() ?? "";
  const words = text.toLowerCase().match(/[a-z][a-z'-]{2,}|[\u4e00-\u9fff]/g) ?? [];
  const uniqueWordRatio = words.length ? new Set(words).size / words.length : 0;
  const hasSpecificSignal = /\b(transcri|summary|speaker|export|sync|calendar|crash|bug|slow|price|subscription|cancel|refund|accur|meeting|record|search|support)\b/i.test(
    `${title} ${text}`
  );
  const isGenericShortPraise = /^(great|good|nice|excellent|love it|awesome|perfect|best app)[.! ]*$/i.test(text || title);
  const hasUsefulCategory = review.categories?.some((category) => !["好评", "差评", "其他"].includes(category)) ?? false;

  let score = 0;
  score += Math.min(text.length, 900) * 0.08;
  score += Math.min(words.length, 160) * 0.35;
  score += uniqueWordRatio * 12;
  if (title.length >= 8) score += 6;
  if (hasSpecificSignal) score += 14;
  if (hasUsefulCategory) score += 8;
  if (review.rating === 1 || review.rating === 5) score += 3;
  if (review.updated) score += 2;
  if (review.version) score += 2;
  if (text.length < 25) score -= 18;
  if (isGenericShortPraise) score -= 20;
  return score;
}

function reviewTime(review: ReviewQualityInput) {
  const time = review.updated ? new Date(review.updated).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}
