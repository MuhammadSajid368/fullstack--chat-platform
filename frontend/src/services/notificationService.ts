export type NotificationType =
  | "message"
  | "mention"
  | "group_invite"
  | "group_update"
  | "system";

export type NotificationStatus = "unread" | "read" | "dismissed";

export interface Notification {
  id: string;
  type: NotificationType;
  status: NotificationStatus;
  title: string;
  body: string;
  conversationId?: string | null;
  messageId?: string | null;
  payload?: Record<string, unknown> | null;
  readAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface NotificationsPage {
  notifications: Notification[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ListNotificationsParams {
  cursor?: string;
  limit?: number;
}

export interface NotificationService {
  listNotifications(params?: ListNotificationsParams): Promise<NotificationsPage>;
  getUnreadCount(): Promise<number>;
  markAllRead(): Promise<void>;
  markRead(notificationId: string): Promise<Notification>;
  deleteNotification(notificationId: string): Promise<void>;
}
