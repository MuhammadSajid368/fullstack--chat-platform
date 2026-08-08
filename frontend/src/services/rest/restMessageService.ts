import type { MessageService, SendDirectMessageResult } from "../messageService";
import type {
  LoadMessagesParams,
  Message,
  PaginatedMessages,
  SendDirectMessageParams,
  SendMessageParams,
} from "../../types/chat";
import { API_ENDPOINTS } from "../api/endpoints";
import { httpDelete, httpGet, httpPost } from "../api/httpClient";
import type {
  ApiMessageDto,
  ApiMessagesPageResponse,
  ApiSendDirectMessageRequest,
  ApiSendMessageRequest,
  ApiSendMessageResult,
} from "../api/apiTypes";
import { transformMessage, transformMessagesPage } from "../api/transformers";
import { getErrorMessage } from "../api/apiError";

const DEFAULT_PAGE_LIMIT = 30;

function buildSendBody(
  params: SendMessageParams | SendDirectMessageParams
): ApiSendMessageRequest {
  const body: ApiSendMessageRequest = {
    content: params.content,
    clientMessageId: params.clientMessageId,
  };
  if (params.replyToMessageId) {
    body.replyToMessageId = params.replyToMessageId;
  }
  if (params.type) {
    body.type = params.type;
  }
  if (params.attachmentIds?.length) {
    body.attachmentIds = params.attachmentIds;
  }
  if (params.metadata) {
    body.metadata = params.metadata;
  }
  if (params.linkPreview) {
    body.linkPreview = params.linkPreview;
  }
  return body;
}

class RestMessageService implements MessageService {
  async loadMessages(params: LoadMessagesParams): Promise<PaginatedMessages> {
    try {
      const data = await httpGet<ApiMessagesPageResponse>(
        API_ENDPOINTS.conversations.messages(params.conversationId),
        {
          params: {
            cursor: params.cursor ?? undefined,
            limit: params.limit ?? DEFAULT_PAGE_LIMIT,
          },
        }
      );
      return transformMessagesPage(data);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to load messages"));
    }
  }

  async sendMessage(params: SendMessageParams): Promise<Message> {
    try {
      const body = buildSendBody(params);
      const dto = await httpPost<ApiMessageDto>(
        API_ENDPOINTS.conversations.messages(params.conversationId),
        body
      );
      return transformMessage(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to send message"));
    }
  }

  async sendDirectMessage(
    params: SendDirectMessageParams
  ): Promise<SendDirectMessageResult> {
    try {
      const body: ApiSendDirectMessageRequest = {
        ...buildSendBody(params),
        peerUserId: params.peerUserId,
      };
      const result = await httpPost<ApiSendMessageResult>(
        API_ENDPOINTS.messages.direct,
        body
      );
      return {
        message: transformMessage(result.message),
        conversationId: result.conversationId,
        created: result.created,
      };
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to send direct message"));
    }
  }

  async retryMessage(messageId: string): Promise<Message> {
    try {
      const dto = await httpPost<ApiMessageDto>(
        API_ENDPOINTS.messages.retry(messageId)
      );
      return transformMessage(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to retry message"));
    }
  }

  async deleteMessage(messageId: string, conversationId: string): Promise<void> {
    void conversationId;
    try {
      await httpDelete(API_ENDPOINTS.messages.byId(messageId));
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to delete message"));
    }
  }

  async starMessage(messageId: string, conversationId: string): Promise<Message> {
    void conversationId;
    try {
      const dto = await httpPost<ApiMessageDto>(
        API_ENDPOINTS.messages.star(messageId)
      );
      return transformMessage(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to star message"));
    }
  }

  async unstarMessage(
    messageId: string,
    conversationId: string
  ): Promise<Message> {
    void conversationId;
    try {
      const dto = await httpDelete<ApiMessageDto>(
        API_ENDPOINTS.messages.star(messageId)
      );
      return transformMessage(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to unstar message"));
    }
  }

  async pinMessage(messageId: string, conversationId: string): Promise<Message> {
    void conversationId;
    try {
      const dto = await httpPost<ApiMessageDto>(
        API_ENDPOINTS.messages.pin(messageId)
      );
      return transformMessage(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to pin message"));
    }
  }

  async unpinMessage(
    messageId: string,
    conversationId: string
  ): Promise<Message> {
    void conversationId;
    try {
      const dto = await httpDelete<ApiMessageDto>(
        API_ENDPOINTS.messages.pin(messageId)
      );
      return transformMessage(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to unpin message"));
    }
  }
}

export const restMessageService = new RestMessageService();
