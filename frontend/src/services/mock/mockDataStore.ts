import type { Conversation, Message, PresenceState, User } from "../../types/chat";
import {
  MOCK_CONVERSATIONS,
  MOCK_MESSAGES_BY_CONVERSATION,
  MOCK_PRESENCE,
  MOCK_UNREAD_COUNTS,
  MOCK_USERS,
} from "../../data/mockChatData";

function cloneMessages(messages: Message[]): Message[] {
  return messages.map((message) => ({ ...message }));
}

function cloneConversations(conversations: Conversation[]): Conversation[] {
  return conversations.map((conversation) => ({ ...conversation }));
}

class MockDataStore {
  users: Record<string, User> = { ...MOCK_USERS };

  presence: PresenceState = { ...MOCK_PRESENCE };

  conversations: Conversation[] = cloneConversations(MOCK_CONVERSATIONS);

  messagesByConversation: Record<string, Message[]> = Object.fromEntries(
    Object.entries(MOCK_MESSAGES_BY_CONVERSATION).map(([id, messages]) => [
      id,
      cloneMessages(messages),
    ])
  );

  unreadCounts: Record<string, number> = { ...MOCK_UNREAD_COUNTS };

  shouldFailNextSend = false;

  reset(): void {
    this.users = { ...MOCK_USERS };
    this.presence = { ...MOCK_PRESENCE };
    this.conversations = cloneConversations(MOCK_CONVERSATIONS);
    this.messagesByConversation = Object.fromEntries(
      Object.entries(MOCK_MESSAGES_BY_CONVERSATION).map(([id, messages]) => [
        id,
        cloneMessages(messages),
      ])
    );
    this.unreadCounts = { ...MOCK_UNREAD_COUNTS };
    this.shouldFailNextSend = false;
  }
}

export const mockDataStore = new MockDataStore();

export function generateInviteCode(): string {
  return `invite-${Math.random().toString(36).slice(2, 10)}`;
}

export function generateConversationId(): string {
  return `conv-${Date.now()}`;
}

export function generateMessageId(conversationId: string): string {
  return `msg-${conversationId}-${Date.now()}`;
}
