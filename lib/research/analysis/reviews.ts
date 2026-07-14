import type { ReviewCategory } from "@/lib/research/types";

const keywordGroups: Array<{ category: ReviewCategory; keywords: string[] }> = [
  { category: "价格反馈", keywords: ["price", "expensive", "subscription", "free trial", "paid", "$", "cost"] },
  { category: "稳定性问题", keywords: ["crash", "bug", "freeze", "slow", "wifi", "internet", "offline", "stop"] },
  { category: "准确性问题", keywords: ["accurate", "accuracy", "speaker", "transcribe", "transcription", "wrong"] },
  { category: "用户体验问题", keywords: ["ux", "experience", "hard", "difficult", "confusing", "delay", "can't", "cannot"] },
  { category: "功能反馈", keywords: ["feature", "export", "folder", "calendar", "summary", "ai", "record", "search"] },
  { category: "用户诉求", keywords: ["wish", "hope", "need", "would be great", "please", "should"] }
];

export function classifyReview(content: string, rating: number | null | undefined) {
  const text = content.toLowerCase();
  const categories = new Set<ReviewCategory>();

  if (typeof rating === "number") {
    categories.add(rating >= 4 ? "好评" : rating <= 2 ? "差评" : "其他");
  }

  for (const group of keywordGroups) {
    if (group.keywords.some((keyword) => text.includes(keyword))) {
      categories.add(group.category);
    }
  }

  if (categories.size === 0) {
    categories.add("其他");
  }

  const sentiment = typeof rating === "number" ? (rating >= 4 ? "positive" : rating <= 2 ? "negative" : "neutral") : "neutral";
  return {
    sentiment,
    categories: Array.from(categories)
  };
}

export function countCategories(reviews: Array<{ categories: string | null }>) {
  const counts: Record<string, number> = {};
  for (const review of reviews) {
    const categories = review.categories ? review.categories.split(",").map((item) => item.trim()) : ["其他"];
    for (const category of categories) {
      counts[category] = (counts[category] ?? 0) + 1;
    }
  }
  return counts;
}

export function extractKeywords(texts: string[], limit = 16) {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "that",
    "this",
    "with",
    "you",
    "app",
    "are",
    "but",
    "have",
    "has",
    "was",
    "not",
    "all",
    "can",
    "use",
    "using",
    "from",
    "its",
    "it's",
    "very"
  ]);
  const counts = new Map<string, number>();

  texts
    .join(" ")
    .toLowerCase()
    .match(/[a-z][a-z'-]{2,}/g)
    ?.forEach((word) => {
      if (!stopWords.has(word)) {
        counts.set(word, (counts.get(word) ?? 0) + 1);
      }
    });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([keyword, count]) => ({ keyword, count }));
}

