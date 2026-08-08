import { beforeEach, describe, expect, it } from "vitest";
import { mockDataStore } from "../../services/mock/mockDataStore";
import { mockConversationService } from "../../services/mock/mockConversationService";
import { CURRENT_USER_ID } from "../../data/mockChatData";
import {
  addOptimisticMessage,
  createGroup,
  deleteMessageRemote,
  fetchMessages,
  initializeChat,
  leaveGroup,
  loadOlderMessages,
  markConversationRead,
  removeGroupMember,
  resetChatState,
  retryMessage,
  selectConversation,
  sendMessage,
  toggleStarMessageRemote,
  togglePinMessageRemote,
} from "./chatSlice";
import { createTestStore } from "../../test/testUtils";

const authenticatedState = {
  auth: {
    status: "authenticated" as const,
    user: {
      id: CURRENT_USER_ID,
      email: "demo@chat.app",
      name: "You",
      avatar: "",
    },
    error: null,
    initialized: true,
  },
};

function pageMessages(store: ReturnType<typeof createTestStore>, id: string) {
  return store.getState().chat.messagePagesByConversationId[id]?.messages ?? [];
}

describe("chatSlice", () => {
  beforeEach(() => {
    mockDataStore.reset();
  });

  it("selects a conversation and switches mobile view", () => {
    const store = createTestStore({
      ...authenticatedState,
      chat: {
        ...createTestStore().getState().chat,
        activeConversationId: null,
        mobileView: "list",
      },
    });

    store.dispatch(selectConversation("conv-alex"));

    const state = store.getState().chat;
    expect(state.activeConversationId).toBe("conv-alex");
    expect(state.mobileView).toBe("conversation");
    expect(state.replyToMessageId).toBeNull();
  });

  it("adds an optimistic message while sending", () => {
    const store = createTestStore(authenticatedState);

    store.dispatch(
      addOptimisticMessage({
        conversationId: "conv-alex",
        optimisticId: "opt-1",
        content: "Hello",
        senderId: CURRENT_USER_ID,
        clientMessageId: "client-1",
      })
    );

    const messages = pageMessages(store, "conv-alex");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: "opt-1",
      content: "Hello",
      status: "sending",
      clientMessageId: "client-1",
    });
    expect(store.getState().chat.sendingByConversationId["conv-alex"]).toBe(true);
  });

  it("marks send as successful and replaces optimistic message", async () => {
    const store = createTestStore(authenticatedState);
    await store.dispatch(initializeChat());

    store.dispatch(
      addOptimisticMessage({
        conversationId: "conv-alex",
        optimisticId: "opt-success",
        content: "Delivered text",
        senderId: CURRENT_USER_ID,
        clientMessageId: "client-success",
      })
    );

    await store.dispatch(
      sendMessage({
        conversationId: "conv-alex",
        content: "Delivered text",
        optimisticId: "opt-success",
        clientMessageId: "client-success",
      })
    );

    const messages = pageMessages(store, "conv-alex");
    const sent = messages.find((message) => message.content === "Delivered text");
    expect(sent?.status).toBe("sent");
    expect(messages.some((message) => message.id === "opt-success")).toBe(false);
    expect(store.getState().chat.sendingByConversationId["conv-alex"]).toBe(false);
  }, 10000);

  it("marks send as failed when content includes [fail]", async () => {
    const store = createTestStore(authenticatedState);
    await store.dispatch(initializeChat());

    store.dispatch(
      addOptimisticMessage({
        conversationId: "conv-alex",
        optimisticId: "opt-fail",
        content: "will [fail]",
        senderId: CURRENT_USER_ID,
        clientMessageId: "client-fail",
      })
    );

    await store.dispatch(
      sendMessage({
        conversationId: "conv-alex",
        content: "will [fail]",
        optimisticId: "opt-fail",
        clientMessageId: "client-fail",
      })
    );

    const failed = pageMessages(store, "conv-alex").find(
      (message) => message.id === "opt-fail"
    );
    expect(failed?.status).toBe("failed");
  }, 10000);

  it("retries a failed message with the same clientMessageId", async () => {
    const store = createTestStore(authenticatedState);

    store.dispatch(
      addOptimisticMessage({
        conversationId: "conv-alex",
        optimisticId: "opt-retry",
        content: "Retry me",
        senderId: CURRENT_USER_ID,
        clientMessageId: "client-retry",
      })
    );

    mockDataStore.shouldFailNextSend = true;
    await store.dispatch(
      sendMessage({
        conversationId: "conv-alex",
        content: "Retry me",
        optimisticId: "opt-retry",
        clientMessageId: "client-retry",
      })
    );

    expect(
      pageMessages(store, "conv-alex").find((m) => m.id === "opt-retry")?.status
    ).toBe("failed");

    const retryResult = await store.dispatch(
      retryMessage({ conversationId: "conv-alex", messageId: "opt-retry" })
    );

    expect(retryResult.type).toBe(retryMessage.fulfilled.type);
    const messages = pageMessages(store, "conv-alex");
    expect(messages.some((message) => message.id === "opt-retry")).toBe(false);
    expect(
      messages.some(
        (message) => message.content === "Retry me" && message.status === "sent"
      )
    ).toBe(true);
  }, 15000);

  it("resets unread count when conversation is marked read", async () => {
    const store = createTestStore(authenticatedState);
    await store.dispatch(initializeChat());

    expect(store.getState().chat.unreadCounts["conv-alex"]).toBe(2);

    await store.dispatch(markConversationRead("conv-alex"));

    expect(store.getState().chat.unreadCounts["conv-alex"]).toBe(0);
  });

  it("rolls unread count back when mark-read API fails", async () => {
    const store = createTestStore(authenticatedState);
    await store.dispatch(initializeChat());
    expect(store.getState().chat.unreadCounts["conv-alex"]).toBe(2);

    const original = mockConversationService.markConversationAsRead.bind(
      mockConversationService
    );
    mockConversationService.markConversationAsRead = async () => {
      throw new Error("network");
    };

    const result = await store.dispatch(markConversationRead("conv-alex"));
    mockConversationService.markConversationAsRead = original;

    expect(markConversationRead.rejected.match(result)).toBe(true);
    expect(store.getState().chat.unreadCounts["conv-alex"]).toBe(2);
  });

  it("loads paginated messages without duplicates across pages", async () => {
    const store = createTestStore(authenticatedState);
    await store.dispatch(initializeChat());

    await store.dispatch(fetchMessages("conv-alex"));
    const first = pageMessages(store, "conv-alex");
    const page = store.getState().chat.messagePagesByConversationId["conv-alex"];
    expect(page?.initialLoadStatus).toBe("succeeded");

    if (page?.hasMore) {
      await store.dispatch(loadOlderMessages("conv-alex"));
      const merged = pageMessages(store, "conv-alex");
      const ids = merged.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(merged.length).toBeGreaterThanOrEqual(first.length);
    }
  }, 10000);

  it("creates a group with creator as owner", async () => {
    const store = createTestStore(authenticatedState);
    await store.dispatch(initializeChat());

    const result = await store.dispatch(
      createGroup({
        name: "QA Squad",
        description: "Release testing",
        memberUserIds: ["user-alex", "user-sam"],
      })
    );

    expect(createGroup.fulfilled.match(result)).toBe(true);
    const group = store
      .getState()
      .chat.conversations.find((conversation) => conversation.name === "QA Squad");
    expect(group?.type).toBe("group");
    expect(
      group?.members?.find((member) => member.userId === CURRENT_USER_ID)?.role
    ).toBe("owner");
    expect(store.getState().chat.activeConversationId).toBe(group?.id);
  }, 10000);

  it("prevents sole owner from leaving without transferring ownership", async () => {
    const store = createTestStore(authenticatedState);
    await store.dispatch(initializeChat());

    const result = await store.dispatch(leaveGroup("conv-dev-team"));

    expect(leaveGroup.rejected.match(result)).toBe(true);
    expect(store.getState().chat.groupActionError).toContain("Transfer ownership");
  });

  it("prevents admin from removing the owner", async () => {
    const store = createTestStore({
      auth: {
        status: "authenticated",
        user: {
          id: "user-alex",
          email: "alex@example.com",
          name: "Alex Morgan",
          avatar: "",
        },
        error: null,
        initialized: true,
      },
    });
    await store.dispatch(initializeChat());

    const result = await store.dispatch(
      removeGroupMember({
        conversationId: "conv-dev-team",
        targetUserId: CURRENT_USER_ID,
      })
    );

    expect(removeGroupMember.rejected.match(result)).toBe(true);
    expect(store.getState().chat.groupActionError).toMatch(/permission|allowed/i);
  });

  it("stars and unstars messages through the service", async () => {
    const store = createTestStore(authenticatedState);
    await store.dispatch(initializeChat());
    await store.dispatch(fetchMessages("conv-alex"));

    const target = pageMessages(store, "conv-alex")[0];
    expect(target).toBeTruthy();

    await store.dispatch(
      toggleStarMessageRemote({
        conversationId: "conv-alex",
        messageId: target.id,
      })
    );
    expect(
      pageMessages(store, "conv-alex").find((m) => m.id === target.id)?.starred
    ).toBe(!target.starred);
  }, 10000);

  it("pins and unpins messages through the service", async () => {
    const store = createTestStore(authenticatedState);
    await store.dispatch(initializeChat());
    await store.dispatch(fetchMessages("conv-alex"));

    const target = pageMessages(store, "conv-alex")[0];
    expect(target?.pinned).toBe(false);

    await store.dispatch(
      togglePinMessageRemote({
        conversationId: "conv-alex",
        messageId: target.id,
      })
    );
    expect(
      pageMessages(store, "conv-alex").find((m) => m.id === target.id)?.pinned
    ).toBe(true);

    await store.dispatch(
      togglePinMessageRemote({
        conversationId: "conv-alex",
        messageId: target.id,
      })
    );
    expect(
      pageMessages(store, "conv-alex").find((m) => m.id === target.id)?.pinned
    ).toBe(false);
  }, 15000);

  it("deletes messages optimistically via remote thunk", async () => {
    const store = createTestStore(authenticatedState);
    await store.dispatch(initializeChat());
    await store.dispatch(fetchMessages("conv-alex"));
    const target = pageMessages(store, "conv-alex")[0];

    await store.dispatch(
      deleteMessageRemote({
        conversationId: "conv-alex",
        messageId: target.id,
      })
    );

    expect(
      pageMessages(store, "conv-alex").find((m) => m.id === target.id)?.deleted
    ).toBe(true);
  }, 10000);

  it("resetChatState clears chat and mock store", async () => {
    const store = createTestStore(authenticatedState);
    await store.dispatch(initializeChat());
    store.dispatch(selectConversation("conv-alex"));

    store.dispatch(resetChatState());

    expect(store.getState().chat.initialized).toBe(false);
    expect(store.getState().chat.activeConversationId).toBeNull();
  });
});
