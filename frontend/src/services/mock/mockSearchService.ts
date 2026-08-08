import type {
  SearchDirectoryParams,
  SearchMessagesParams,
  SearchService,
} from "../searchService";
import { mockDataStore } from "./mockDataStore";

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

class MockSearchService implements SearchService {
  async searchMessages(params: SearchMessagesParams) {
    await delay(200);
    const query = params.q.trim().toLowerCase();
    const results = Object.values(mockDataStore.messagesByConversation)
      .flat()
      .filter((message) => message.content.toLowerCase().includes(query))
      .map((message) => ({
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        type: message.type,
        content: message.content,
        snippet: message.content,
        createdAt: message.createdAt,
      }));
    return { results, nextCursor: null, hasMore: false };
  }

  async searchUsers(params: SearchDirectoryParams) {
    await delay(200);
    const query = params.q.trim().toLowerCase();
    const results = Object.values(mockDataStore.users)
      .filter((user) => user.name.toLowerCase().includes(query))
      .map((user) => ({
        id: user.id,
        name: user.name,
        email: `${user.id}@mock.local`,
        avatar: user.avatar,
        about: user.about,
      }));
    return { results, nextCursor: null, hasMore: false };
  }

  async searchGroups(params: SearchDirectoryParams) {
    await delay(200);
    const query = params.q.trim().toLowerCase();
    const results = mockDataStore.conversations
      .filter(
        (conversation) =>
          conversation.type === "group" &&
          conversation.name.toLowerCase().includes(query)
      )
      .map((conversation) => ({
        id: conversation.id,
        name: conversation.name,
        avatar: conversation.avatar,
        description: conversation.description,
        memberCount: conversation.memberIds.length,
      }));
    return { results, nextCursor: null, hasMore: false };
  }

  async searchConversations(params: SearchDirectoryParams) {
    await delay(200);
    const query = params.q.trim().toLowerCase();
    const results = mockDataStore.conversations
      .filter((conversation) => conversation.name.toLowerCase().includes(query))
      .map((conversation) => ({
        id: conversation.id,
        type: conversation.type,
        name: conversation.name,
        avatar: conversation.avatar,
        lastMessagePreview: conversation.lastMessagePreview,
        lastMessageAt: conversation.lastMessageAt,
      }));
    return { results, nextCursor: null, hasMore: false };
  }
}

export const mockSearchService = new MockSearchService();
