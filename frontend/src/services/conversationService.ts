import type { Conversation, PresenceState, User } from "../types/chat";

export interface ConversationService {
  loadUsers(): Promise<Record<string, User>>;
  /**
   * Presence is mock-/transport-driven today.
   * REST adapters may return empty / unknown until WebSocket presence lands.
   */
  loadPresence(): Promise<PresenceState>;
  loadConversations(): Promise<Conversation[]>;
  getConversation?(conversationId: string): Promise<Conversation>;
  markConversationAsRead(
    conversationId: string,
    currentUserId: string
  ): Promise<void>;
  getUnreadCounts(): Promise<Record<string, number>>;
  muteConversation?(conversationId: string, muted: boolean): Promise<Conversation>;
}
