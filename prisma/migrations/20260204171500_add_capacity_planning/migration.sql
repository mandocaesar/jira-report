-- AlterTable
ALTER TABLE "SprintMetrics" ADD COLUMN     "actualCapacity" INTEGER,
ADD COLUMN     "forecastedCapacity" INTEGER,
ADD COLUMN     "forecastedPoints" INTEGER;

-- CreateTable
CREATE TABLE "EngineerCapacity" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 100,
    "reason" TEXT NOT NULL DEFAULT 'other',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngineerCapacity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EngineerCapacity_accountId_idx" ON "EngineerCapacity"("accountId");

-- CreateIndex
CREATE INDEX "EngineerCapacity_startDate_endDate_idx" ON "EngineerCapacity"("startDate", "endDate");
