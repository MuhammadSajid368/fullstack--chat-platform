import type {
  LoadMessagesParams,
  Message,
  PaginatedMessages,
  SendDirectMessageParams,
  SendMessageParams,
} from "../types/chat";

export interface SendDirectMessageResult {
  message: Message;
  conversationId: string;
  created: boolean;
}

export interface MessageService {
  loadMessages(params: LoadMessagesParams): Promise<PaginatedMessages>;
  sendMessage(params: SendMessageParams): Promise<Message>;
  sendDirectMessage(params: SendDirectMessageParams): Promise<SendDirectMessageResult>;
  retryMessage(messageId: string): Promise<Message>;
  deleteMessage(messageId: string, conversationId: string): Promise<void>;
  starMessage(messageId: string, conversationId: string): Promise<Message>;
  unstarMessage(messageId: string, conversationId: string): Promise<Message>;
  pinMessage(messageId: string, conversationId: string): Promise<Message>;
  unpinMessage(messageId: string, conversationId: string): Promise<Message>;
}
