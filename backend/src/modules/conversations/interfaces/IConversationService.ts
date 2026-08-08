import type {
  ConversationClientContext,
  ConversationDto,
  ConversationsListResponseDto,
  MuteConversationInput,
} from "@modules/conversations/dto/ConversationDto.js";

export interface IConversationService {
  listInbox(userId: string): Promise<ConversationsListResponseDto>;

  getConversation(
    userId: string,
    conversationId: string
  ): Promise<ConversationDto>;

  muteConversation(
    userId: string,
    conversationId: string,
    input: MuteConversationInput,
    context: ConversationClientContext
  ): Promise<ConversationDto>;

  markRead(
    userId: string,
    conversationId: string,
    context: ConversationClientContext
  ): Promise<void>;
}
