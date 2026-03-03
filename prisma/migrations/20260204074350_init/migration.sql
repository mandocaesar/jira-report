-- CreateTable
CREATE TABLE "SprintLeave" (
    "id" TEXT NOT NULL,
    "sprintId" INTEGER NOT NULL,
    "accountId" TEXT NOT NULL,
    "leaveDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SprintLeave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SprintMetrics" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "boardId" INTEGER NOT NULL,
    "sprintId" INTEGER NOT NULL,
    "sprintName" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "workingDays" INTEGER NOT NULL,
    "totalLeave" INTEGER NOT NULL,
    "engineerCount" INTEGER NOT NULL,
    "qaCount" INTEGER NOT NULL,
    "engineerMandays" INTEGER NOT NULL,
    "qaMandays" INTEGER NOT NULL,
    "totalStoryPoints" INTEGER NOT NULL,
    "completedPoints" INTEGER NOT NULL,
    "averageUtilization" DOUBLE PRECISION NOT NULL,
    "productPoints" INTEGER NOT NULL DEFAULT 0,
    "techInitPoints" INTEGER NOT NULL DEFAULT 0,
    "incidentPoints" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SprintMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SprintLeave_sprintId_idx" ON "SprintLeave"("sprintId");

-- CreateIndex
CREATE INDEX "SprintLeave_accountId_idx" ON "SprintLeave"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "SprintLeave_sprintId_accountId_key" ON "SprintLeave"("sprintId", "accountId");

-- CreateIndex
CREATE INDEX "SprintMetrics_teamId_idx" ON "SprintMetrics"("teamId");

-- CreateIndex
CREATE INDEX "SprintMetrics_boardId_idx" ON "SprintMetrics"("boardId");

-- CreateIndex
CREATE INDEX "SprintMetrics_sprintId_idx" ON "SprintMetrics"("sprintId");

-- CreateIndex
CREATE UNIQUE INDEX "SprintMetrics_teamId_sprintId_key" ON "SprintMetrics"("teamId", "sprintId");
