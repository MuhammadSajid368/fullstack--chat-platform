import type {
  DirectorySearchFilters,
  MessageSearchFilters,
  SearchConversationsPageDto,
  SearchGroupsPageDto,
  SearchMessagesPageDto,
  SearchUsersPageDto,
} from "@modules/search/dto/SearchDto.js";

export interface ISearchService {
  searchMessages(
    viewerId: string,
    filters: MessageSearchFilters
  ): Promise<SearchMessagesPageDto>;

  searchUsers(
    viewerId: string,
    filters: DirectorySearchFilters
  ): Promise<SearchUsersPageDto>;

  searchGroups(
    viewerId: string,
    filters: DirectorySearchFilters
  ): Promise<SearchGroupsPageDto>;

  searchConversations(
    viewerId: string,
    filters: DirectorySearchFilters
  ): Promise<SearchConversationsPageDto>;
}
