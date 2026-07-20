import { z } from "zod";

export const PlatformSchema = z.enum(["youtube", "reddit", "tiktok"]);
export type Platform = z.infer<typeof PlatformSchema>;
const publicUrl = z.url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "Only HTTP(S) URLs are allowed");

export const BrowserConfigSchema = z.object({
  mode: z.enum(["isolated", "existing"]).default("isolated"),
  connection: z.enum(["auto", "cdp"]).default("auto"),
  cdpEndpoint: z.union([z.number().int().min(1).max(65535), z.string().min(1)]).optional(),
  reuseOpenPages: z.boolean().default(true),
  preserveExistingBrowser: z.boolean().default(true)
}).superRefine((value, ctx) => {
  if (value.mode === "existing" && value.connection === "cdp" && value.cdpEndpoint === undefined) {
    ctx.addIssue({ code: "custom", path: ["cdpEndpoint"], message: "cdpEndpoint is required for existing CDP mode" });
  }
});
export type BrowserConfig = z.infer<typeof BrowserConfigSchema>;

export const InputSchema = z.object({
  appName: z.string().trim().min(1),
  officialWebsite: publicUrl,
  country: z.string().trim().min(2).max(8),
  language: z.string().trim().min(2).max(16),
  platforms: z.array(PlatformSchema).min(1).transform((xs) => [...new Set(xs)]),
  maxItemsPerPlatform: z.number().int().min(1).max(5).default(5),
  maxCommentsPerItem: z.number().int().min(1).max(10).default(10),
  browser: BrowserConfigSchema.default({
    mode: "isolated",
    connection: "auto",
    reuseOpenPages: true,
    preserveExistingBrowser: true
  })
});
export type CollectionInput = z.input<typeof InputSchema>;
export type ValidatedInput = z.output<typeof InputSchema>;

const nullableString = z.string().nullable();
const nullableNumber = z.number().nonnegative().nullable();

const OfficialWebsitePageSchema = z.object({
  url: publicUrl,
  label: z.string(),
  title: nullableString,
  description: nullableString,
  textSnippet: z.string(),
  sellingPoints: z.array(z.string()),
  targetAudience: z.array(z.string()),
  useCases: z.array(z.string()),
  collectedAt: z.string().datetime()
});

const PricingPlanSchema = z.object({
  name: z.string(),
  monthlyPrice: nullableString,
  annualPrice: nullableString,
  currency: nullableString,
  billingPeriod: nullableString,
  features: z.array(z.string()),
  sourceUrl: publicUrl,
  collectedAt: z.string().datetime()
});

const OfficialPromotionSchema = z.object({
  title: nullableString,
  content: z.string(),
  targetAudience: z.array(z.string()),
  useCases: z.array(z.string()),
  sellingPoints: z.array(z.string()),
  sourceUrl: publicUrl,
  collectedAt: z.string().datetime()
});

export const WebsiteSchema = z.object({
  officialProductName: nullableString,
  brandAliases: z.array(z.string()),
  positioning: nullableString,
  categories: z.array(z.string()),
  targetUsers: z.array(z.string()),
  coreFeatures: z.array(z.string()),
  useCases: z.array(z.string()),
  supportedPlatforms: z.array(z.string()),
  pricingModel: nullableString,
  keySellingPoints: z.array(z.string()),
  mentionedCompetitorsOrAlternatives: z.array(z.string()),
  officialWebsiteUrl: publicUrl,
  collectedAt: z.string().datetime(),
  rawPageText: z.string(),
  officialPages: z.array(OfficialWebsitePageSchema).default([]),
  pricingPlans: z.array(PricingPlanSchema).default([]),
  officialPromotions: z.array(OfficialPromotionSchema).default([]),
  screenshotPath: z.string()
});
export type WebsiteData = z.infer<typeof WebsiteSchema>;

export const SearchIntentSchema = z.enum(["review_experience", "problems_pricing_alternatives", "comparison"]);
export const SearchQuerySchema = z.object({
  query: z.string().min(2),
  platform: PlatformSchema,
  intent: SearchIntentSchema,
  reason: z.string().min(2),
  expectedData: z.string().min(2),
  generatedAt: z.string().datetime()
});
export const SearchPlanSchema = z.object({
  youtube: z.array(SearchQuerySchema).length(5),
  reddit: z.array(SearchQuerySchema).length(5),
  tiktok: z.array(SearchQuerySchema).length(5)
});
export type SearchPlan = z.infer<typeof SearchPlanSchema>;

export const CandidateSchema = z.object({
  platform: PlatformSchema,
  externalId: z.string().min(1),
  title: z.string(),
  author: nullableString,
  publishedAt: nullableString,
  visibleEngagement: nullableString,
  viewCount: nullableNumber,
  likeCount: nullableNumber,
  commentCount: nullableNumber,
  shareCount: nullableNumber.optional().default(null),
  score: nullableNumber.optional().default(null),
  duration: nullableString,
  snippet: nullableString,
  sourceUrl: publicUrl,
  thumbnailUrl: publicUrl.nullable(),
  matchedQuery: z.string(),
  matchedQueries: z.array(z.string()).optional(),
  searchGroupIndex: z.number().int().nonnegative().optional(),
  searchGroupQuery: z.string().optional(),
  searchPosition: z.number().int().positive(),
  collectedAt: z.string().datetime(),
  scoring: z.object({
    relevance: z.number().min(0).max(40),
    recency: z.number().min(0).max(20),
    engagement: z.number().min(0).max(20),
    titleValue: z.number().min(0).max(15),
    sourceCredibility: z.number().min(0).max(5),
    total: z.number().min(0).max(100),
    reasons: z.array(z.string()),
    retainedDespiteAge: z.string().nullable()
  }).optional()
});
export type Candidate = z.infer<typeof CandidateSchema>;

const SupplementalEvidenceSchema = z.object({
  youtubeCaptions: z.object({
    captionTrackUrl: publicUrl.nullable(),
    captionLanguage: nullableString,
    captionText: nullableString,
    reason: nullableString,
    collectedAt: z.string().datetime()
  }).nullable().optional()
}).optional();

const EvidenceAnalysisSchema = z.object({
  detail: z.object({
    extractedFacts: z.array(z.string()).max(12),
    summary: nullableString
  }),
  poster: z.object({
    available: z.boolean(),
    viewpoint: nullableString,
    extractedFacts: z.array(z.string()).max(12),
    summary: nullableString
  }).optional(),
  captions: z.object({
    available: z.boolean(),
    extractedFacts: z.array(z.string()).max(12),
    summary: nullableString
  })
});

const ItemBaseSchema = z.object({
  platform: PlatformSchema,
  externalId: z.string(),
  title: nullableString,
  author: nullableString,
  publishedAt: nullableString,
  description: nullableString,
  viewCount: nullableNumber,
  likeCount: nullableNumber,
  commentCount: nullableNumber,
  shareCount: nullableNumber,
  duration: nullableString,
  tags: z.array(z.string()),
  sourceUrl: publicUrl,
  thumbnailUrl: publicUrl.nullable(),
  relatedLinks: z.array(publicUrl),
  subreddit: nullableString,
  postScore: nullableNumber,
  flair: nullableString,
  body: nullableString,
  collectionDecision: z.object({
    shouldCollect: z.boolean(),
    relevanceScore: z.number().min(0).max(40),
    reason: z.string(),
    evidence: z.array(z.string()),
    evidenceAnalysis: EvidenceAnalysisSchema.optional(),
    selectedComments: z.array(z.object({
      commentId: z.string(),
      valueScore: z.number().min(0).max(100),
      selectedReasons: z.array(z.string()),
      matchedThemes: z.array(z.string()),
      sentiment: z.enum(["positive", "negative", "neutral", "alternative"])
    })).optional()
  }).optional(),
  supplementalEvidence: SupplementalEvidenceSchema,
  collectedAt: z.string().datetime()
});
export const ItemSchema = ItemBaseSchema.superRefine((value, ctx) => {
  if (!value.externalId) ctx.addIssue({ code: "custom", message: "externalId is required" });
});
export type CollectedItem = z.infer<typeof ItemSchema>;

export const CommentSchema = z.object({
  commentId: z.string().min(1),
  author: nullableString,
  content: z.string(),
  publishedAt: nullableString,
  likeCount: nullableNumber,
  replyCount: nullableNumber,
  commentUrl: publicUrl.nullable(),
  parentCommentId: nullableString,
  sentiment: z.enum(["positive", "negative", "neutral", "alternative"]).default("neutral"),
  valueScore: z.number().min(0).max(100).optional(),
  selectedReasons: z.array(z.string()).default([]),
  matchedThemes: z.array(z.string()).default([]),
  collectedAt: z.string().datetime()
});
export type Comment = z.infer<typeof CommentSchema>;

export const PlatformStatusSchema = z.object({
  status: z.enum(["completed", "partial", "blocked", "failed"]),
  candidateCount: z.number().int().nonnegative(),
  selectedCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
  reasonCode: z.string().optional(),
  reason: z.string().optional()
});
export const RunSummarySchema = z.object({
  runId: z.string(),
  appName: z.string(),
  status: z.enum(["completed", "partial", "failed"]),
  platforms: z.partialRecord(PlatformSchema, PlatformStatusSchema),
  deepSeekUsage: z.object({
    requestCount: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative()
  }),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime()
});
export type RunSummary = z.infer<typeof RunSummarySchema>;
