import type { Logger } from "pino";
import type { IEventPublisher } from "@websocket/EventPublisher.js";
import type { RealtimeEvent } from "@websocket/events.js";
import { RealtimeEvents } from "@websocket/events.js";
import type { QueueManager } from "@jobs/QueueManager.js";
import { JobNames } from "@jobs/types.js";

/**
 * After-commit outbox bridge: EventPublisher → queues.
 * Never enqueues inside a DB transaction; services publish only after commit.
 */
export class JobDispatcher {
  private readonly listener = (event: RealtimeEvent): void => {
    void this.onEvent(event);
  };

  constructor(
    private readonly publisher: IEventPublisher & {
      bind(listener: (event: RealtimeEvent) => void): void;
      unbind(listener?: (event: RealtimeEvent) => void): void;
    },
    private readonly queues: QueueManager,
    private readonly logger: Logger
  ) {}

  start(): void {
    this.publisher.bind(this.listener);
    this.logger.info("JobDispatcher bound to EventPublisher");
  }

  stop(): void {
    this.publisher.unbind(this.listener);
  }

  private async enqueueNotification(
    payload: Record<string, unknown>,
    jobId: string
  ): Promise<void> {
    await this.queues.enqueue(
      JobNames.NOTIFICATION_CREATE,
      {
        ...payload,
        idempotencyKey: jobId,
      },
      { jobId }
    );
  }

  private async onEvent(event: RealtimeEvent): Promise<void> {
    try {
      switch (event.name) {
        case RealtimeEvents.MESSAGE_CREATED: {
          const messageId = String(
            (event.payload.message as { id?: string } | undefined)?.id ??
              event.payload.messageId ??
              ""
          );
          const conversationId = String(event.payload.conversationId ?? "");
          const senderId = String(
            (event.payload.message as { senderId?: string } | undefined)
              ?.senderId ??
              event.payload.senderId ??
              ""
          );
          if (!messageId) {
            return;
          }
          await this.queues.enqueue(
            JobNames.MESSAGE_DELIVERY,
            {
              messageId,
              conversationId,
              senderId: senderId || undefined,
              idempotencyKey: `message.delivery:${messageId}`,
            },
            { jobId: `message.delivery:${messageId}` }
          );
          await this.enqueueNotification(
            {
              kind: "message.created",
              messageId,
              conversationId,
              actorUserId: senderId || undefined,
            },
            `notification.create:message:${messageId}`
          );
          break;
        }
        case RealtimeEvents.MESSAGE_RETRY: {
          const messageId = String(
            (event.payload.message as { id?: string } | undefined)?.id ??
              event.payload.messageId ??
              ""
          );
          if (!messageId) {
            return;
          }
          await this.queues.enqueue(JobNames.MESSAGE_RETRY, {
            messageId,
            conversationId: event.payload.conversationId,
            idempotencyKey: `message.retry:${messageId}`,
          });
          break;
        }
        case RealtimeEvents.MESSAGE_REACTION: {
          const messageId = String(event.payload.messageId ?? "");
          const actorUserId = String(event.payload.actorUserId ?? "");
          const targetUserId = String(event.payload.targetUserId ?? "");
          if (!messageId || !actorUserId || !targetUserId) {
            return;
          }
          await this.enqueueNotification(
            {
              kind: "message.reaction",
              messageId,
              conversationId: event.payload.conversationId,
              actorUserId,
              targetUserId,
            },
            `notification.create:reaction:${messageId}:${actorUserId}:${targetUserId}`
          );
          break;
        }
        case RealtimeEvents.MEMBER_JOINED: {
          const conversationId = String(event.payload.conversationId ?? "");
          const targetUserId = String(event.payload.userId ?? "");
          if (!conversationId || !targetUserId) {
            return;
          }
          await this.enqueueNotification(
            {
              kind: "member.joined",
              conversationId,
              targetUserId,
              actorUserId:
                typeof event.payload.addedBy === "string"
                  ? event.payload.addedBy
                  : undefined,
            },
            `notification.create:member.joined:${conversationId}:${targetUserId}`
          );
          break;
        }
        case RealtimeEvents.MEMBER_REMOVED: {
          const conversationId = String(event.payload.conversationId ?? "");
          const targetUserId = String(event.payload.userId ?? "");
          if (!conversationId || !targetUserId) {
            return;
          }
          await this.enqueueNotification(
            {
              kind: "member.removed",
              conversationId,
              targetUserId,
              actorUserId:
                typeof event.payload.removedBy === "string"
                  ? event.payload.removedBy
                  : undefined,
            },
            `notification.create:member.removed:${conversationId}:${targetUserId}`
          );
          break;
        }
        case RealtimeEvents.MEMBER_LEFT: {
          const conversationId = String(event.payload.conversationId ?? "");
          const targetUserId = String(event.payload.userId ?? "");
          if (!conversationId || !targetUserId) {
            return;
          }
          await this.enqueueNotification(
            {
              kind: "member.left",
              conversationId,
              targetUserId,
              actorUserId: targetUserId,
            },
            `notification.create:member.left:${conversationId}:${targetUserId}`
          );
          break;
        }
        case RealtimeEvents.ROLE_CHANGED: {
          const conversationId = String(event.payload.conversationId ?? "");
          const targetUserId = String(event.payload.userId ?? "");
          if (!conversationId || !targetUserId) {
            return;
          }
          await this.enqueueNotification(
            {
              kind: "role.changed",
              conversationId,
              targetUserId,
              role:
                typeof event.payload.role === "string"
                  ? event.payload.role
                  : undefined,
            },
            `notification.create:role:${conversationId}:${targetUserId}:${String(event.payload.role ?? "")}`
          );
          break;
        }
        case RealtimeEvents.OWNERSHIP_TRANSFERRED: {
          const conversationId = String(event.payload.conversationId ?? "");
          const fromUserId = String(event.payload.fromUserId ?? "");
          const toUserId = String(event.payload.toUserId ?? "");
          if (!conversationId || !toUserId) {
            return;
          }
          await this.enqueueNotification(
            {
              kind: "ownership.transferred",
              conversationId,
              fromUserId,
              toUserId,
              actorUserId: fromUserId,
            },
            `notification.create:ownership:${conversationId}:${fromUserId}:${toUserId}`
          );
          break;
        }
        case RealtimeEvents.UPLOAD_COMPLETED: {
          const attachmentId = String(
            event.payload.attachmentId ??
              (event.payload.attachment as { id?: string } | undefined)?.id ??
              ""
          );
          if (!attachmentId) {
            return;
          }
          await this.queues.enqueue(
            JobNames.UPLOAD_VIRUS_SCAN,
            {
              attachmentId,
              idempotencyKey: `upload.virusScan:${attachmentId}`,
            },
            { jobId: `upload.virusScan:${attachmentId}` }
          );
          await this.queues.enqueue(
            JobNames.UPLOAD_THUMBNAIL,
            {
              attachmentId,
              idempotencyKey: `upload.thumbnail:${attachmentId}`,
            },
            { jobId: `upload.thumbnail:${attachmentId}` }
          );
          await this.queues.enqueue(
            JobNames.UPLOAD_METADATA,
            {
              attachmentId,
              idempotencyKey: `upload.metadata:${attachmentId}`,
            },
            { jobId: `upload.metadata:${attachmentId}` }
          );
          await this.enqueueNotification(
            {
              kind: "upload.completed",
              attachmentId,
            },
            `notification.create:upload.completed:${attachmentId}`
          );
          break;
        }
        case RealtimeEvents.UPLOAD_FAILED: {
          const attachmentId = String(event.payload.attachmentId ?? "");
          if (!attachmentId) {
            return;
          }
          await this.queues.enqueue(
            JobNames.UPLOAD_CLEANUP,
            {
              attachmentId,
              reason: "upload.failed",
              idempotencyKey: `upload.cleanup:${attachmentId}`,
            },
            { delayMs: 60_000, jobId: `upload.cleanup:${attachmentId}` }
          );
          await this.enqueueNotification(
            {
              kind: "upload.failed",
              attachmentId,
            },
            `notification.create:upload.failed:${attachmentId}`
          );
          break;
        }
        case RealtimeEvents.PRESENCE_LAST_SEEN:
        case RealtimeEvents.PRESENCE_OFFLINE: {
          const userId = String(event.payload.userId ?? "");
          if (!userId) {
            return;
          }
          const lastSeenAt = String(event.payload.lastSeenAt ?? "");
          await this.queues.enqueue(
            JobNames.PRESENCE_LAST_SEEN,
            {
              userId,
              lastSeenAt,
              idempotencyKey: `presence.lastSeen:${userId}:${lastSeenAt}`,
            },
            { jobId: `presence.lastSeen:${userId}:${lastSeenAt}` }
          );
          break;
        }
        default:
          break;
      }
    } catch (err) {
      this.logger.error(
        { err, event: event.name },
        "JobDispatcher enqueue failed"
      );
    }
  }
}
