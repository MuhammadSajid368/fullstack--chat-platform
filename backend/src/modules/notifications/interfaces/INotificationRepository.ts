import type {
  NotificationStatus,
  NotificationType,
  Prisma,
} from "@prisma/client";
import type { ApiNotificationType } from "@modules/notifications/dto/NotificationDto.js";

export type NotificationRecord = {
  id: string;
  userId: string;
  type: NotificationType | string;
  status: NotificationStatus | string;
  title: string;
  body: string;
  conversationId: string | null;
  messageId: string | null;
  payload: Prisma.JsonValue | null;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type NotificationCursor = {
  createdAt: Date;
  id: string;
};

export type CreateNotificationRow = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  conversationId?: string | null;
  messageId?: string | null;
  payload?: Prisma.InputJsonValue | null;
  /** Stored in payload.dedupeKey — used for idempotent creates. */
  dedupeKey: string;
};

export type MessageFanoutContext = {
  messageId: string;
  conversationId: string;
  conversationType: "DIRECT" | "GROUP" | string;
  conversationStatus: string;
  conversationDeletedAt: Date | null;
  senderId: string;
  senderName: string;
  contentPreview: string;
  replyToMessageId: string | null;
  replyToSenderId: string | null;
  mentionUserIds: string[];
  members: Array<{
    userId: string;
    muted: boolean;
    leftAt: Date | null;
    deletedAt: Date | null;
    userDeletedAt: Date | null;
  }>;
};

export type MemberFanoutContext = {
  conversationId: string;
  conversationName: string | null;
  conversationStatus: string;
  conversationDeletedAt: Date | null;
  members: Array<{
    userId: string;
    muted: boolean;
    leftAt: Date | null;
    deletedAt: Date | null;
    userDeletedAt: Date | null;
  }>;
};

export type AttachmentContext = {
  id: string;
  uploaderId: string;
  conversationId: string | null;
  fileName: string;
  uploaderDeletedAt: Date | null;
};

export interface INotificationRepository {
  listForUser(input: {
    userId: string;
    cursor?: NotificationCursor;
    limit: number;
  }): Promise<NotificationRecord[]>;

  countUnread(userId: string): Promise<number>;

  findByIdForUser(
    userId: string,
    notificationId: string
  ): Promise<NotificationRecord | null>;

  markRead(
    userId: string,
    notificationId: string
  ): Promise<NotificationRecord | null>;

  markAllRead(userId: string): Promise<number>;

  softDelete(
    userId: string,
    notificationId: string
  ): Promise<NotificationRecord | null>;

  existsByDedupeKey(userId: string, dedupeKey: string): Promise<boolean>;

  createMany(rows: CreateNotificationRow[]): Promise<NotificationRecord[]>;

  findMessageFanoutContext(
    messageId: string
  ): Promise<MessageFanoutContext | null>;

  findMemberFanoutContext(
    conversationId: string
  ): Promise<MemberFanoutContext | null>;

  findAttachmentContext(
    attachmentId: string
  ): Promise<AttachmentContext | null>;

  findActiveUserName(userId: string): Promise<string | null>;
}

export type { ApiNotificationType };
