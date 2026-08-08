/**
 * Search API DTOs — messages, users, groups, conversations.
 */

export type SearchSort = "newest" | "oldest" | "relevance";

export type SearchMessageTypeFilter =
  | "text"
  | "link"
  | "system"
  | "image"
  | "document"
  | "voice"
  | "video"
  | "location"
  | "contact"
  | "sticker";

export type SearchMessageHitDto = {
  id: string;
  conversationId: string;
  senderId: string;
  type: string;
  content: string;
  snippet: string;
  createdAt: string;
  rank: number | null;
};

export type SearchMessagesPageDto = {
  results: SearchMessageHitDto[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type SearchUserHitDto = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  about: string | null;
  rank: number | null;
};

export type SearchUsersPageDto = {
  results: SearchUserHitDto[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type SearchGroupHitDto = {
  id: string;
  name: string;
  avatarUrl: string | null;
  description: string | null;
  memberCount: number;
  rank: number | null;
};

export type SearchGroupsPageDto = {
  results: SearchGroupHitDto[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type SearchConversationHitDto = {
  id: string;
  type: "direct" | "group";
  name: string;
  avatarUrl: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  rank: number | null;
};

export type SearchConversationsPageDto = {
  results: SearchConversationHitDto[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type MessageSearchFilters = {
  q: string;
  conversationId?: string;
  senderId?: string;
  messageType?: SearchMessageTypeFilter;
  /** When true, include SYSTEM messages even if messageType unset. */
  includeSystem?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  hasAttachments?: boolean;
  hasLinks?: boolean;
  sort: SearchSort;
  cursor?: string;
  limit: number;
};

export type DirectorySearchFilters = {
  q: string;
  cursor?: string;
  limit: number;
  sort: SearchSort;
};
