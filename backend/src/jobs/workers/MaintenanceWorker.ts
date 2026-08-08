import type { Logger } from "pino";
import type { IdempotencyStore } from "@jobs/IdempotencyStore.js";
import type { QueueManager } from "@jobs/QueueManager.js";
import { JobNames, QueueNames, type JobName } from "@jobs/types.js";
import { BaseWorker, type JobHandler } from "@jobs/workers/BaseWorker.js";

/**
 * Maintenance worker — audit / session / attachment cleanup schedules.
 * Bulk purge APIs live in domain modules later; handlers stay idempotent no-ops.
 */
export class MaintenanceWorker extends BaseWorker {
  constructor(
    queues: QueueManager,
    idempotency: IdempotencyStore,
    logger: Logger
  ) {
    super(
      QueueNames.MAINTENANCE,
      "maintenance-worker",
      queues,
      idempotency,
      logger
    );
  }

  protected handlers(): Partial<Record<JobName, JobHandler>> {
    return {
      [JobNames.AUDIT_CLEANUP]: async () => {
        this.logger.debug("audit.cleanup (no-op placeholder)");
      },
      [JobNames.SESSION_CLEANUP]: async () => {
        this.logger.debug("session.cleanup (no-op placeholder)");
      },
      [JobNames.ATTACHMENT_CLEANUP]: async () => {
        this.logger.debug("attachment.cleanup (no-op placeholder)");
      },
    };
  }
}
