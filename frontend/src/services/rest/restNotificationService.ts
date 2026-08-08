import type {
  Notification,
  NotificationService,
  NotificationsPage,
} from "../notificationService";
import { API_ENDPOINTS } from "../api/endpoints";
import { httpDelete, httpGet, httpPatch } from "../api/httpClient";
import type {
  ApiNotificationDto,
  ApiNotificationsPageResponse,
  ApiUnreadCountResponse,
} from "../api/apiTypes";
import { getErrorMessage } from "../api/apiError";

function transformNotification(dto: ApiNotificationDto): Notification {
  return {
    id: dto.id,
    type: dto.type,
    status: dto.status,
    title: dto.title,
    body: dto.body,
    conversationId: dto.conversationId,
    messageId: dto.messageId,
    payload: dto.payload,
    readAt: dto.readAt,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

class RestNotificationService implements NotificationService {
  async listNotifications(params = {}): Promise<NotificationsPage> {
    try {
      const data = await httpGet<ApiNotificationsPageResponse>(
        API_ENDPOINTS.notifications.list,
        { params }
      );
      return {
        notifications: data.notifications.map(transformNotification),
        nextCursor: data.nextCursor,
        hasMore: Boolean(data.hasMore),
      };
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to load notifications"));
    }
  }

  async getUnreadCount(): Promise<number> {
    try {
      const data = await httpGet<ApiUnreadCountResponse>(
        API_ENDPOINTS.notifications.unreadCount
      );
      return data.count;
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to load unread count"));
    }
  }

  async markAllRead(): Promise<void> {
    try {
      await httpPatch(API_ENDPOINTS.notifications.readAll);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to mark notifications read"));
    }
  }

  async markRead(notificationId: string): Promise<Notification> {
    try {
      const dto = await httpPatch<ApiNotificationDto>(
        API_ENDPOINTS.notifications.readOne(notificationId)
      );
      return transformNotification(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to mark notification read"));
    }
  }

  async deleteNotification(notificationId: string): Promise<void> {
    try {
      await httpDelete(API_ENDPOINTS.notifications.delete(notificationId));
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to delete notification"));
    }
  }
}

export const restNotificationService = new RestNotificationService();
