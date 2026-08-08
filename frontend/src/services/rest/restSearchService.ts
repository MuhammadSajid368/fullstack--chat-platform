import type {
  SearchDirectoryParams,
  SearchMessagesParams,
  SearchService,
} from "../searchService";
import { API_ENDPOINTS } from "../api/endpoints";
import { httpGet } from "../api/httpClient";
import type {
  ApiSearchConversationsPageResponse,
  ApiSearchGroupsPageResponse,
  ApiSearchMessagesPageResponse,
  ApiSearchUsersPageResponse,
} from "../api/apiTypes";
import { getErrorMessage } from "../api/apiError";

class RestSearchService implements SearchService {
  async searchMessages(params: SearchMessagesParams) {
    try {
      const data = await httpGet<ApiSearchMessagesPageResponse>(
        API_ENDPOINTS.search.messages,
        { params }
      );
      return {
        results: data.results,
        nextCursor: data.nextCursor,
        hasMore: Boolean(data.hasMore),
      };
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to search messages"));
    }
  }

  async searchUsers(params: SearchDirectoryParams) {
    try {
      const data = await httpGet<ApiSearchUsersPageResponse>(
        API_ENDPOINTS.search.users,
        { params }
      );
      return {
        results: data.results.map((hit) => ({
          id: hit.id,
          name: hit.name,
          email: hit.email,
          avatar: hit.avatarUrl ?? "",
          about: hit.about,
        })),
        nextCursor: data.nextCursor,
        hasMore: Boolean(data.hasMore),
      };
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to search users"));
    }
  }

  async searchGroups(params: SearchDirectoryParams) {
    try {
      const data = await httpGet<ApiSearchGroupsPageResponse>(
        API_ENDPOINTS.search.groups,
        { params }
      );
      return {
        results: data.results.map((hit) => ({
          id: hit.id,
          name: hit.name,
          avatar: hit.avatarUrl ?? "",
          description: hit.description,
          memberCount: hit.memberCount,
        })),
        nextCursor: data.nextCursor,
        hasMore: Boolean(data.hasMore),
      };
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to search groups"));
    }
  }

  async searchConversations(params: SearchDirectoryParams) {
    try {
      const data = await httpGet<ApiSearchConversationsPageResponse>(
        API_ENDPOINTS.search.conversations,
        { params }
      );
      return {
        results: data.results.map((hit) => ({
          id: hit.id,
          type: hit.type,
          name: hit.name,
          avatar: hit.avatarUrl ?? "",
          lastMessagePreview: hit.lastMessagePreview,
          lastMessageAt: hit.lastMessageAt,
        })),
        nextCursor: data.nextCursor,
        hasMore: Boolean(data.hasMore),
      };
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to search conversations"));
    }
  }
}

export const restSearchService = new RestSearchService();
