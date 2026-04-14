-- Add squad sync fields for Jira board member discovery
ALTER TABLE "Team" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "Team" ADD COLUMN "lastSyncedAt" TIMESTAMP(3);
