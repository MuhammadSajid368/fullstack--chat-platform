-- Messages Phase M1 schema updates

ALTER TYPE "MessageType" ADD VALUE 'VOICE';
ALTER TYPE "MessageType" ADD VALUE 'VIDEO';
ALTER TYPE "MessageType" ADD VALUE 'LOCATION';
ALTER TYPE "MessageType" ADD VALUE 'CONTACT';
ALTER TYPE "MessageType" ADD VALUE 'STICKER';

ALTER TYPE "AuditAction" ADD VALUE 'MESSAGE_RETRY';

CREATE TYPE "VirusScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'SKIPPED', 'ERROR');

ALTER TABLE "attachments"
  ADD COLUMN "virusScanStatus" "VirusScanStatus" NOT NULL DEFAULT 'PENDING';

ALTER TABLE "attachments"
  ADD COLUMN "thumbnailKey" VARCHAR(512);

CREATE INDEX "attachments_status_virusScanStatus_idx"
  ON "attachments" ("status", "virusScanStatus");
