-- CreateTable
CREATE TABLE "CommunityItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "author" TEXT,
    "score" INTEGER,
    "commentCount" INTEGER,
    "publishedAt" DATETIME,
    "sourceUrl" TEXT,
    "searchQuery" TEXT,
    "relatedProducts" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ResearchTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CommunityItem_taskId_idx" ON "CommunityItem"("taskId");

-- CreateIndex
CREATE INDEX "CommunityItem_platform_idx" ON "CommunityItem"("platform");

-- CreateIndex
CREATE INDEX "CommunityItem_itemType_idx" ON "CommunityItem"("itemType");
