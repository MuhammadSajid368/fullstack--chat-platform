import type { Logger } from "pino";
import type { IdempotencyStore } from "@jobs/IdempotencyStore.js";
import type { QueueManager } from "@jobs/QueueManager.js";
import { JobNames, QueueNames, type JobName } from "@jobs/types.js";
import { BaseWorker, type JobHandler } from "@jobs/workers/BaseWorker.js";
import type { INotificationService } from "@modules/notifications/interfaces/INotificationService.js";
import type {
  CreateNotificationJobInput,
  NotificationJobKind,
} from "@modules/notifications/dto/NotificationDto.js";

/**
 * Notification worker — persists in-app notifications via NotificationService.
 * Push/email/SMS remain provider hooks inside the service (no-op).
 */
export class NotificationWorker extends BaseWorker {
  constructor(
    queues: QueueManager,
    idempotency: IdempotencyStore,
    logger: Logger,
    private readonly notifications: INotificationService
  ) {
    super(
      QueueNames.NOTIFICATION,
      "notification-worker",
      queues,
      idempotency,
      logger
    );
  }

  protected handlers(): Partial<Record<JobName, JobHandler>> {
    return {
      [JobNames.NOTIFICATION_CREATE]: async (job) => {
        const started = Date.now();
        const input = this.toJobInput(job.data);
        if (!input) {
          this.logger.warn(
            { jobId: job.id },
            "notification.create missing kind — skipping"
          );
          return;
        }
        const created = await this.notifications.processJob(input);
        this.logger.info(
          {
            kind: input.kind,
            created: created.length,
            durationMs: Date.now() - started,
          },
          "Notification delivered"
        );
      },
      [JobNames.NOTIFICATION_PUSH]: async () => {
        this.logger.debug(
          "notification.push skipped (provider not configured)"
        );
      },
      [JobNames.NOTIFICATION_EMAIL]: async () => {
        this.logger.debug(
          "notification.email skipped (provider not configured)"
        );
      },
      [JobNames.NOTIFICATION_CLEANUP]: async () => {
        this.logger.debug("notification.cleanup sweep (no-op placeholder)");
      },
    };
  }

  private toJobInput(
    data: Record<string, unknown>
  ): CreateNotificationJobInput | null {
    const kind = data.kind;
    if (typeof kind !== "string") {
      return null;
    }
    return {
      kind: kind as NotificationJobKind,
      messageId:
        typeof data.messageId === "string" ? data.messageId : undefined,
      conversationId:
        typeof data.conversationId === "string"
          ? data.conversationId
          : undefined,
      actorUserId:
        typeof data.actorUserId === "string" ? data.actorUserId : undefined,
      targetUserId:
        typeof data.targetUserId === "string" ? data.targetUserId : undefined,
      attachmentId:
        typeof data.attachmentId === "string" ? data.attachmentId : undefined,
      role: typeof data.role === "string" ? data.role : undefined,
      fromUserId:
        typeof data.fromUserId === "string" ? data.fromUserId : undefined,
      toUserId: typeof data.toUserId === "string" ? data.toUserId : undefined,
      title: typeof data.title === "string" ? data.title : undefined,
      body: typeof data.body === "string" ? data.body : undefined,
      recipientUserIds: Array.isArray(data.recipientUserIds)
        ? data.recipientUserIds.filter(
            (id): id is string => typeof id === "string"
          )
        : undefined,
    };
  }
}
