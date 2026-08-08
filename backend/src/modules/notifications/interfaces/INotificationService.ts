import type {
  CreateNotificationJobInput,
  NotificationClientContext,
  NotificationDto,
  NotificationsPageDto,
  UnreadCountDto,
} from "@modules/notifications/dto/NotificationDto.js";

export interface INotificationService {
  list(
    userId: string,
    query: { cursor?: string; limit: number }
  ): Promise<NotificationsPageDto>;

  unreadCount(userId: string): Promise<UnreadCountDto>;

  markRead(
    userId: string,
    notificationId: string,
    context?: NotificationClientContext
  ): Promise<NotificationDto>;

  markAllRead(
    userId: string,
    context?: NotificationClientContext
  ): Promise<{ updated: number }>;

  softDelete(
    userId: string,
    notificationId: string,
    context?: NotificationClientContext
  ): Promise<NotificationDto>;

  /**
   * Worker entry — fan-out + persist + socket emit. Idempotent.
   */
  processJob(input: CreateNotificationJobInput): Promise<NotificationDto[]>;
}
