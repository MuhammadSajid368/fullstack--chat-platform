-- Admin & Moderation: global roles, suspension, reports, audit actions.

CREATE TYPE "GlobalRole" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN');

CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED');

CREATE TYPE "ReportTargetType" AS ENUM ('USER', 'MESSAGE', 'CONVERSATION', 'GROUP');

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'USER_SUSPEND';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'USER_UNSUSPEND';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'USER_SOFT_DELETE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'USER_RESTORE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'USER_FORCE_LOGOUT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ADMIN_CONVERSATION_DELETE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ADMIN_CONVERSATION_RESTORE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ADMIN_CONVERSATION_ARCHIVE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ADMIN_GROUP_DELETE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ADMIN_GROUP_RESTORE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ADMIN_MESSAGE_DELETE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ADMIN_MESSAGE_RESTORE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REPORT_CREATE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REPORT_REVIEW';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REPORT_RESOLVE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REPORT_DISMISS';

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "globalRole" "GlobalRole" NOT NULL DEFAULT 'USER',
  ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "users_suspendedAt_idx" ON "users"("suspendedAt");
CREATE INDEX IF NOT EXISTS "users_globalRole_idx" ON "users"("globalRole");

CREATE TABLE IF NOT EXISTS "reports" (
  "id" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "targetType" "ReportTargetType" NOT NULL,
  "targetId" VARCHAR(64) NOT NULL,
  "reason" VARCHAR(200) NOT NULL,
  "details" VARCHAR(2000),
  "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
  "reviewerId" TEXT,
  "resolution" VARCHAR(2000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "reports_status_createdAt_idx" ON "reports"("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "reports_targetType_targetId_idx" ON "reports"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "reports_reporterId_createdAt_idx" ON "reports"("reporterId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "reports_reviewerId_idx" ON "reports"("reviewerId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reports_reporterId_fkey'
  ) THEN
    ALTER TABLE "reports"
      ADD CONSTRAINT "reports_reporterId_fkey"
      FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reports_reviewerId_fkey'
  ) THEN
    ALTER TABLE "reports"
      ADD CONSTRAINT "reports_reviewerId_fkey"
      FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
