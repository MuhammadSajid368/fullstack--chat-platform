import type { Logger } from "pino";
import type { IPresenceService } from "@modules/presence/interfaces/IPresenceService.js";
import type { IdempotencyStore } from "@jobs/IdempotencyStore.js";
import type { QueueManager } from "@jobs/QueueManager.js";
import { JobNames, QueueNames, type JobName } from "@jobs/types.js";
import { BaseWorker, type JobHandler } from "@jobs/workers/BaseWorker.js";

/**
 * Presence worker — TTL cleanup + durable lastSeen persistence hooks.
 */
export class PresenceWorker extends BaseWorker {
  constructor(
    queues: QueueManager,
    idempotency: IdempotencyStore,
    logger: Logger,
    private readonly presenceService: IPresenceService
  ) {
    super(QueueNames.PRESENCE, "presence-worker", queues, idempotency, logger);
  }

  protected handlers(): Partial<Record<JobName, JobHandler>> {
    return {
      [JobNames.PRESENCE_CLEANUP]: async () => {
        const result = await this.presenceService.reconcileStalePresence();
        this.logger.info(result, "presence.cleanup sweep complete");
      },
      [JobNames.PRESENCE_LAST_SEEN]: async (job) => {
        const userId = String(job.data.userId ?? "");
        if (!userId) {
          return;
        }
        // PresenceService already wrote lastSeen on markOffline.
        // Job re-reads for repair / multi-node consistency checks.
        await this.presenceService.getMyPresence(userId);
      },
    };
  }
}
