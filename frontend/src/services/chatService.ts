/**
 * TODO(rest): Replace mock implementations with HTTP calls when VITE_CHAT_SERVICE_MODE=rest.
 * See src/services/adapters/restChatService.ts for the planned REST boundary.
 */
export type { ConversationService } from "./conversationService";
export type { MessageService } from "./messageService";
export type { GroupService } from "./groupService";
export type { AuthService } from "./authService";

export {
  getConversationService,
  getMessageService,
  getGroupService,
  getAuthService,
} from "./serviceRegistry";
