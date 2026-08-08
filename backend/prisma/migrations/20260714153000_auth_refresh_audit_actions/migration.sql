-- AlterEnum: dedicated auth refresh audit actions
ALTER TYPE "AuditAction" ADD VALUE 'REFRESH_TOKEN_ROTATE';
ALTER TYPE "AuditAction" ADD VALUE 'REFRESH_TOKEN_REPLAY';
