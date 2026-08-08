import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  AttachmentContext,
  CreateNotificationRow,
  INotificationRepository,
  MemberFanoutContext,
  MessageFanoutContext,
  NotificationCursor,
  NotificationRecord,
} from "@modules/notifications/interfaces/INotificationRepository.js";

const select = {
  id: true,
  userId: true,
  type: true,
  status: true,
  title: true,
  body: true,
  conversationId: true,
  messageId: true,
  payload: true,
  readAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.NotificationSelect;

function extractMentionUserIds(metadata: Prisma.JsonValue | null): string[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }
  const mentions = (metadata as Record<string, unknown>).mentions;
  if (!Array.isArray(mentions)) {
    return [];
  }
  return mentions.filter((m): m is string => typeof m === "string" && m.length > 0);
}

/**
 * Notification persistence — Prisma only. Soft-delete, dedupe, fan-out context.
 */
export class NotificationRepository implements INotificationRepository {
  constructor(protected readonly prisma: PrismaClient) {}

  async listForUser(input: {
    userId: string;
    cursor?: NotificationCursor;
    limit: number;
  }): Promise<NotificationRecord[]> {
    const take = input.limit + 1;
    return this.prisma.notification.findMany({
      where: {
        userId: input.userId,
        deletedAt: null,
        ...(input.cursor
          ? {
              OR: [
                { createdAt: { lt: input.cursor.createdAt } },
                {
                  createdAt: input.cursor.createdAt,
                  id: { lt: input.cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select,
    });
  }

  async countUnread(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: {
        userId,
        deletedAt: null,
        status: "UNREAD",
      },
    });
  }

  async findByIdForUser(
    userId: string,
    notificationId: string
  ): Promise<NotificationRecord | null> {
    return this.prisma.notification.findFirst({
      where: { id: notificationId, userId, deletedAt: null },
      select,
    });
  }

  async markRead(
    userId: string,
    notificationId: string
  ): Promise<NotificationRecord | null> {
    const existing = await this.findByIdForUser(userId, notificationId);
    if (!existing) {
      return null;
    }
    if (existing.status === "READ") {
      return existing;
    }
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: "READ",
        readAt: new Date(),
      },
      select,
    });
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        deletedAt: null,
        status: "UNREAD",
      },
      data: {
        status: "READ",
        readAt: new Date(),
      },
    });
    return result.count;
  }

  async softDelete(
    userId: string,
    notificationId: string
  ): Promise<NotificationRecord | null> {
    const existing = await this.findByIdForUser(userId, notificationId);
    if (!existing) {
      return null;
    }
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { deletedAt: new Date(), status: "DISMISSED" },
      select,
    });
  }

  async existsByDedupeKey(
    userId: string,
    dedupeKey: string
  ): Promise<boolean> {
    const found = await this.prisma.notification.findFirst({
      where: {
        userId,
        deletedAt: null,
        payload: {
          path: ["dedupeKey"],
          equals: dedupeKey,
        },
      },
      select: { id: true },
    });
    return Boolean(found);
  }

  async createMany(
    rows: CreateNotificationRow[]
  ): Promise<NotificationRecord[]> {
    if (rows.length === 0) {
      return [];
    }

    const created: NotificationRecord[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const payload = {
          ...(row.payload &&
          typeof row.payload === "object" &&
          !Array.isArray(row.payload)
            ? (row.payload as Record<string, unknown>)
            : {}),
          dedupeKey: row.dedupeKey,
        };
        const record = await tx.notification.create({
          data: {
            userId: row.userId,
            type: row.type,
            title: row.title,
            body: row.body,
            conversationId: row.conversationId ?? null,
            messageId: row.messageId ?? null,
            payload: payload as Prisma.InputJsonValue,
            status: "UNREAD",
          },
          select,
        });
        created.push(record);
      }
    });
    return created;
  }

  async findMessageFanoutContext(
    messageId: string
  ): Promise<MessageFanoutContext | null> {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, deletedAt: null },
      select: {
        id: true,
        conversationId: true,
        senderId: true,
        content: true,
        replyToMessageId: true,
        metadata: true,
        sender: { select: { id: true, name: true, deletedAt: true } },
        conversation: {
          select: {
            id: true,
            type: true,
            status: true,
            deletedAt: true,
          },
        },
      },
    });
    if (!message || message.sender.deletedAt) {
      return null;
    }

    let replyToSenderId: string | null = null;
    if (message.replyToMessageId) {
      const reply = await this.prisma.message.findFirst({
        where: { id: message.replyToMessageId },
        select: { senderId: true },
      });
      replyToSenderId = reply?.senderId ?? null;
    }

    const members = await this.prisma.conversationMember.findMany({
      where: {
        conversationId: message.conversationId,
        leftAt: null,
        deletedAt: null,
      },
      select: {
        userId: true,
        muted: true,
        leftAt: true,
        deletedAt: true,
        user: { select: { deletedAt: true } },
      },
    });

    return {
      messageId: message.id,
      conversationId: message.conversationId,
      conversationType: message.conversation.type,
      conversationStatus: message.conversation.status,
      conversationDeletedAt: message.conversation.deletedAt,
      senderId: message.senderId,
      senderName: message.sender.name,
      contentPreview: message.content.slice(0, 180),
      replyToMessageId: message.replyToMessageId,
      replyToSenderId,
      mentionUserIds: extractMentionUserIds(message.metadata),
      members: members.map((m) => ({
        userId: m.userId,
        muted: m.muted,
        leftAt: m.leftAt,
        deletedAt: m.deletedAt,
        userDeletedAt: m.user.deletedAt,
      })),
    };
  }

  async findMemberFanoutContext(
    conversationId: string
  ): Promise<MemberFanoutContext | null> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId },
      select: {
        id: true,
        name: true,
        status: true,
        deletedAt: true,
      },
    });
    if (!conversation) {
      return null;
    }

    const members = await this.prisma.conversationMember.findMany({
      where: {
        conversationId,
        leftAt: null,
        deletedAt: null,
      },
      select: {
        userId: true,
        muted: true,
        leftAt: true,
        deletedAt: true,
        user: { select: { deletedAt: true } },
      },
    });

    return {
      conversationId: conversation.id,
      conversationName: conversation.name,
      conversationStatus: conversation.status,
      conversationDeletedAt: conversation.deletedAt,
      members: members.map((m) => ({
        userId: m.userId,
        muted: m.muted,
        leftAt: m.leftAt,
        deletedAt: m.deletedAt,
        userDeletedAt: m.user.deletedAt,
      })),
    };
  }

  async findAttachmentContext(
    attachmentId: string
  ): Promise<AttachmentContext | null> {
    const attachment = await this.prisma.futureAttachment.findFirst({
      where: { id: attachmentId, deletedAt: null },
      select: {
        id: true,
        uploaderId: true,
        conversationId: true,
        fileName: true,
        uploader: { select: { deletedAt: true } },
      },
    });
    if (!attachment) {
      return null;
    }
    return {
      id: attachment.id,
      uploaderId: attachment.uploaderId,
      conversationId: attachment.conversationId,
      fileName: attachment.fileName,
      uploaderDeletedAt: attachment.uploader.deletedAt,
    };
  }

  async findActiveUserName(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { name: true },
    });
    return user?.name ?? null;
  }
}
