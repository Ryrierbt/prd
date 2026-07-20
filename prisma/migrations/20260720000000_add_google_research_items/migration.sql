-- CreateTable
CREATE TABLE "GoogleResearchItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "source" TEXT,
    "publishedAt" TEXT,
    "snippet" TEXT,
    "content" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoogleResearchItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ResearchTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "GoogleResearchItem_taskId_idx" ON "GoogleResearchItem"("taskId");

-- CreateIndex
CREATE INDEX "GoogleResearchItem_dimension_idx" ON "GoogleResearchItem"("dimension");
