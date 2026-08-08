/**
 * @deprecated Use createRestChatServices pieces via serviceRegistry.
 * Kept as a documented adapter boundary for REST mode.
 */
import type { ConversationService } from "../conversationService";
import type { GroupService } from "../groupService";
import type { MessageService } from "../messageService";
import type { AuthService } from "../authService";
import { restAuthService } from "../rest/restAuthService";
import { restConversationService } from "../rest/restConversationService";
import { restGroupService } from "../rest/restGroupService";
import { restMessageService } from "../rest/restMessageService";
import { isRestMode } from "../../config/env";
import { ApiError } from "../api/apiError";

export function createRestChatServices(): {
  auth: AuthService;
  conversation: ConversationService;
  message: MessageService;
  group: GroupService;
} {
  if (!isRestMode()) {
    throw new ApiError({
      code: "CONFIG_ERROR",
      message:
        "createRestChatServices() requires VITE_CHAT_SERVICE_MODE=rest.",
    });
  }

  return {
    auth: restAuthService,
    conversation: restConversationService,
    message: restMessageService,
    group: restGroupService,
  };
}
