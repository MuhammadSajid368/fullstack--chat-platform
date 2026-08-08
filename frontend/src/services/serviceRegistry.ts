import { getChatServiceMode, isRestMode } from "../config/env";
import type { AdminService } from "./adminService";
import type { AuthService } from "./authService";
import type { ConversationService } from "./conversationService";
import type { GroupService } from "./groupService";
import type { MessageService } from "./messageService";
import type { NotificationService } from "./notificationService";
import type { PresenceService } from "./presenceService";
import type { SearchService } from "./searchService";
import type { UploadService } from "./uploadService";
import type { UserService } from "./userService";
import { mockAdminService } from "./mock/mockAdminService";
import { mockAuthService } from "./mock/mockAuthService";
import { mockConversationService } from "./mock/mockConversationService";
import { mockGroupService } from "./mock/mockGroupService";
import { mockMessageService } from "./mock/mockMessageService";
import { mockNotificationService } from "./mock/mockNotificationService";
import { mockPresenceService } from "./mock/mockPresenceService";
import { mockSearchService } from "./mock/mockSearchService";
import { mockUploadService } from "./mock/mockUploadService";
import { mockUserService } from "./mock/mockUserService";
import { restAdminService } from "./rest/restAdminService";
import { restAuthService } from "./rest/restAuthService";
import { restConversationService } from "./rest/restConversationService";
import { restGroupService } from "./rest/restGroupService";
import { restMessageService } from "./rest/restMessageService";
import { restNotificationService } from "./rest/restNotificationService";
import { restPresenceService } from "./rest/restPresenceService";
import { restSearchService } from "./rest/restSearchService";
import { restUploadService } from "./rest/restUploadService";
import { restUserService } from "./rest/restUserService";

/**
 * Service factory.
 * - mock (default): in-memory deterministic services, no network.
 * - rest: axios adapters against VITE_API_BASE_URL (see docs/API_CONTRACT.md).
 */

export function getConversationService(): ConversationService {
  return isRestMode() ? restConversationService : mockConversationService;
}

export function getMessageService(): MessageService {
  return isRestMode() ? restMessageService : mockMessageService;
}

export function getGroupService(): GroupService {
  return isRestMode() ? restGroupService : mockGroupService;
}

export function getAuthService(): AuthService {
  return isRestMode() ? restAuthService : mockAuthService;
}

export function getUserService(): UserService {
  return isRestMode() ? restUserService : mockUserService;
}

export function getPresenceService(): PresenceService {
  return isRestMode() ? restPresenceService : mockPresenceService;
}

export function getNotificationService(): NotificationService {
  return isRestMode() ? restNotificationService : mockNotificationService;
}

export function getSearchService(): SearchService {
  return isRestMode() ? restSearchService : mockSearchService;
}

export function getUploadService(): UploadService {
  return isRestMode() ? restUploadService : mockUploadService;
}

export function getAdminService(): AdminService {
  return isRestMode() ? restAdminService : mockAdminService;
}

export function getActiveChatServiceMode(): ReturnType<typeof getChatServiceMode> {
  return getChatServiceMode();
}
