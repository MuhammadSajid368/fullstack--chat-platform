import type { MessageService, SendDirectMessageResult } from "../messageService";
import type {
  LoadMessagesParams,
  Message,
  PaginatedMessages,
  SendDirectMessageParams,
  SendMessageParams,
} from "../../types/chat";
import {
  generateMessageId,
  mockDataStore,
} from "./mockDataStore";

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const DEFAULT_LIMIT = 30;

function sortAscending(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

class MockMessageService implements MessageService {
  async loadMessages(params: LoadMessagesParams): Promise<PaginatedMessages> {
    await delay(400);

    const all = mockDataStore.messagesByConversation[params.conversationId];
    if (all === undefined) {
      throw new Error(`Conversation not found: ${params.conversationId}`);
    }

    const sorted = sortAscending(all);
    const limit = params.limit ?? DEFAULT_LIMIT;

    // Cursor is the createdAt of the oldest message already loaded.
    // Without a cursor, return the newest page.
    let endExclusive = sorted.length;
    if (params.cursor) {
      const cursorIndex = sorted.findIndex(
        (message) => message.createdAt === params.cursor || message.id === params.cursor
      );
      endExclusive = cursorIndex === -1 ? sorted.length : cursorIndex;
    }

    const start = Math.max(0, endExclusive - limit);
    const page = sorted.slice(start, endExclusive).map((message) => ({ ...message }));
    const hasMore = start > 0;
    const nextCursor = hasMore ? page[0]?.createdAt ?? null : null;

    return {
      messages: page,
      nextCursor,
      hasMore,
    };
  }

  async sendMessage(params: SendMessageParams): Promise<Message> {
    await delay(800);

    const shouldFail =
      params.forceFailure === true ||
      mockDataStore.shouldFailNextSend ||
      params.content.includes("[fail]");

    if (shouldFail) {
      mockDataStore.shouldFailNextSend = false;
      throw new Error("Failed to send message. Please try again.");
    }

    // Idempotent retry: return existing message with same clientMessageId.
    if (params.clientMessageId) {
      const existing = (
        mockDataStore.messagesByConversation[params.conversationId] ?? []
      ).find((message) => message.clientMessageId === params.clientMessageId);
      if (existing) {
        return { ...existing, status: "sent" };
      }
    }

    const replyMessage = params.replyToMessageId
      ? this.findMessage(params.conversationId, params.replyToMessageId)
      : undefined;

    const newMessage: Message = {
      id: generateMessageId(params.conversationId),
      conversationId: params.conversationId,
      senderId: params.senderId,
      type: params.type ?? (params.replyToMessageId ? "reply" : "text"),
      content: params.content,
      createdAt: new Date().toISOString(),
      status: "sent",
      starred: false,
      pinned: false,
      deleted: false,
      replyToMessageId: params.replyToMessageId,
      clientMessageId: params.clientMessageId,
      attachmentIds: params.attachmentIds,
      metadata: params.metadata,
      linkPreview: params.linkPreview,
    };

    if (replyMessage && !replyMessage.deleted) {
      newMessage.type = "reply";
    }

    const conversationMessages =
      mockDataStore.messagesByConversation[params.conversationId] ?? [];
    mockDataStore.messagesByConversation[params.conversationId] = [
      ...conversationMessages,
      newMessage,
    ];

    const conversation = mockDataStore.conversations.find(
      (item) => item.id === params.conversationId
    );
    if (conversation) {
      conversation.lastMessagePreview = params.content;
      conversation.lastMessageAt = newMessage.createdAt;
    }

    return { ...newMessage };
  }

  async sendDirectMessage(
    params: SendDirectMessageParams
  ): Promise<SendDirectMessageResult> {
    await delay(500);
    const existingConversation = mockDataStore.conversations.find(
      (conversation) =>
        conversation.type === "direct" &&
        conversation.memberIds.includes(params.peerUserId)
    );
    const conversationId =
      existingConversation?.id ?? `direct-${params.peerUserId}-${Date.now()}`;

    if (!existingConversation) {
      mockDataStore.conversations.unshift({
        id: conversationId,
        type: "direct",
        name: mockDataStore.users[params.peerUserId]?.name ?? "Direct chat",
        avatar: mockDataStore.users[params.peerUserId]?.avatar ?? "",
        memberIds: [params.peerUserId],
        pinned: false,
        lastMessagePreview: "",
        lastMessageAt: new Date().toISOString(),
      });
      mockDataStore.messagesByConversation[conversationId] = [];
      mockDataStore.unreadCounts[conversationId] = 0;
    }

    const message = await this.sendMessage({
      conversationId,
      content: params.content,
      senderId: "current-user",
      clientMessageId: params.clientMessageId,
      type: params.type,
      replyToMessageId: params.replyToMessageId,
      attachmentIds: params.attachmentIds,
      metadata: params.metadata,
      linkPreview: params.linkPreview,
    });

    return {
      message,
      conversationId,
      created: !existingConversation,
    };
  }

  async retryMessage(messageId: string): Promise<Message> {
    await delay(300);
    for (const [conversationId, messages] of Object.entries(
      mockDataStore.messagesByConversation
    )) {
      const message = messages.find((item) => item.id === messageId);
      if (message) {
        const retried = { ...message, status: "sent" as const };
        mockDataStore.messagesByConversation[conversationId] = messages.map(
          (item) => (item.id === messageId ? retried : item)
        );
        return { ...retried };
      }
    }
    throw new Error("Message not found");
  }

  async deleteMessage(messageId: string, conversationId: string): Promise<void> {
    await delay(200);
    const messages = mockDataStore.messagesByConversation[conversationId] ?? [];
    mockDataStore.messagesByConversation[conversationId] = messages.map((message) =>
      message.id === messageId
        ? { ...message, deleted: true, content: "" }
        : message
    );
  }

  async starMessage(messageId: string, conversationId: string): Promise<Message> {
    await delay(200);
    return this.setFlag(messageId, conversationId, "starred", true);
  }

  async unstarMessage(messageId: string, conversationId: string): Promise<Message> {
    await delay(200);
    return this.setFlag(messageId, conversationId, "starred", false);
  }

  async pinMessage(messageId: string, conversationId: string): Promise<Message> {
    await delay(200);
    return this.setFlag(messageId, conversationId, "pinned", true);
  }

  async unpinMessage(messageId: string, conversationId: string): Promise<Message> {
    await delay(200);
    return this.setFlag(messageId, conversationId, "pinned", false);
  }

  private setFlag(
    messageId: string,
    conversationId: string,
    flag: "starred" | "pinned",
    value: boolean
  ): Message {
    const messages = mockDataStore.messagesByConversation[conversationId] ?? [];
    const index = messages.findIndex((message) => message.id === messageId);
    if (index === -1) {
      throw new Error("Message not found");
    }
    const updated = { ...messages[index], [flag]: value };
    messages[index] = updated;
    return { ...updated };
  }

  private findMessage(
    conversationId: string,
    messageId: string
  ): Message | undefined {
    return (mockDataStore.messagesByConversation[conversationId] ?? []).find(
      (message) => message.id === messageId
    );
  }
}

export const mockMessageService = new MockMessageService();
