import type { ConversationService } from "../conversationService";
import type { Conversation, PresenceState, User } from "../../types/chat";
import { mockDataStore } from "./mockDataStore";

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

class MockConversationService implements ConversationService {
  async loadUsers(): Promise<Record<string, User>> {
    await delay(200);
    return { ...mockDataStore.users };
  }

  async loadPresence(): Promise<PresenceState> {
    await delay(150);
    return { ...mockDataStore.presence };
  }

  async loadConversations(): Promise<Conversation[]> {
    await delay(400);
    return mockDataStore.conversations.map((conversation) => ({ ...conversation }));
  }

  async markConversationAsRead(
    conversationId: string,
    currentUserId: string
  ): Promise<void> {
    await delay(100);
    mockDataStore.unreadCounts[conversationId] = 0;
    const messages = mockDataStore.messagesByConversation[conversationId] ?? [];
    mockDataStore.messagesByConversation[conversationId] = messages.map(
      (message) =>
        message.senderId !== currentUserId && message.status !== "read"
          ? { ...message, status: "read" }
          : message
    );
  }

  async getUnreadCounts(): Promise<Record<string, number>> {
    await delay(100);
    return { ...mockDataStore.unreadCounts };
  }
}

export const mockConversationService = new MockConversationService();
