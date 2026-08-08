import type { Logger } from "pino";
import type { Container } from "@container/container.js";
import type { AppConfig } from "@config/index.js";
import { TOKENS } from "@shared/constants/tokens.js";
import type { IPresenceService } from "@modules/presence/interfaces/IPresenceService.js";
import type { INotificationService } from "@modules/notifications/interfaces/INotificationService.js";
import type { EventPublisher } from "@websocket/EventPublisher.js";
import { loadJobConfig } from "@jobs/jobConfig.js";
import { IdempotencyStore } from "@jobs/IdempotencyStore.js";
import { JobDispatcher } from "@jobs/JobDispatcher.js";
import { QueueManager } from "@jobs/QueueManager.js";
import { WorkerRegistry } from "@jobs/WorkerRegistry.js";
import type { QueueHealthReport } from "@jobs/QueueManager.js";

export type JobSchedulerHandle = {
  queueManager: QueueManager;
  stop(): Promise<void>;
};

export type QueueHealthProvider = {
  getHealth(): Promise<QueueHealthReport | null>;
};

/**
 * Boots BullMQ queues, workers, repeatable schedules, and EventPublisher outbox.
 * Disabled in test env and when JOBS_ENABLED=false.
 */
export async function initJobScheduler(
  container: Container,
  logger: Logger
): Promise<JobSchedulerHandle | null> {
  const config = container.resolve<AppConfig>(TOKENS.Config);
  const jobConfig = loadJobConfig();

  if (config.isTest || !jobConfig.enabled) {
    logger.info(
      { isTest: config.isTest, enabled: jobConfig.enabled },
      "Job scheduler disabled"
    );
    container.registerValue<QueueHealthProvider>(TOKENS.QueueHealthProvider, {
      getHealth: async () => null,
    });
    return null;
  }

  const queueManager = new QueueManager(
    config.redisUrl,
    jobConfig,
    logger
  );

  try {
    await queueManager.start();
  } catch (err) {
    logger.error(
      {
        err,
        hint: "BullMQ requires Redis >= 5. In-app message notifications still work via MessageService sync fan-out.",
      },
      "Failed to start QueueManager — jobs disabled"
    );
    container.registerValue<QueueHealthProvider>(TOKENS.QueueHealthProvider, {
      getHealth: async () => null,
    });
    return null;
  }

  const idempotency = new IdempotencyStore(
    queueManager.getConnection(),
    logger,
    jobConfig.idempotencyTtlSec
  );

  const events = container.resolve<EventPublisher>(TOKENS.EventPublisher);
  const dispatcher = new JobDispatcher(events, queueManager, logger);
  dispatcher.start();

  const registry = new WorkerRegistry({
    queues: queueManager,
    idempotency,
    logger,
    events,
    presenceService: container.resolve<IPresenceService>(TOKENS.PresenceService),
    notificationService: container.resolve<INotificationService>(
      TOKENS.NotificationService
    ),
  });
  registry.start();

  await queueManager.scheduleRepeatableJobs();

  container.registerValue(TOKENS.QueueManager, queueManager);
  container.registerValue<QueueHealthProvider>(TOKENS.QueueHealthProvider, {
    getHealth: () => queueManager.getHealth(),
  });

  logger.info("Job scheduler ready");

  return {
    queueManager,
    stop: async () => {
      dispatcher.stop();
      await registry.stop();
      await queueManager.close();
      container.registerValue<QueueHealthProvider>(TOKENS.QueueHealthProvider, {
        getHealth: async () => null,
      });
      logger.info("Job scheduler stopped");
    },
  };
}

export { QueueManager } from "./QueueManager.js";
export { WorkerRegistry } from "./WorkerRegistry.js";
export { JobDispatcher } from "./JobDispatcher.js";
export { JobNames, QueueNames } from "./types.js";
export { loadJobConfig } from "./jobConfig.js";
