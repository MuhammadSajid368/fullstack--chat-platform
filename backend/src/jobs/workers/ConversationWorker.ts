import type { Logger } from "pino";
import type { IdempotencyStore } from "@jobs/IdempotencyStore.js";
import type { QueueManager } from "@jobs/QueueManager.js";
import { JobNames, QueueNames, type JobName } from "@jobs/types.js";
import { BaseWorker, type JobHandler } from "@jobs/workers/BaseWorker.js";

/**
 * Conversation repair/reconcile worker — orchestration placeholders.
 * Unread/lastMessage mutations stay inside Conversation/Message services.
 */
export class ConversationWorker extends BaseWorker {
  constructor(
    queues: QueueManager,
    idempotency: IdempotencyStore,
    logger: Logger
  ) {
    super(
      QueueNames.CONVERSATION,
      "conversation-worker",
      queues,
      idempotency,
      logger
    );
  }

  protected handlers(): Partial<Record<JobName, JobHandler>> {
    return {
      [JobNames.CONVERSATION_UNREAD_RECONCILE]: async () => {
        // Future: call ConversationService repair helpers when exposed.
        this.logger.debug(
          "conversation.unreadReconcile (no-op — counters owned by Messages TX)"
        );
      },
      [JobNames.CONVERSATION_LAST_MESSAGE_REPAIR]: async () => {
        this.logger.debug(
          "conversation.lastMessageRepair (no-op placeholder)"
        );
      },
    };
  }
}
