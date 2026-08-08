import type { ConversationType } from "../types/chat";

export interface SearchMessagesParams {
  q: string;
  conversationId?: string;
  senderId?: string;
  messageType?: string;
  cursor?: string;
  limit?: number;
}

export interface SearchDirectoryParams {
  q: string;
  cursor?: string;
  limit?: number;
}

export interface SearchMessageHit {
  id: string;
  conversationId: string;
  senderId: string;
  type: string;
  content: string;
  snippet: string;
  createdAt: string;
}

export interface SearchUserHit {
  id: string;
  name: string;
  email: string;
  avatar: string;
  about?: string | null;
}

export interface SearchGroupHit {
  id: string;
  name: string;
  avatar: string;
  description?: string | null;
  memberCount: number;
}

export interface SearchConversationHit {
  id: string;
  type: ConversationType;
  name: string;
  avatar: string;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
}

export interface SearchPage<T> {
  results: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface SearchService {
  searchMessages(params: SearchMessagesParams): Promise<SearchPage<SearchMessageHit>>;
  searchUsers(params: SearchDirectoryParams): Promise<SearchPage<SearchUserHit>>;
  searchGroups(params: SearchDirectoryParams): Promise<SearchPage<SearchGroupHit>>;
  searchConversations(
    params: SearchDirectoryParams
  ): Promise<SearchPage<SearchConversationHit>>;
}
