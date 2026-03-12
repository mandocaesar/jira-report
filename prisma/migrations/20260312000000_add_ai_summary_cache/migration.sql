-- CreateTable
CREATE TABLE "AiSummaryCache" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sprintId" INTEGER NOT NULL DEFAULT 0,
    "boardId" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSummaryCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiSummaryCache_type_sprintId_idx" ON "AiSummaryCache"("type", "sprintId");

-- CreateIndex
CREATE INDEX "AiSummaryCache_type_boardId_idx" ON "AiSummaryCache"("type", "boardId");

-- CreateIndex
CREATE UNIQUE INDEX "type_sprintId_boardId" ON "AiSummaryCache"("type", "sprintId", "boardId");
