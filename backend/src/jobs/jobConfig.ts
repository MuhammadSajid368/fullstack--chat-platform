/**
 * Job runtime configuration (defaults; optional env overrides).
 * Kept separate from AppConfig so existing test env objects stay valid.
 */

export type JobConfig = {
  enabled: boolean;
  prefix: string;
  maxAttempts: number;
  backoffMs: number;
  /** Worker concurrency per queue. */
  concurrency: number;
  /** Idempotency key TTL in seconds. */
  idempotencyTtlSec: number;
  /** Repeatable job schedules (cron). */
  schedules: {
    presenceCleanup: string;
    sessionCleanup: string;
    auditCleanup: string;
    attachmentCleanup: string;
    notificationCleanup: string;
    messageExpire: string;
    unreadReconcile: string;
    lastMessageRepair: string;
  };
};

export function loadJobConfig(
  raw: NodeJS.ProcessEnv = process.env
): JobConfig {
  const maxAttempts = Number(raw.JOBS_MAX_ATTEMPTS ?? 5);
  const backoffMs = Number(raw.JOBS_BACKOFF_MS ?? 1_000);
  const concurrency = Number(raw.JOBS_CONCURRENCY ?? 5);

  return {
    enabled: raw.JOBS_ENABLED !== "false",
    prefix: raw.JOBS_PREFIX ?? "chat",
    maxAttempts: Number.isFinite(maxAttempts) && maxAttempts > 0 ? maxAttempts : 5,
    backoffMs: Number.isFinite(backoffMs) && backoffMs > 0 ? backoffMs : 1_000,
    concurrency:
      Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 5,
    idempotencyTtlSec: Number(raw.JOBS_IDEMPOTENCY_TTL_SEC ?? 86_400) || 86_400,
    schedules: {
      presenceCleanup: raw.JOBS_CRON_PRESENCE_CLEANUP ?? "*/5 * * * *",
      sessionCleanup: raw.JOBS_CRON_SESSION_CLEANUP ?? "0 * * * *",
      auditCleanup: raw.JOBS_CRON_AUDIT_CLEANUP ?? "15 3 * * *",
      attachmentCleanup: raw.JOBS_CRON_ATTACHMENT_CLEANUP ?? "30 3 * * *",
      notificationCleanup: raw.JOBS_CRON_NOTIFICATION_CLEANUP ?? "0 4 * * *",
      messageExpire: raw.JOBS_CRON_MESSAGE_EXPIRE ?? "*/15 * * * *",
      unreadReconcile: raw.JOBS_CRON_UNREAD_RECONCILE ?? "*/10 * * * *",
      lastMessageRepair: raw.JOBS_CRON_LAST_MESSAGE_REPAIR ?? "*/30 * * * *",
    },
  };
}

export function defaultJobOptions(config: JobConfig) {
  return {
    attempts: config.maxAttempts,
    backoff: {
      type: "exponential" as const,
      delay: config.backoffMs,
    },
    removeOnComplete: { count: 1_000 },
    removeOnFail: { count: 5_000 },
  };
}
