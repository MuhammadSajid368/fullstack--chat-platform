export {
  getAdminService,
  getAuthService,
  getConversationService,
  getGroupService,
  getMessageService,
  getNotificationService,
  getPresenceService,
  getSearchService,
  getUploadService,
  getUserService,
} from "./serviceRegistry";

export {
  connectSocket,
  disconnectSocket,
  emitSocketEvent,
  getSocket,
  onSocketEvent,
  RealtimeEvents,
} from "./socket/socketClient";

export type { RealtimeEventName } from "./socket/socketClient";
