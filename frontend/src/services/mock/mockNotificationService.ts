import type {
  Notification,
  NotificationService,
  NotificationsPage,
} from "../notificationService";

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const mockNotifications: Notification[] = [];

class MockNotificationService implements NotificationService {
  async listNotifications(): Promise<NotificationsPage> {
    await delay(200);
    return {
      notifications: mockNotifications.map((item) => ({ ...item })),
      nextCursor: null,
      hasMore: false,
    };
  }

  async getUnreadCount(): Promise<number> {
    await delay(100);
    return mockNotifications.filter((item) => item.status === "unread").length;
  }

  async markAllRead(): Promise<void> {
    await delay(100);
    for (const notification of mockNotifications) {
      notification.status = "read";
      notification.readAt = new Date().toISOString();
    }
  }

  async markRead(notificationId: string): Promise<Notification> {
    await delay(100);
    const notification = mockNotifications.find((item) => item.id === notificationId);
    if (!notification) {
      throw new Error("Notification not found");
    }
    notification.status = "read";
    notification.readAt = new Date().toISOString();
    return { ...notification };
  }

  async deleteNotification(notificationId: string): Promise<void> {
    await delay(100);
    const index = mockNotifications.findIndex((item) => item.id === notificationId);
    if (index === -1) {
      throw new Error("Notification not found");
    }
    mockNotifications.splice(index, 1);
  }
}

export const mockNotificationService = new MockNotificationService();
