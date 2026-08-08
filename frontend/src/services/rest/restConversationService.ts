import type { ConversationService } from "../conversationService";
import type { Conversation, PresenceState, User } from "../../types/chat";
import { API_ENDPOINTS } from "../api/endpoints";
import { httpGet, httpPatch, httpPost } from "../api/httpClient";
import type {
  ApiConversationDto,
  ApiConversationsResponse,
  ApiMuteRequest,
} from "../api/apiTypes";
import {
  extractUnreadCounts,
  transformConversation,
  transformConversations,
  transformUsers,
} from "../api/transformers";
import { getErrorMessage } from "../api/apiError";
import { restPresenceService } from "./restPresenceService";
class RestConversationService implements ConversationService {
  private cachedUsers: Record<string, User> = {};
  private cachedUnread: Record<string, number> = {};
  private cachedConversations: Conversation[] = [];

  async loadUsers(): Promise<Record<string, User>> {
    if (Object.keys(this.cachedUsers).length > 0) {
      return { ...this.cachedUsers };
    }
    await this.refreshConversationBundle();
    return { ...this.cachedUsers };
  }

  async loadPresence(): Promise<PresenceState> {
    // initializeChat loads presence in parallel with conversations — ensure
    // the inbox bundle is warm so we know which peers to query.
    if (
      this.cachedConversations.length === 0 ||
      Object.keys(this.cachedUsers).length === 0
    ) {
      await this.refreshConversationBundle();
    }
    const memberIds = new Set<string>(Object.keys(this.cachedUsers));
    for (const conversation of this.cachedConversations) {
      for (const memberId of conversation.memberIds) {
        memberIds.add(memberId);
      }
    }
    if (memberIds.size === 0) {
      return {};
    }
    try {
      return await restPresenceService.getPresenceForUsers(Array.from(memberIds));
    } catch {
      return {};
    }
  }

  async loadConversations(): Promise<Conversation[]> {
    const conversations = await this.refreshConversationBundle();
    return conversations;
  }

  async getConversation(conversationId: string): Promise<Conversation> {
    try {
      const dto = await httpGet<ApiConversationDto>(
        API_ENDPOINTS.conversations.byId(conversationId)
      );
      return transformConversation(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to load conversation"));
    }
  }

  async markConversationAsRead(
    conversationId: string,
    currentUserId: string
  ): Promise<void> {
    void currentUserId;
    try {
      await httpPost(API_ENDPOINTS.conversations.read(conversationId));
      this.cachedUnread[conversationId] = 0;
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to mark conversation as read"));
    }
  }

  async getUnreadCounts(): Promise<Record<string, number>> {
    if (Object.keys(this.cachedUnread).length > 0) {
      return { ...this.cachedUnread };
    }
    await this.refreshConversationBundle();
    return { ...this.cachedUnread };
  }

  async muteConversation(
    conversationId: string,
    muted: boolean
  ): Promise<Conversation> {
    try {
      const body: ApiMuteRequest = { muted };
      const dto = await httpPatch<ApiConversationDto>(
        API_ENDPOINTS.conversations.mute(conversationId),
        body
      );
      return transformConversation(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to update mute state"));
    }
  }

  private async refreshConversationBundle(): Promise<Conversation[]> {
    try {
      const data = await httpGet<ApiConversationsResponse>(
        API_ENDPOINTS.conversations.list
      );
      this.cachedUsers = transformUsers(data.users);
      this.cachedUnread = extractUnreadCounts(data.conversations);
      this.cachedConversations = transformConversations(data.conversations);
      return this.cachedConversations;
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to load conversations"));
    }
  }
}

export const restConversationService = new RestConversationService();
