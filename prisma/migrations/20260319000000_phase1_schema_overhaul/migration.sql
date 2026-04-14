-- Phase 1: Schema Overhaul — Engineering Performance Tracker
-- Extends Team with code/isActive, TeamMember with NIK/gender
-- Adds: CapacityAllocation, NonDevDay, Holiday, DataSource, JiraConnection, WorkTypeLabel, Leave

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "code" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "TeamMember" ADD COLUMN     "gender" TEXT,
ADD COLUMN     "nik" TEXT;

-- CreateTable
CREATE TABLE "CapacityAllocation" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SPRINT',
    "teamMemberId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "sprintId" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "capacityPercent" INTEGER NOT NULL DEFAULT 100,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapacityAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NonDevDay" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "sprintId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NonDevDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "boardId" INTEGER NOT NULL,
    "jqlQuery" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "fetchWorklogs" BOOLEAN NOT NULL DEFAULT true,
    "teamId" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncMessage" TEXT,
    "lastSyncStatus" TEXT NOT NULL DEFAULT 'NEVER',
    "issueCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JiraConnection" (
    "id" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "apiToken" TEXT NOT NULL,
    "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "syncSchedule" TEXT NOT NULL DEFAULT '15min',
    "lastTestedAt" TIMESTAMP(3),
    "connectionStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JiraConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkTypeLabel" (
    "id" TEXT NOT NULL,
    "labelName" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkTypeLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Leave" (
    "id" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'annual',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Leave_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CapacityAllocation_teamMemberId_idx" ON "CapacityAllocation"("teamMemberId");
CREATE INDEX "CapacityAllocation_teamId_idx" ON "CapacityAllocation"("teamId");
CREATE INDEX "CapacityAllocation_sprintId_idx" ON "CapacityAllocation"("sprintId");
CREATE INDEX "CapacityAllocation_startDate_endDate_idx" ON "CapacityAllocation"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "NonDevDay_teamId_sprintId_idx" ON "NonDevDay"("teamId", "sprintId");
CREATE UNIQUE INDEX "NonDevDay_teamId_sprintId_date_key" ON "NonDevDay"("teamId", "sprintId", "date");

-- CreateIndex
CREATE INDEX "Holiday_year_idx" ON "Holiday"("year");
CREATE INDEX "Holiday_isActive_year_idx" ON "Holiday"("isActive", "year");
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");

-- CreateIndex
CREATE INDEX "DataSource_teamId_idx" ON "DataSource"("teamId");
CREATE INDEX "DataSource_boardId_idx" ON "DataSource"("boardId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkTypeLabel_labelName_key" ON "WorkTypeLabel"("labelName");

-- CreateIndex
CREATE INDEX "Leave_teamMemberId_idx" ON "Leave"("teamMemberId");
CREATE INDEX "Leave_startDate_endDate_idx" ON "Leave"("startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "Team_code_key" ON "Team"("code");
CREATE UNIQUE INDEX "TeamMember_nik_key" ON "TeamMember"("nik");
CREATE INDEX "TeamMember_nik_idx" ON "TeamMember"("nik");

-- AddForeignKey
ALTER TABLE "CapacityAllocation" ADD CONSTRAINT "CapacityAllocation_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapacityAllocation" ADD CONSTRAINT "CapacityAllocation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NonDevDay" ADD CONSTRAINT "NonDevDay_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataSource" ADD CONSTRAINT "DataSource_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Leave" ADD CONSTRAINT "Leave_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
