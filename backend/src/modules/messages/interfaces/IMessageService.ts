import type {
  MessageClientContext,
  MessagesPageDto,
  SendDirectInput,
  SendMessageInput,
  SendMessageResult,
  MessageDto,
} from "@modules/messages/dto/MessageDto.js";

export interface IMessageService {
  listMessages(
    userId: string,
    conversationId: string,
    query: { cursor?: string; limit: number }
  ): Promise<MessagesPageDto>;

  send(
    userId: string,
    conversationId: string,
    input: SendMessageInput,
    context: MessageClientContext
  ): Promise<SendMessageResult>;

  /** Lazy DIRECT creation + first message (Messages owns DIRECT create). */
  sendDirect(
    userId: string,
    input: SendDirectInput,
    context: MessageClientContext
  ): Promise<SendMessageResult>;

  retry(
    userId: string,
    messageId: string,
    context: MessageClientContext
  ): Promise<MessageDto>;

  softDelete(
    userId: string,
    messageId: string,
    context: MessageClientContext
  ): Promise<MessageDto>;

  star(
    userId: string,
    messageId: string,
    context: MessageClientContext
  ): Promise<MessageDto>;

  unstar(
    userId: string,
    messageId: string,
    context: MessageClientContext
  ): Promise<MessageDto>;

  pin(
    userId: string,
    messageId: string,
    context: MessageClientContext
  ): Promise<MessageDto>;

  unpin(
    userId: string,
    messageId: string,
    context: MessageClientContext
  ): Promise<MessageDto>;
}
