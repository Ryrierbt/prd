-- CreateTable
CREATE TABLE "ResearchTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appName" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "appStoreUrl" TEXT,
    "googlePlayUrl" TEXT,
    "keywords" TEXT,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "currentStep" TEXT NOT NULL DEFAULT '等待开始',
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "fetchedAt" DATETIME,
    "rawContent" TEXT,
    "errorMessage" TEXT,
    CONSTRAINT "Source_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ResearchTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "summary" TEXT,
    "positioning" TEXT,
    "targetUsers" TEXT,
    "useCases" TEXT,
    "platforms" TEXT,
    "features" TEXT,
    CONSTRAINT "AppProfile_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ResearchTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PricingPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originalPrice" TEXT,
    "currency" TEXT,
    "billingPeriod" TEXT,
    "description" TEXT,
    "features" TEXT,
    "sourceUrl" TEXT,
    "fetchedAt" DATETIME,
    CONSTRAINT "PricingPlan_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ResearchTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "rating" INTEGER,
    "author" TEXT,
    "publishedAt" DATETIME,
    "sourceUrl" TEXT,
    "sentiment" TEXT,
    "categories" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Review_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ResearchTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PromotionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "targetAudience" TEXT,
    "useCase" TEXT,
    "sellingPoints" TEXT,
    "sourceUrl" TEXT,
    "publishedAt" DATETIME,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromotionItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ResearchTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnalysisResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "analysisType" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalysisResult_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ResearchTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "htmlContent" TEXT NOT NULL,
    "filePath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Report_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ResearchTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ResearchTask_createdAt_idx" ON "ResearchTask"("createdAt");

-- CreateIndex
CREATE INDEX "ResearchTask_status_idx" ON "ResearchTask"("status");

-- CreateIndex
CREATE INDEX "Source_taskId_idx" ON "Source"("taskId");

-- CreateIndex
CREATE INDEX "Source_sourceType_idx" ON "Source"("sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "AppProfile_taskId_key" ON "AppProfile"("taskId");

-- CreateIndex
CREATE INDEX "PricingPlan_taskId_idx" ON "PricingPlan"("taskId");

-- CreateIndex
CREATE INDEX "Review_taskId_idx" ON "Review"("taskId");

-- CreateIndex
CREATE INDEX "Review_platform_idx" ON "Review"("platform");

-- CreateIndex
CREATE INDEX "PromotionItem_taskId_idx" ON "PromotionItem"("taskId");

-- CreateIndex
CREATE INDEX "AnalysisResult_taskId_idx" ON "AnalysisResult"("taskId");

-- CreateIndex
CREATE INDEX "AnalysisResult_analysisType_idx" ON "AnalysisResult"("analysisType");

-- CreateIndex
CREATE UNIQUE INDEX "Report_taskId_key" ON "Report"("taskId");
