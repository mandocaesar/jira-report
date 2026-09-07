-- CreateTable
CREATE TABLE "SprintSnapshot" (
    "id" TEXT NOT NULL,
    "boardId" INTEGER NOT NULL,
    "sprintId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SprintSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SprintSnapshot_boardId_sprintId_idx" ON "SprintSnapshot"("boardId", "sprintId");

-- CreateIndex
CREATE UNIQUE INDEX "SprintSnapshot_boardId_sprintId_kind_key" ON "SprintSnapshot"("boardId", "sprintId", "kind");
