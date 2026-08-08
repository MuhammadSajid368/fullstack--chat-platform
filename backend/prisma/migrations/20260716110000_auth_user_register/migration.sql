-- Auth registration audit action.

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'USER_REGISTER';
