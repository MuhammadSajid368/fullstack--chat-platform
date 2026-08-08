import type {
  DirectorySearchFilters,
  MessageSearchFilters,
  SearchConversationHitDto,
  SearchGroupHitDto,
  SearchMessageHitDto,
  SearchUserHitDto,
} from "@modules/search/dto/SearchDto.js";

export type MessageSearchRow = SearchMessageHitDto & {
  createdAtDate: Date;
  rankValue: number | null;
};

export type UserSearchRow = SearchUserHitDto & {
  createdAtDate: Date;
  rankValue: number | null;
};

export type GroupSearchRow = SearchGroupHitDto & {
  createdAtDate: Date;
  rankValue: number | null;
};

export type ConversationSearchRow = SearchConversationHitDto & {
  createdAtDate: Date | null;
  rankValue: number | null;
};

export interface ISearchRepository {
  isActiveMember(
    userId: string,
    conversationId: string
  ): Promise<boolean>;

  searchMessages(
    viewerId: string,
    filters: MessageSearchFilters
  ): Promise<MessageSearchRow[]>;

  searchUsers(
    viewerId: string,
    filters: DirectorySearchFilters
  ): Promise<UserSearchRow[]>;

  searchGroups(
    viewerId: string,
    filters: DirectorySearchFilters
  ): Promise<GroupSearchRow[]>;

  searchConversations(
    viewerId: string,
    filters: DirectorySearchFilters
  ): Promise<ConversationSearchRow[]>;
}
