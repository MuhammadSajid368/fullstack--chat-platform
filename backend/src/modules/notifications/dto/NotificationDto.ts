/**
 * Notification API DTOs — in-app bell feed.
 * Maps onto Prisma Notification + NotificationType / NotificationStatus.
 */

export type ApiNotificationType =
  | "message"
  | "mention"
  | "group_invite"
  | "group_update"
  | "system";

export type ApiNotificationStatus = "unread" | "read" | "dismissed";

export type NotificationDto = {
  id: string;
  type: ApiNotificationType;
  status: ApiNotificationStatus;
  title: string;
  body: string;
  conversationId: string | null;
  messageId: string | null;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NotificationsPageDto = {
  notifications: NotificationDto[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type UnreadCountDto = {
  count: number;
};

export type NotificationClientContext = {
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
};

/**
 * Job payload for notification.create — fan-out resolved inside NotificationService.
 */
export type NotificationJobKind =
  | "message.created"
  | "message.reaction"
  | "member.joined"
  | "member.removed"
  | "member.left"
  | "role.changed"
  | "ownership.transferred"
  | "group.invite"
  | "upload.completed"
  | "upload.failed"
  | "system";

export type CreateNotificationJobInput = {
  kind: NotificationJobKind;
  messageId?: string;
  conversationId?: string;
  actorUserId?: string;
  targetUserId?: string;
  attachmentId?: string;
  role?: string;
  fromUserId?: string;
  toUserId?: string;
  title?: string;
  body?: string;
  /** Optional explicit recipients (skips membership lookup when set). */
  recipientUserIds?: string[];
};
