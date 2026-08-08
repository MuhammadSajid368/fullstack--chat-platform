import { randomUUID } from "node:crypto";
import type { NotificationStatus, NotificationType } from "@prisma/client";
import type {
  AttachmentContext,
  CreateNotificationRow,
  INotificationRepository,
  MemberFanoutContext,
  MessageFanoutContext,
  NotificationCursor,
  NotificationRecord,
} from "../../src/modules/notifications/interfaces/INotificationRepository.js";

function asRecord(
  row: CreateNotificationRow & { id?: string }
): NotificationRecord {
  const payload = {
    ...(row.payload &&
    typeof row.payload === "object" &&
    !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {}),
    dedupeKey: row.dedupeKey,
  };
  const now = new Date();
  return {
    id: row.id ?? randomUUID(),
    userId: row.userId,
    type: row.type,
    status: "UNREAD",
    title: row.title,
    body: row.body,
    conversationId: row.conversationId ?? null,
    messageId: row.messageId ?? null,
    payload,
    readAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/**
 * In-memory notification repository for unit tests.
 */
export class InMemoryNotificationRepository implements INotificationRepository {
  notifications = new Map<string, NotificationRecord>();
  messageContexts = new Map<string, MessageFanoutContext>();
  memberContexts = new Map<string, MemberFanoutContext>();
  attachments = new Map<string, AttachmentContext>();
  users = new Map<string, string>();

  seedMessageContext(ctx: MessageFanoutContext): void {
    this.messageContexts.set(ctx.messageId, ctx);
  }

  seedMemberContext(ctx: MemberFanoutContext): void {
    this.memberContexts.set(ctx.conversationId, ctx);
  }

  seedAttachment(ctx: AttachmentContext): void {
    this.attachments.set(ctx.id, ctx);
  }

  seedUser(id: string, name: string): void {
    this.users.set(id, name);
  }

  async listForUser(input: {
    userId: string;
    cursor?: NotificationCursor;
    limit: number;
  }): Promise<NotificationRecord[]> {
    let rows = [...this.notifications.values()]
      .filter((n) => n.userId === input.userId && !n.deletedAt)
      .sort((a, b) => {
        const t = b.createdAt.getTime() - a.createdAt.getTime();
        return t !== 0 ? t : b.id.localeCompare(a.id);
      });

    if (input.cursor) {
      rows = rows.filter((n) => {
        if (n.createdAt.getTime() < input.cursor!.createdAt.getTime()) {
          return true;
        }
        if (
          n.createdAt.getTime() === input.cursor!.createdAt.getTime() &&
          n.id < input.cursor!.id
        ) {
          return true;
        }
        return false;
      });
    }
    return rows.slice(0, input.limit + 1);
  }

  async countUnread(userId: string): Promise<number> {
    return [...this.notifications.values()].filter(
      (n) =>
        n.userId === userId && !n.deletedAt && n.status === ("UNREAD" as NotificationStatus)
    ).length;
  }

  async findByIdForUser(
    userId: string,
    notificationId: string
  ): Promise<NotificationRecord | null> {
    const n = this.notifications.get(notificationId);
    if (!n || n.userId !== userId || n.deletedAt) {
      return null;
    }
    return n;
  }

  async markRead(
    userId: string,
    notificationId: string
  ): Promise<NotificationRecord | null> {
    const n = await this.findByIdForUser(userId, notificationId);
    if (!n) {
      return null;
    }
    if (n.status === "READ") {
      return n;
    }
    n.status = "READ";
    n.readAt = new Date();
    n.updatedAt = new Date();
    return n;
  }

  async markAllRead(userId: string): Promise<number> {
    let count = 0;
    for (const n of this.notifications.values()) {
      if (n.userId === userId && !n.deletedAt && n.status === "UNREAD") {
        n.status = "READ";
        n.readAt = new Date();
        count += 1;
      }
    }
    return count;
  }

  async softDelete(
    userId: string,
    notificationId: string
  ): Promise<NotificationRecord | null> {
    const n = await this.findByIdForUser(userId, notificationId);
    if (!n) {
      return null;
    }
    n.deletedAt = new Date();
    n.status = "DISMISSED";
    return n;
  }

  async existsByDedupeKey(
    userId: string,
    dedupeKey: string
  ): Promise<boolean> {
    return [...this.notifications.values()].some((n) => {
      if (n.userId !== userId || n.deletedAt) {
        return false;
      }
      const payload = n.payload as { dedupeKey?: string } | null;
      return payload?.dedupeKey === dedupeKey;
    });
  }

  async createMany(
    rows: CreateNotificationRow[]
  ): Promise<NotificationRecord[]> {
    const created: NotificationRecord[] = [];
    for (const row of rows) {
      const record = asRecord(row);
      this.notifications.set(record.id, record);
      created.push(record);
    }
    return created;
  }

  async findMessageFanoutContext(
    messageId: string
  ): Promise<MessageFanoutContext | null> {
    return this.messageContexts.get(messageId) ?? null;
  }

  async findMemberFanoutContext(
    conversationId: string
  ): Promise<MemberFanoutContext | null> {
    return this.memberContexts.get(conversationId) ?? null;
  }

  async findAttachmentContext(
    attachmentId: string
  ): Promise<AttachmentContext | null> {
    return this.attachments.get(attachmentId) ?? null;
  }

  async findActiveUserName(userId: string): Promise<string | null> {
    return this.users.get(userId) ?? null;
  }

  /** Test helper */
  insert(row: Partial<NotificationRecord> & { userId: string; title: string }): NotificationRecord {
    const now = new Date();
    const record: NotificationRecord = {
      id: row.id ?? randomUUID(),
      userId: row.userId,
      type: (row.type as NotificationType) ?? "MESSAGE",
      status: (row.status as NotificationStatus) ?? "UNREAD",
      title: row.title,
      body: row.body ?? "",
      conversationId: row.conversationId ?? null,
      messageId: row.messageId ?? null,
      payload: row.payload ?? { dedupeKey: randomUUID() },
      readAt: row.readAt ?? null,
      createdAt: row.createdAt ?? now,
      updatedAt: row.updatedAt ?? now,
      deletedAt: row.deletedAt ?? null,
    };
    this.notifications.set(record.id, record);
    return record;
  }
}
