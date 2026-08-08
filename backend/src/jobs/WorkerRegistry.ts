import type { Logger } from "pino";
import type { IEventPublisher } from "@websocket/EventPublisher.js";
import type { IPresenceService } from "@modules/presence/interfaces/IPresenceService.js";
import type { INotificationService } from "@modules/notifications/interfaces/INotificationService.js";
import type { IdempotencyStore } from "@jobs/IdempotencyStore.js";
import type { QueueManager } from "@jobs/QueueManager.js";
import { MessageWorker } from "@jobs/workers/MessageWorker.js";
import { NotificationWorker } from "@jobs/workers/NotificationWorker.js";
import { UploadWorker } from "@jobs/workers/UploadWorker.js";
import { ConversationWorker } from "@jobs/workers/ConversationWorker.js";
import { PresenceWorker } from "@jobs/workers/PresenceWorker.js";
import { MaintenanceWorker } from "@jobs/workers/MaintenanceWorker.js";
import type { BaseWorker } from "@jobs/workers/BaseWorker.js";

export type WorkerRegistryDeps = {
  queues: QueueManager;
  idempotency: IdempotencyStore;
  logger: Logger;
  events: IEventPublisher;
  presenceService: IPresenceService;
  notificationService: INotificationService;
};

/**
 * Registers and starts all BullMQ workers. No Prisma.
 */
export class WorkerRegistry {
  private readonly workers: BaseWorker[] = [];

  constructor(private readonly deps: WorkerRegistryDeps) {}

  start(): void {
    const {
      queues,
      idempotency,
      logger,
      events,
      presenceService,
      notificationService,
    } = this.deps;

    this.workers.push(
      new MessageWorker(queues, idempotency, logger, events),
      new NotificationWorker(queues, idempotency, logger, notificationService),
      new UploadWorker(queues, idempotency, logger),
      new ConversationWorker(queues, idempotency, logger),
      new PresenceWorker(queues, idempotency, logger, presenceService),
      new MaintenanceWorker(queues, idempotency, logger)
    );

    for (const worker of this.workers) {
      worker.start();
    }

    logger.info(
      { count: this.workers.length },
      "WorkerRegistry started"
    );
  }

  async stop(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.stop()));
    this.workers.length = 0;
    this.deps.logger.info("WorkerRegistry stopped");
  }
}
