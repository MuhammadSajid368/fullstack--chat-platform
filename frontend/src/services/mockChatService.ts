import type { ConversationService } from "./conversationService";
import type { MessageService } from "./messageService";
import type { GroupService } from "./groupService";
import type { AuthService } from "./authService";
import {
  getAuthService,
  getConversationService,
  getGroupService,
  getMessageService,
} from "./serviceRegistry";

/** @deprecated Use getConversationService / getMessageService from serviceRegistry */
export interface ChatService extends ConversationService, MessageService {}

const legacyChatService: ChatService = {
  ...getConversationService(),
  ...getMessageService(),
};

export default legacyChatService;

export {
  getAuthService,
  getConversationService,
  getGroupService,
  getMessageService,
};

export type { AuthService, ConversationService, GroupService, MessageService };
