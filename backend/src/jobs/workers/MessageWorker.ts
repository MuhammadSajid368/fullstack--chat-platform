import type { Logger } from "pino";
import type { IEventPublisher } from "@websocket/EventPublisher.js";
import {
  RealtimeEvents,
  conversationRoom,
  userRoom,
} from "@websocket/events.js";
import type { IdempotencyStore } from "@jobs/IdempotencyStore.js";
import type { QueueManager } from "@jobs/QueueManager.js";
import { JobNames, QueueNames, type JobName } from "@jobs/types.js";
import { BaseWorker, type JobHandler } from "@jobs/workers/BaseWorker.js";

/**
 * Message queue worker — delivery receipts, retry orchestration, expire sweeps.
 * Does not rewrite MessageService business rules.
 */
export class MessageWorker extends BaseWorker {
  constructor(
    queues: QueueManager,
    idempotency: IdempotencyStore,
    logger: Logger,
    private readonly events: IEventPublisher
  ) {
    super(QueueNames.MESSAGE, "message-worker", queues, idempotency, logger);
  }

  protected handlers(): Partial<Record<JobName, JobHandler>> {
    return {
      [JobNames.MESSAGE_DELIVERY]: async (job) => {
        const messageId = String(job.data.messageId ?? "");
        const conversationId = String(job.data.conversationId ?? "");
        const senderId = String(job.data.senderId ?? "");
        if (!messageId) {
          return;
        }
        // Future: persist delivery receipts via Messages service.
        const rooms = [
          ...(conversationId ? [conversationRoom(conversationId)] : []),
          ...(senderId ? [userRoom(senderId)] : []),
        ];
        this.events.publish({
          name: RealtimeEvents.MESSAGE_DELIVERED,
          rooms,
          payload: {
            messageId,
            conversationId,
            deliveredAt: new Date().toISOString(),
          },
        });
      },
      [JobNames.MESSAGE_RETRY]: async (job) => {
        // Orchestration only — HTTP/retry path already ran MessageService.retry.
        // Job exists for delayed / fan-out follow-up work.
        this.logger.info(
          { messageId: job.data.messageId },
          "message.retry job acknowledged"
        );
      },
      [JobNames.MESSAGE_EXPIRE]: async () => {
        // Placeholder: ephemeral message expiry when feature is enabled.
        this.logger.debug("message.expire sweep (no-op placeholder)");
      },
    };
  }
}
