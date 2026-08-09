-- CreateTable
CREATE TABLE "SprintEmNote" (
    "id" TEXT NOT NULL,
    "boardId" INTEGER NOT NULL,
    "sprintId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "pic" TEXT,
    "highlights" TEXT,
    "carryOverReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SprintEmNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SprintEmNote_boardId_sprintId_idx" ON "SprintEmNote"("boardId", "sprintId");

-- CreateIndex
CREATE UNIQUE INDEX "SprintEmNote_boardId_sprintId_role_key" ON "SprintEmNote"("boardId", "sprintId", "role");
