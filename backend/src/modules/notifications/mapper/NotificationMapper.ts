import type {
  NotificationStatus,
  NotificationType,
} from "@prisma/client";
import type {
  ApiNotificationStatus,
  ApiNotificationType,
  NotificationDto,
} from "@modules/notifications/dto/NotificationDto.js";
import type { NotificationRecord } from "@modules/notifications/interfaces/INotificationRepository.js";

export class NotificationMapper {
  static toDto(row: NotificationRecord): NotificationDto {
    return {
      id: row.id,
      type: this.toApiType(row.type),
      status: this.toApiStatus(row.status),
      title: row.title,
      body: row.body,
      conversationId: row.conversationId,
      messageId: row.messageId,
      payload:
        row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : null,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  static toApiType(type: NotificationType | string): ApiNotificationType {
    switch (type) {
      case "MESSAGE":
        return "message";
      case "MENTION":
        return "mention";
      case "GROUP_INVITE":
        return "group_invite";
      case "GROUP_UPDATE":
        return "group_update";
      case "SYSTEM":
      default:
        return "system";
    }
  }

  static toApiStatus(
    status: NotificationStatus | string
  ): ApiNotificationStatus {
    switch (status) {
      case "READ":
        return "read";
      case "DISMISSED":
        return "dismissed";
      case "UNREAD":
      default:
        return "unread";
    }
  }

  static toPrismaType(type: ApiNotificationType): NotificationType {
    switch (type) {
      case "message":
        return "MESSAGE";
      case "mention":
        return "MENTION";
      case "group_invite":
        return "GROUP_INVITE";
      case "group_update":
        return "GROUP_UPDATE";
      case "system":
      default:
        return "SYSTEM";
    }
  }
}
