import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { RootReducerState } from "../rootReducer";
import {
  getConversationService,
  getGroupService,
  getMessageService,
} from "../../services/serviceRegistry";
import { isMockMode } from "../../config/env";
import { mockDataStore } from "../../services/mock/mockDataStore";
import { ApiError, getErrorMessage } from "../../services/api/apiError";
import { mergeMessagesById } from "../../services/api/transformers";
import type {
  Conversation,
  ConversationMessagesState,
  Message,
  MessageStatus,
  MessageType,
  MobileChatView,
  PresenceState,
  User,
} from "../../types/chat";
import { createEmptyMessagesState } from "../../types/chat";

/** Local-only draft DM before the first message creates the server conversation. */
export const PENDING_DIRECT_PREFIX = "pending-direct:";

export function pendingDirectConversationId(peerUserId: string): string {
  return `${PENDING_DIRECT_PREFIX}${peerUserId}`;
}

export function parsePendingDirectPeerId(
  conversationId: string
): string | null {
  if (!conversationId.startsWith(PENDING_DIRECT_PREFIX)) {
    return null;
  }
  return conversationId.slice(PENDING_DIRECT_PREFIX.length) || null;
}

export interface ChatState {
  users: Record<string, User>;
  presence: PresenceState;
  conversations: Conversation[];
  messagePagesByConversationId: Record<string, ConversationMessagesState>;
  activeConversationId: string | null;
  draftsByConversationId: Record<string, string>;
  replyToMessageId: string | null;
  unreadCounts: Record<string, number>;
  selectedMessageIds: string[];
  conversationsLoading: boolean;
  conversationsError: string | null;
  sendingByConversationId: Record<string, boolean>;
  groupActionError: string | null;
  groupFieldErrors: Record<string, string> | null;
  /** Snapshots for optimistic mark-read rollback. */
  unreadRollbackByConversationId: Record<string, number>;
  /** Message snapshots for optimistic delete/star rollback. */
  messageActionSnapshots: Record<string, Message>;
  /** userIds currently typing per conversation */
  typingByConversationId: Record<string, string[]>;
  mobileView: MobileChatView;
  initialized: boolean;
}

const initialState: ChatState = {
  users: {},
  presence: {},
  conversations: [],
  messagePagesByConversationId: {},
  activeConversationId: null,
  draftsByConversationId: {},
  replyToMessageId: null,
  unreadCounts: {},
  selectedMessageIds: [],
  conversationsLoading: false,
  conversationsError: null,
  sendingByConversationId: {},
  groupActionError: null,
  groupFieldErrors: null,
  unreadRollbackByConversationId: {},
  messageActionSnapshots: {},
  typingByConversationId: {},
  mobileView: "list",
  initialized: false,
};

/** Mock-only delivery/read simulation statuses. Not advanced in REST mode. */
const statusProgression: MessageStatus[] = ["sent", "delivered", "read"];

function getCurrentUserId(state: RootReducerState): string {
  return state.auth.user?.id ?? "user-me";
}

function getPage(
  state: ChatState,
  conversationId: string
): ConversationMessagesState {
  return (
    state.messagePagesByConversationId[conversationId] ??
    createEmptyMessagesState()
  );
}

function setPageMessages(
  state: ChatState,
  conversationId: string,
  updater: (page: ConversationMessagesState) => ConversationMessagesState
): void {
  const current = getPage(state, conversationId);
  state.messagePagesByConversationId[conversationId] = updater({
    ...current,
    messages: [...current.messages],
  });
}

function updateConversationPreview(
  state: ChatState,
  conversationId: string,
  preview: string,
  createdAt: string
): void {
  const conversation = state.conversations.find(
    (item) => item.id === conversationId
  );
  if (!conversation) {
    return;
  }
  const previousAt = Date.parse(conversation.lastMessageAt || "");
  const nextAt = Date.parse(createdAt || "");
  // Keep newer preview; allow first write when existing timestamp is invalid.
  if (
    Number.isFinite(previousAt) &&
    Number.isFinite(nextAt) &&
    nextAt < previousAt
  ) {
    return;
  }
  conversation.lastMessagePreview = preview;
  conversation.lastMessageAt = createdAt;
}

function replaceConversation(
  state: ChatState,
  conversation: Conversation
): void {
  const idx = state.conversations.findIndex((item) => item.id === conversation.id);
  if (idx >= 0) {
    state.conversations[idx] = conversation;
    return;
  }
  state.conversations = [conversation, ...state.conversations];
}

export const initializeChat = createAsyncThunk(
  "chat/initialize",
  async (_, { rejectWithValue }) => {
    try {
      const conversationService = getConversationService();
      const [users, presence, conversations, unreadCounts] = await Promise.all([
        conversationService.loadUsers(),
        conversationService.loadPresence(),
        conversationService.loadConversations(),
        conversationService.getUnreadCounts(),
      ]);
      return { users, presence, conversations, unreadCounts };
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to load conversations")
      );
    }
  }
);

export const fetchMessages = createAsyncThunk(
  "chat/fetchMessages",
  async (conversationId: string, { rejectWithValue }) => {
    if (parsePendingDirectPeerId(conversationId)) {
      return {
        conversationId,
        page: {
          messages: [] as Message[],
          nextCursor: null as string | null,
          hasMore: false,
        },
      };
    }
    try {
      const page = await getMessageService().loadMessages({ conversationId });
      return { conversationId, page };
    } catch (error) {
      return rejectWithValue({
        conversationId,
        message: getErrorMessage(error, "Failed to load messages"),
      });
    }
  }
);

export const loadOlderMessages = createAsyncThunk(
  "chat/loadOlderMessages",
  async (conversationId: string, { getState, rejectWithValue }) => {
    const state = getState() as RootReducerState;
    const page = state.chat.messagePagesByConversationId[conversationId];
    if (!page?.hasMore || !page.nextCursor) {
      return rejectWithValue({
        conversationId,
        message: "No older messages",
      });
    }

    try {
      const older = await getMessageService().loadMessages({
        conversationId,
        cursor: page.nextCursor,
      });
      return { conversationId, page: older };
    } catch (error) {
      return rejectWithValue({
        conversationId,
        message: getErrorMessage(error, "Failed to load older messages"),
      });
    }
  },
  {
    condition: (conversationId, { getState }) => {
      const state = getState() as RootReducerState;
      const page = state.chat.messagePagesByConversationId[conversationId];
      return Boolean(
        page?.hasMore &&
          page.nextCursor &&
          page.loadingOlderStatus !== "loading"
      );
    },
  }
);

export const markConversationRead = createAsyncThunk(
  "chat/markConversationRead",
  async (conversationId: string, { getState, rejectWithValue }) => {
    if (parsePendingDirectPeerId(conversationId)) {
      return { conversationId, previousUnread: 0 };
    }
    const state = getState() as RootReducerState;
    // Prefer rollback snapshot written by pending; fall back to current value.
    const previousUnread =
      state.chat.unreadRollbackByConversationId?.[conversationId] ??
      state.chat.unreadCounts[conversationId] ??
      0;
    try {
      await getConversationService().markConversationAsRead(
        conversationId,
        getCurrentUserId(state)
      );
      return { conversationId, previousUnread };
    } catch (error) {
      return rejectWithValue({
        conversationId,
        previousUnread,
        message: getErrorMessage(error, "Failed to mark as read"),
      });
    }
  }
);

export const sendMessage = createAsyncThunk(
  "chat/sendMessage",
  async (
    params: {
      conversationId: string;
      content: string;
      replyToMessageId?: string;
      optimisticId: string;
      clientMessageId: string;
      type?: MessageType;
      attachmentIds?: string[];
      metadata?: Record<string, unknown>;
    },
    { getState, rejectWithValue }
  ) => {
    const state = getState() as RootReducerState;
    const peerUserId = parsePendingDirectPeerId(params.conversationId);
    try {
      if (peerUserId) {
        const result = await getMessageService().sendDirectMessage({
          peerUserId,
          content: params.content,
          clientMessageId: params.clientMessageId,
          type: params.type ?? "text",
          attachmentIds: params.attachmentIds,
          metadata: params.metadata,
        });
        let conversation = null;
        try {
          conversation =
            (await getConversationService().getConversation?.(
              result.conversationId
            )) ?? null;
        } catch {
          conversation = null;
        }
        return {
          optimisticId: params.optimisticId,
          message: result.message,
          conversationId: result.conversationId,
          previousConversationId: params.conversationId,
          conversation,
        };
      }

      const message = await getMessageService().sendMessage({
        conversationId: params.conversationId,
        content: params.content,
        replyToMessageId: params.replyToMessageId,
        type: params.type,
        attachmentIds: params.attachmentIds,
        metadata: params.metadata,
        senderId: getCurrentUserId(state),
        clientMessageId: params.clientMessageId,
      });
      return {
        optimisticId: params.optimisticId,
        message,
        conversationId: params.conversationId,
      };
    } catch (error) {
      return rejectWithValue({
        optimisticId: params.optimisticId,
        conversationId: params.conversationId,
        message: getErrorMessage(error, "Failed to send message"),
      });
    }
  }
);

export const retryMessage = createAsyncThunk(
  "chat/retryMessage",
  async (
    params: { conversationId: string; messageId: string },
    { getState, rejectWithValue }
  ) => {
    const state = getState() as RootReducerState;
    const page = state.chat.messagePagesByConversationId[params.conversationId];
    const failedMessage = page?.messages.find(
      (message) => message.id === params.messageId
    );

    if (!failedMessage) {
      return rejectWithValue("Message cannot be retried");
    }

    try {
      let message: Message;
      const looksOptimistic =
        params.messageId.startsWith("optimistic-") ||
        params.messageId.startsWith("opt-") ||
        params.messageId === (failedMessage.clientMessageId ?? "");
      if (!looksOptimistic) {
        message = await getMessageService().retryMessage(params.messageId);
      } else {
        const clientMessageId =
          failedMessage.clientMessageId ?? failedMessage.id;
        message = await getMessageService().sendMessage({
          conversationId: params.conversationId,
          content: failedMessage.content,
          replyToMessageId: failedMessage.replyToMessageId,
          type: failedMessage.type,
          attachmentIds: failedMessage.attachmentIds,
          metadata: failedMessage.metadata,
          senderId: getCurrentUserId(state),
          clientMessageId,
        });
      }
      return {
        conversationId: params.conversationId,
        failedMessageId: params.messageId,
        message,
      };
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to retry message"));
    }
  },
  {
    condition: (params, { getState }) => {
      const state = getState() as RootReducerState;
      const page =
        state.chat.messagePagesByConversationId[params.conversationId];
      const failedMessage = page?.messages.find(
        (message) => message.id === params.messageId
      );
      return failedMessage?.status === "failed";
    },
  }
);

export const muteConversation = createAsyncThunk(
  "chat/muteConversation",
  async (
    params: { conversationId: string; muted: boolean },
    { rejectWithValue }
  ) => {
    try {
      const service = getConversationService();
      if (!service.muteConversation) {
        return rejectWithValue("Mute is not available");
      }
      return await service.muteConversation(
        params.conversationId,
        params.muted
      );
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to update mute state")
      );
    }
  }
);

export const updateGroup = createAsyncThunk(
  "chat/updateGroup",
  async (
    params: {
      conversationId: string;
      name?: string;
      description?: string | null;
    },
    { rejectWithValue }
  ) => {
    try {
      return await getGroupService().updateGroup(params);
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to update group")
      );
    }
  }
);

export const deleteGroup = createAsyncThunk(
  "chat/deleteGroup",
  async (conversationId: string, { rejectWithValue }) => {
    try {
      await getGroupService().deleteGroup(conversationId);
      return conversationId;
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to delete group")
      );
    }
  }
);

export const changeGroupMemberRole = createAsyncThunk(
  "chat/changeGroupMemberRole",
  async (
    params: {
      conversationId: string;
      targetUserId: string;
      role: "admin" | "member";
    },
    { getState, rejectWithValue }
  ) => {
    const state = getState() as RootReducerState;
    try {
      return await getGroupService().changeMemberRole({
        ...params,
        actorUserId: getCurrentUserId(state),
      });
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to change member role")
      );
    }
  }
);

export const openDirectChat = createAsyncThunk(
  "chat/openDirectChat",
  async (
    params: {
      peerUserId: string;
      name?: string;
      avatar?: string;
    },
    { getState, rejectWithValue }
  ) => {
    const peerUserId = params.peerUserId.trim();
    if (!peerUserId) {
      return rejectWithValue("User not found");
    }
    const state = getState() as RootReducerState;
    const currentUserId = getCurrentUserId(state);
    if (peerUserId === currentUserId) {
      return rejectWithValue("Cannot start a chat with yourself");
    }

    const existing = state.chat.conversations.find(
      (conversation) =>
        conversation.type === "direct" &&
        !parsePendingDirectPeerId(conversation.id) &&
        conversation.memberIds.includes(peerUserId)
    );

    return {
      peerUserId,
      name: params.name?.trim() || state.chat.users[peerUserId]?.name || "User",
      avatar:
        params.avatar ?? state.chat.users[peerUserId]?.avatar ?? "",
      existingConversationId: existing?.id ?? null,
      pendingConversationId: pendingDirectConversationId(peerUserId),
      currentUserId,
    };
  }
);

/** @deprecated Prefer openDirectChat — kept for any callers that still send a first message. */
export const startDirectConversation = createAsyncThunk(
  "chat/startDirectConversation",
  async (
    params: { peerUserId: string; content: string },
    { rejectWithValue }
  ) => {
    try {
      const clientMessageId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `client-${Date.now()}`;
      const result = await getMessageService().sendDirectMessage({
        peerUserId: params.peerUserId,
        content: params.content,
        clientMessageId,
        type: "text",
      });
      let conversation = null;
      try {
        conversation = await getConversationService().getConversation?.(
          result.conversationId
        );
      } catch {
        conversation = null;
      }
      return { ...result, conversation: conversation ?? null };
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to start conversation")
      );
    }
  }
);

export const deleteMessageRemote = createAsyncThunk(
  "chat/deleteMessageRemote",
  async (
    params: { conversationId: string; messageId: string },
    { getState, rejectWithValue }
  ) => {
    const state = getState() as RootReducerState;
    const previous =
      state.chat.messageActionSnapshots[params.messageId] ??
      state.chat.messagePagesByConversationId[params.conversationId]?.messages.find(
        (m) => m.id === params.messageId
      );
    if (!previous) {
      return rejectWithValue("Message not found");
    }

    try {
      await getMessageService().deleteMessage(
        params.messageId,
        params.conversationId
      );
      return params;
    } catch (error) {
      return rejectWithValue({
        ...params,
        previous,
        message: getErrorMessage(error, "Failed to delete message"),
      });
    }
  }
);

export const toggleStarMessageRemote = createAsyncThunk(
  "chat/toggleStarMessageRemote",
  async (
    params: { conversationId: string; messageId: string },
    { getState, rejectWithValue }
  ) => {
    const state = getState() as RootReducerState;
    const page = state.chat.messagePagesByConversationId[params.conversationId];
    // Pending already flipped `starred`; call the matching remote mutation.
    const current = page?.messages.find((m) => m.id === params.messageId);
    if (!current) {
      return rejectWithValue("Message not found");
    }

    const previousStarred = !current.starred;

    try {
      const message = current.starred
        ? await getMessageService().starMessage(
            params.messageId,
            params.conversationId
          )
        : await getMessageService().unstarMessage(
            params.messageId,
            params.conversationId
          );
      return { conversationId: params.conversationId, message };
    } catch (error) {
      return rejectWithValue({
        conversationId: params.conversationId,
        messageId: params.messageId,
        previousStarred,
        message: getErrorMessage(error, "Failed to update star"),
      });
    }
  }
);

export const togglePinMessageRemote = createAsyncThunk(
  "chat/togglePinMessageRemote",
  async (
    params: { conversationId: string; messageId: string },
    { getState, rejectWithValue }
  ) => {
    const state = getState() as RootReducerState;
    const page = state.chat.messagePagesByConversationId[params.conversationId];
    const current = page?.messages.find((m) => m.id === params.messageId);
    if (!current) {
      return rejectWithValue("Message not found");
    }

    const previousPinned = !current.pinned;

    try {
      const message = current.pinned
        ? await getMessageService().pinMessage(
            params.messageId,
            params.conversationId
          )
        : await getMessageService().unpinMessage(
            params.messageId,
            params.conversationId
          );
      return { conversationId: params.conversationId, message };
    } catch (error) {
      return rejectWithValue({
        conversationId: params.conversationId,
        messageId: params.messageId,
        previousPinned,
        message: getErrorMessage(error, "Failed to update pin"),
      });
    }
  }
);

export const createGroup = createAsyncThunk(
  "chat/createGroup",
  async (
    params: { name: string; description: string; memberUserIds: string[] },
    { getState, rejectWithValue }
  ) => {
    try {
      const state = getState() as RootReducerState;
      const conversation = await getGroupService().createGroup({
        name: params.name,
        description: params.description,
        memberUserIds: params.memberUserIds,
        createdByUserId: getCurrentUserId(state),
      });
      return conversation;
    } catch (error) {
      if (ApiError.isApiError(error)) {
        return rejectWithValue({
          message: error.toUserMessage(),
          fieldErrors: error.fieldErrors ?? null,
        });
      }
      return rejectWithValue({
        message: getErrorMessage(error, "Failed to create group"),
        fieldErrors: null,
      });
    }
  }
);

export const addGroupMembers = createAsyncThunk(
  "chat/addGroupMembers",
  async (
    params: { conversationId: string; memberUserIds: string[] },
    { getState, rejectWithValue }
  ) => {
    try {
      const state = getState() as RootReducerState;
      const conversation = await getGroupService().addMembers({
        conversationId: params.conversationId,
        memberUserIds: params.memberUserIds,
        actorUserId: getCurrentUserId(state),
      });
      return conversation;
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to add members")
      );
    }
  }
);

export const removeGroupMember = createAsyncThunk(
  "chat/removeGroupMember",
  async (
    params: { conversationId: string; targetUserId: string },
    { getState, rejectWithValue }
  ) => {
    try {
      const state = getState() as RootReducerState;
      const conversation = await getGroupService().removeMember({
        conversationId: params.conversationId,
        targetUserId: params.targetUserId,
        actorUserId: getCurrentUserId(state),
      });
      return conversation;
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to remove member")
      );
    }
  }
);

export const leaveGroup = createAsyncThunk(
  "chat/leaveGroup",
  async (conversationId: string, { getState, rejectWithValue }) => {
    try {
      const state = getState() as RootReducerState;
      await getGroupService().leaveGroup({
        conversationId,
        userId: getCurrentUserId(state),
      });
      return conversationId;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to leave group"));
    }
  }
);

export const transferGroupOwnership = createAsyncThunk(
  "chat/transferGroupOwnership",
  async (
    params: { conversationId: string; toUserId: string },
    { getState, rejectWithValue }
  ) => {
    try {
      const state = getState() as RootReducerState;
      const conversation = await getGroupService().transferOwnership({
        conversationId: params.conversationId,
        fromUserId: getCurrentUserId(state),
        toUserId: params.toUserId,
      });
      return conversation;
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to transfer ownership")
      );
    }
  }
);

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    resetChatState: () => {
      if (isMockMode()) {
        mockDataStore.reset();
      }
      return initialState;
    },
    selectConversation(state, action: PayloadAction<string>) {
      state.activeConversationId = action.payload;
      state.replyToMessageId = null;
      state.mobileView = "conversation";
      state.groupActionError = null;
    },
    clearActiveConversation(state) {
      state.activeConversationId = null;
      state.replyToMessageId = null;
    },
    setDraft(
      state,
      action: PayloadAction<{ conversationId: string; draft: string }>
    ) {
      state.draftsByConversationId[action.payload.conversationId] =
        action.payload.draft;
    },
    setReplyToMessage(
      state,
      action: PayloadAction<{ messageId: string | null }>
    ) {
      state.replyToMessageId = action.payload.messageId;
    },
    clearReply(state) {
      state.replyToMessageId = null;
    },
    setMobileView(state, action: PayloadAction<MobileChatView>) {
      state.mobileView = action.payload;
    },
    clearGroupActionError(state) {
      state.groupActionError = null;
      state.groupFieldErrors = null;
    },
    addOptimisticMessage(
      state,
      action: PayloadAction<{
        conversationId: string;
        optimisticId: string;
        content: string;
        replyToMessageId?: string;
        senderId: string;
        clientMessageId: string;
      }>
    ) {
      const {
        conversationId,
        optimisticId,
        content,
        replyToMessageId,
        senderId,
        clientMessageId,
      } = action.payload;
      const optimisticMessage: Message = {
        id: optimisticId,
        conversationId,
        senderId,
        type: replyToMessageId ? "reply" : "text",
        content,
        createdAt: new Date().toISOString(),
        status: "sending",
        starred: false,
        pinned: false,
        deleted: false,
        replyToMessageId,
        clientMessageId,
      };

      setPageMessages(state, conversationId, (page) => ({
        ...page,
        messages: [...page.messages, optimisticMessage],
        initialLoadStatus:
          page.initialLoadStatus === "idle"
            ? "succeeded"
            : page.initialLoadStatus,
      }));
      state.sendingByConversationId[conversationId] = true;
      updateConversationPreview(
        state,
        conversationId,
        content,
        optimisticMessage.createdAt
      );
    },
    /** Local-only soft delete used for immediate UI; prefer deleteMessageRemote. */
    deleteMessage(
      state,
      action: PayloadAction<{ conversationId: string; messageId: string }>
    ) {
      setPageMessages(state, action.payload.conversationId, (page) => ({
        ...page,
        messages: page.messages.map((message) =>
          message.id === action.payload.messageId
            ? { ...message, deleted: true, content: "" }
            : message
        ),
      }));
    },
    /** Local-only toggle; prefer toggleStarMessageRemote. */
    toggleStarMessage(
      state,
      action: PayloadAction<{ conversationId: string; messageId: string }>
    ) {
      setPageMessages(state, action.payload.conversationId, (page) => ({
        ...page,
        messages: page.messages.map((message) =>
          message.id === action.payload.messageId
            ? { ...message, starred: !message.starred }
            : message
        ),
      }));
    },
    advanceMessageStatus(
      state,
      action: PayloadAction<{
        conversationId: string;
        messageId: string;
        status: MessageStatus;
      }>
    ) {
      const nextStatus = action.payload.status;
      const nextIndex = statusProgression.indexOf(nextStatus);
      setPageMessages(state, action.payload.conversationId, (page) => ({
        ...page,
        messages: page.messages.map((message) => {
          if (message.id !== action.payload.messageId) {
            return message;
          }
          const currentIndex = statusProgression.indexOf(message.status);
          // Only move forward along sent → delivered → read (never regress).
          if (
            nextIndex === -1 ||
            (currentIndex !== -1 && nextIndex <= currentIndex)
          ) {
            return message;
          }
          return { ...message, status: nextStatus };
        }),
      }));
    },
    markMessagesReadByPeer(
      state,
      action: PayloadAction<{
        conversationId: string;
        readerUserId: string;
      }>
    ) {
      const { conversationId, readerUserId } = action.payload;
      setPageMessages(state, conversationId, (page) => ({
        ...page,
        messages: page.messages.map((message) => {
          if (message.senderId === readerUserId) {
            return message;
          }
          if (
            message.status === "sending" ||
            message.status === "failed" ||
            message.status === "read"
          ) {
            return message;
          }
          return { ...message, status: "read" as const };
        }),
      }));
    },
    upsertRealtimeMessage(
      state,
      action: PayloadAction<{
        conversationId: string;
        message: Message;
        currentUserId?: string;
      }>
    ) {
      const { conversationId, message, currentUserId } = action.payload;
      let inserted = false;
      setPageMessages(state, conversationId, (page) => {
        const byClient =
          message.clientMessageId != null
            ? page.messages.findIndex(
                (m) => m.clientMessageId === message.clientMessageId
              )
            : -1;
        const byId = page.messages.findIndex((m) => m.id === message.id);
        const idx = byClient >= 0 ? byClient : byId;
        inserted = idx < 0;
        const messages =
          idx >= 0
            ? page.messages.map((m, i) => (i === idx ? message : m))
            : mergeMessagesById(page.messages, [message]);
        return {
          ...page,
          messages,
          initialLoadStatus:
            page.initialLoadStatus === "idle"
              ? "succeeded"
              : page.initialLoadStatus,
        };
      });
      updateConversationPreview(
        state,
        conversationId,
        message.deleted ? "" : message.content,
        message.createdAt
      );
      if (
        inserted &&
        state.activeConversationId !== conversationId &&
        !message.deleted &&
        message.senderId !== currentUserId
      ) {
        state.unreadCounts[conversationId] =
          (state.unreadCounts[conversationId] ?? 0) + 1;
      }
    },
    upsertConversation(state, action: PayloadAction<Conversation>) {
      replaceConversation(state, action.payload);
    },
    removeConversation(state, action: PayloadAction<string>) {
      const id = action.payload;
      state.conversations = state.conversations.filter((c) => c.id !== id);
      delete state.messagePagesByConversationId[id];
      delete state.unreadCounts[id];
      delete state.typingByConversationId[id];
      if (state.activeConversationId === id) {
        state.activeConversationId = null;
      }
    },
    setUnreadCount(
      state,
      action: PayloadAction<{ conversationId: string; unreadCount: number }>
    ) {
      state.unreadCounts[action.payload.conversationId] =
        action.payload.unreadCount;
    },
    setTypingUsers(
      state,
      action: PayloadAction<{ conversationId: string; userIds: string[] }>
    ) {
      state.typingByConversationId[action.payload.conversationId] =
        action.payload.userIds;
    },
    addTypingUser(
      state,
      action: PayloadAction<{ conversationId: string; userId: string }>
    ) {
      const current =
        state.typingByConversationId[action.payload.conversationId] ?? [];
      if (!current.includes(action.payload.userId)) {
        state.typingByConversationId[action.payload.conversationId] = [
          ...current,
          action.payload.userId,
        ];
      }
    },
    removeTypingUser(
      state,
      action: PayloadAction<{ conversationId: string; userId: string }>
    ) {
      const current =
        state.typingByConversationId[action.payload.conversationId] ?? [];
      state.typingByConversationId[action.payload.conversationId] =
        current.filter((id) => id !== action.payload.userId);
    },
    mergeUsers(state, action: PayloadAction<Record<string, User>>) {
      state.users = { ...state.users, ...action.payload };
    },
    mergePresence(state, action: PayloadAction<PresenceState>) {
      state.presence = { ...state.presence, ...action.payload };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(initializeChat.pending, (state) => {
        state.conversationsLoading = true;
        state.conversationsError = null;
      })
      .addCase(initializeChat.fulfilled, (state, action) => {
        state.conversationsLoading = false;
        state.users = action.payload.users;
        state.presence = action.payload.presence;
        state.conversations = action.payload.conversations;
        state.unreadCounts = action.payload.unreadCounts;
        state.initialized = true;
      })
      .addCase(initializeChat.rejected, (state, action) => {
        state.conversationsLoading = false;
        state.conversationsError =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to load conversations";
      })
      .addCase(fetchMessages.pending, (state, action) => {
        setPageMessages(state, action.meta.arg, (page) => ({
          ...page,
          initialLoadStatus: "loading",
          error: null,
        }));
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        const { conversationId, page } = action.payload;
        const existingOptimistic = getPage(state, conversationId).messages.filter(
          (message) =>
            message.status === "sending" || message.status === "failed"
        );
        const merged = mergeMessagesById(page.messages, existingOptimistic);
        state.messagePagesByConversationId[conversationId] = {
          messages: merged,
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
          initialLoadStatus: "succeeded",
          loadingOlderStatus: "idle",
          error: null,
          oldestLoadedMessageId: merged[0]?.id ?? null,
        };
        // Keep sidebar preview in sync when opening a chat that missed realtime.
        const latest = [...merged]
          .reverse()
          .find((message) => !message.deleted);
        if (latest) {
          updateConversationPreview(
            state,
            conversationId,
            latest.content,
            latest.createdAt
          );
        }
      })
      .addCase(fetchMessages.rejected, (state, action) => {
        const payload = action.payload as
          | { conversationId: string; message: string }
          | undefined;
        if (!payload) {
          return;
        }
        setPageMessages(state, payload.conversationId, (page) => ({
          ...page,
          initialLoadStatus: "failed",
          error: payload.message,
        }));
      })
      .addCase(loadOlderMessages.pending, (state, action) => {
        setPageMessages(state, action.meta.arg, (page) => ({
          ...page,
          loadingOlderStatus: "loading",
          error: null,
        }));
      })
      .addCase(loadOlderMessages.fulfilled, (state, action) => {
        const { conversationId, page } = action.payload;
        const current = getPage(state, conversationId);
        const merged = mergeMessagesById(page.messages, current.messages);
        state.messagePagesByConversationId[conversationId] = {
          ...current,
          messages: merged,
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
          loadingOlderStatus: "succeeded",
          error: null,
          oldestLoadedMessageId: merged[0]?.id ?? null,
        };
      })
      .addCase(loadOlderMessages.rejected, (state, action) => {
        const payload = action.payload as
          | { conversationId: string; message: string }
          | undefined;
        if (!payload) {
          return;
        }
        setPageMessages(state, payload.conversationId, (page) => ({
          ...page,
          loadingOlderStatus: "failed",
          error: payload.message,
        }));
      })
      .addCase(markConversationRead.pending, (state, action) => {
        const conversationId = action.meta.arg;
        state.unreadRollbackByConversationId[conversationId] =
          state.unreadCounts[conversationId] ?? 0;
        state.unreadCounts[conversationId] = 0;
      })
      .addCase(markConversationRead.fulfilled, (state, action) => {
        delete state.unreadRollbackByConversationId[action.payload.conversationId];
        state.unreadCounts[action.payload.conversationId] = 0;
      })
      .addCase(markConversationRead.rejected, (state, action) => {
        const payload = action.payload as
          | { conversationId: string; previousUnread: number }
          | undefined;
        if (payload) {
          state.unreadCounts[payload.conversationId] = payload.previousUnread;
          delete state.unreadRollbackByConversationId[payload.conversationId];
        }
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        const {
          optimisticId,
          message,
          conversationId,
          previousConversationId,
          conversation,
        } = action.payload as {
          optimisticId: string;
          message: Message;
          conversationId: string;
          previousConversationId?: string;
          conversation?: Conversation | null;
        };

        const sourceConversationId =
          previousConversationId ?? conversationId;

        if (
          previousConversationId &&
          previousConversationId !== conversationId
        ) {
          const pendingPage =
            state.messagePagesByConversationId[previousConversationId];
          const pendingDraft =
            state.draftsByConversationId[previousConversationId];
          delete state.messagePagesByConversationId[previousConversationId];
          delete state.draftsByConversationId[previousConversationId];
          delete state.sendingByConversationId[previousConversationId];
          delete state.unreadCounts[previousConversationId];
          state.conversations = state.conversations.filter(
            (item) => item.id !== previousConversationId
          );

          if (pendingPage) {
            state.messagePagesByConversationId[conversationId] = {
              ...pendingPage,
              messages: pendingPage.messages.map((item) =>
                item.id === optimisticId ||
                item.clientMessageId === message.clientMessageId
                  ? { ...message, status: item.status === "read" || item.status === "delivered" ? item.status : "sent" }
                  : item
              ),
              initialLoadStatus: "succeeded",
            };
          }
          if (pendingDraft) {
            state.draftsByConversationId[conversationId] = pendingDraft;
          }
          if (state.activeConversationId === previousConversationId) {
            state.activeConversationId = conversationId;
          }
        }

        setPageMessages(state, conversationId, (page) => ({
          ...page,
          messages: page.messages.map((item) => {
            if (
              item.id !== optimisticId &&
              item.clientMessageId !== message.clientMessageId
            ) {
              return item;
            }
            const existingIndex = statusProgression.indexOf(item.status);
            const sentIndex = statusProgression.indexOf("sent");
            const status =
              existingIndex > sentIndex ? item.status : ("sent" as const);
            return { ...message, id: message.id, status };
          }),
          initialLoadStatus: "succeeded",
        }));

        if (conversation) {
          replaceConversation(state, conversation);
        } else if (
          !state.conversations.some((item) => item.id === conversationId)
        ) {
          const peerIds = message.senderId
            ? [message.senderId]
            : [];
          state.conversations = [
            {
              id: conversationId,
              type: "direct",
              name: "Direct chat",
              avatar: "",
              memberIds: peerIds,
              pinned: false,
              muted: false,
              lastMessagePreview: message.content,
              lastMessageAt: message.createdAt,
            },
            ...state.conversations,
          ];
        } else {
          updateConversationPreview(
            state,
            conversationId,
            message.content,
            message.createdAt
          );
        }

        state.sendingByConversationId[sourceConversationId] = false;
        state.sendingByConversationId[conversationId] = false;
        updateConversationPreview(
          state,
          conversationId,
          message.content,
          message.createdAt
        );
      })
      .addCase(sendMessage.rejected, (state, action) => {
        const payload = action.payload as
          | {
              optimisticId: string;
              conversationId: string;
              message: string;
            }
          | undefined;
        if (!payload) {
          return;
        }
        setPageMessages(state, payload.conversationId, (page) => ({
          ...page,
          messages: page.messages.map((item) =>
            item.id === payload.optimisticId
              ? { ...item, status: "failed" }
              : item
          ),
        }));
        state.sendingByConversationId[payload.conversationId] = false;
      })
      .addCase(retryMessage.pending, (state, action) => {
        const { conversationId, messageId } = action.meta.arg;
        setPageMessages(state, conversationId, (page) => ({
          ...page,
          messages: page.messages.map((item) =>
            item.id === messageId ? { ...item, status: "sending" } : item
          ),
        }));
        state.sendingByConversationId[conversationId] = true;
      })
      .addCase(retryMessage.fulfilled, (state, action) => {
        const { conversationId, failedMessageId, message } = action.payload;
        setPageMessages(state, conversationId, (page) => ({
          ...page,
          messages: page.messages
            .filter((item) => item.id !== failedMessageId)
            .concat({ ...message, status: "sent" }),
        }));
        state.sendingByConversationId[conversationId] = false;
        updateConversationPreview(
          state,
          conversationId,
          message.content,
          message.createdAt
        );
      })
      .addCase(retryMessage.rejected, (state, action) => {
        const { conversationId, messageId } = action.meta.arg;
        setPageMessages(state, conversationId, (page) => ({
          ...page,
          messages: page.messages.map((item) =>
            item.id === messageId ? { ...item, status: "failed" } : item
          ),
        }));
        state.sendingByConversationId[conversationId] = false;
      })
      .addCase(deleteMessageRemote.pending, (state, action) => {
        const { conversationId, messageId } = action.meta.arg;
        const current = getPage(state, conversationId).messages.find(
          (message) => message.id === messageId
        );
        if (current) {
          state.messageActionSnapshots[messageId] = { ...current };
        }
        setPageMessages(state, conversationId, (page) => ({
          ...page,
          messages: page.messages.map((message) =>
            message.id === messageId
              ? { ...message, deleted: true, content: "" }
              : message
          ),
        }));
      })
      .addCase(deleteMessageRemote.fulfilled, (state, action) => {
        delete state.messageActionSnapshots[action.payload.messageId];
      })
      .addCase(deleteMessageRemote.rejected, (state, action) => {
        const payload = action.payload as
          | {
              conversationId: string;
              messageId: string;
              previous: Message;
            }
          | undefined;
        if (!payload) {
          return;
        }
        setPageMessages(state, payload.conversationId, (page) => ({
          ...page,
          messages: page.messages.map((message) =>
            message.id === payload.messageId ? payload.previous : message
          ),
        }));
        delete state.messageActionSnapshots[payload.messageId];
      })
      .addCase(toggleStarMessageRemote.pending, (state, action) => {
        const { conversationId, messageId } = action.meta.arg;
        const current = getPage(state, conversationId).messages.find(
          (message) => message.id === messageId
        );
        if (current) {
          state.messageActionSnapshots[messageId] = { ...current };
        }
        setPageMessages(state, conversationId, (page) => ({
          ...page,
          messages: page.messages.map((message) =>
            message.id === messageId
              ? { ...message, starred: !message.starred }
              : message
          ),
        }));
      })
      .addCase(toggleStarMessageRemote.fulfilled, (state, action) => {
        const { conversationId, message } = action.payload;
        setPageMessages(state, conversationId, (page) => ({
          ...page,
          messages: page.messages.map((item) =>
            item.id === message.id ? message : item
          ),
        }));
        delete state.messageActionSnapshots[message.id];
      })
      .addCase(toggleStarMessageRemote.rejected, (state, action) => {
        const payload = action.payload as
          | {
              conversationId: string;
              messageId: string;
              previousStarred: boolean;
            }
          | undefined;
        if (!payload) {
          return;
        }
        const snapshot = state.messageActionSnapshots[payload.messageId];
        setPageMessages(state, payload.conversationId, (page) => ({
          ...page,
          messages: page.messages.map((message) =>
            message.id === payload.messageId
              ? snapshot ?? { ...message, starred: payload.previousStarred }
              : message
          ),
        }));
        delete state.messageActionSnapshots[payload.messageId];
      })
      .addCase(togglePinMessageRemote.pending, (state, action) => {
        const { conversationId, messageId } = action.meta.arg;
        const current = getPage(state, conversationId).messages.find(
          (message) => message.id === messageId
        );
        if (current) {
          state.messageActionSnapshots[messageId] = { ...current };
        }
        setPageMessages(state, conversationId, (page) => ({
          ...page,
          messages: page.messages.map((message) =>
            message.id === messageId
              ? { ...message, pinned: !message.pinned }
              : message
          ),
        }));
      })
      .addCase(togglePinMessageRemote.fulfilled, (state, action) => {
        const { conversationId, message } = action.payload;
        setPageMessages(state, conversationId, (page) => ({
          ...page,
          messages: page.messages.map((item) =>
            item.id === message.id ? message : item
          ),
        }));
        delete state.messageActionSnapshots[message.id];
      })
      .addCase(togglePinMessageRemote.rejected, (state, action) => {
        const payload = action.payload as
          | {
              conversationId: string;
              messageId: string;
              previousPinned: boolean;
            }
          | undefined;
        if (!payload) {
          return;
        }
        const snapshot = state.messageActionSnapshots[payload.messageId];
        setPageMessages(state, payload.conversationId, (page) => ({
          ...page,
          messages: page.messages.map((message) =>
            message.id === payload.messageId
              ? snapshot ?? { ...message, pinned: payload.previousPinned }
              : message
          ),
        }));
        delete state.messageActionSnapshots[payload.messageId];
      })
      .addCase(createGroup.fulfilled, (state, action) => {
        state.conversations = [action.payload, ...state.conversations];
        state.messagePagesByConversationId[action.payload.id] =
          createEmptyMessagesState();
        state.unreadCounts[action.payload.id] = 0;
        state.activeConversationId = action.payload.id;
        state.mobileView = "conversation";
        state.groupActionError = null;
        state.groupFieldErrors = null;
      })
      .addCase(createGroup.rejected, (state, action) => {
        const payload = action.payload as
          | { message: string; fieldErrors: Record<string, string> | null }
          | undefined;
        state.groupActionError =
          payload?.message ?? "Failed to create group";
        state.groupFieldErrors = payload?.fieldErrors ?? null;
      })
      .addCase(addGroupMembers.fulfilled, (state, action) => {
        replaceConversation(state, action.payload);
        state.groupActionError = null;
      })
      .addCase(addGroupMembers.rejected, (state, action) => {
        state.groupActionError =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to add members";
      })
      .addCase(removeGroupMember.fulfilled, (state, action) => {
        replaceConversation(state, action.payload);
        state.groupActionError = null;
      })
      .addCase(removeGroupMember.rejected, (state, action) => {
        state.groupActionError =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to remove member";
      })
      .addCase(leaveGroup.fulfilled, (state, action) => {
        state.conversations = state.conversations.filter(
          (conversation) => conversation.id !== action.payload
        );
        delete state.messagePagesByConversationId[action.payload];
        delete state.unreadCounts[action.payload];
        if (state.activeConversationId === action.payload) {
          state.activeConversationId = null;
        }
        state.groupActionError = null;
      })
      .addCase(leaveGroup.rejected, (state, action) => {
        state.groupActionError =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to leave group";
      })
      .addCase(transferGroupOwnership.fulfilled, (state, action) => {
        replaceConversation(state, action.payload);
        state.groupActionError = null;
      })
      .addCase(transferGroupOwnership.rejected, (state, action) => {
        state.groupActionError =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to transfer ownership";
      })
      .addCase(muteConversation.pending, (state, action) => {
        const { conversationId, muted } = action.meta.arg;
        const existing = state.conversations.find((c) => c.id === conversationId);
        if (existing) {
          existing.muted = muted;
        }
      })
      .addCase(muteConversation.fulfilled, (state, action) => {
        replaceConversation(state, action.payload);
      })
      .addCase(muteConversation.rejected, (state, action) => {
        const { conversationId, muted } = action.meta.arg;
        const existing = state.conversations.find((c) => c.id === conversationId);
        if (existing) {
          existing.muted = !muted;
        }
      })
      .addCase(updateGroup.fulfilled, (state, action) => {
        replaceConversation(state, action.payload);
        state.groupActionError = null;
      })
      .addCase(updateGroup.rejected, (state, action) => {
        state.groupActionError =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to update group";
      })
      .addCase(deleteGroup.fulfilled, (state, action) => {
        const id = action.payload;
        state.conversations = state.conversations.filter((c) => c.id !== id);
        delete state.messagePagesByConversationId[id];
        delete state.unreadCounts[id];
        if (state.activeConversationId === id) {
          state.activeConversationId = null;
        }
        state.groupActionError = null;
      })
      .addCase(deleteGroup.rejected, (state, action) => {
        state.groupActionError =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to delete group";
      })
      .addCase(changeGroupMemberRole.fulfilled, (state, action) => {
        replaceConversation(state, action.payload);
        state.groupActionError = null;
      })
      .addCase(changeGroupMemberRole.rejected, (state, action) => {
        state.groupActionError =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to change member role";
      })
      .addCase(openDirectChat.fulfilled, (state, action) => {
        const {
          peerUserId,
          name,
          avatar,
          existingConversationId,
          pendingConversationId,
          currentUserId,
        } = action.payload;

        state.users[peerUserId] = {
          id: peerUserId,
          name,
          avatar,
          about: state.users[peerUserId]?.about,
          phone: state.users[peerUserId]?.phone,
        };

        if (existingConversationId) {
          state.activeConversationId = existingConversationId;
          state.mobileView = "conversation";
          state.replyToMessageId = null;
          return;
        }

        if (
          !state.conversations.some(
            (conversation) => conversation.id === pendingConversationId
          )
        ) {
          state.conversations = [
            {
              id: pendingConversationId,
              type: "direct",
              name,
              avatar,
              memberIds: [currentUserId, peerUserId],
              pinned: false,
              muted: false,
              lastMessagePreview: "",
              lastMessageAt: new Date(0).toISOString(),
            },
            ...state.conversations,
          ];
        }

        setPageMessages(state, pendingConversationId, () => ({
          ...createEmptyMessagesState(),
          initialLoadStatus: "succeeded",
        }));
        state.activeConversationId = pendingConversationId;
        state.mobileView = "conversation";
        state.replyToMessageId = null;
      })
      .addCase(startDirectConversation.fulfilled, (state, action) => {
        const { conversationId, message, conversation } = action.payload;
        setPageMessages(state, conversationId, (page) => ({
          ...page,
          messages: mergeMessagesById(page.messages, [message]),
          initialLoadStatus: "succeeded",
        }));
        if (conversation) {
          replaceConversation(state, conversation);
        } else if (!state.conversations.some((c) => c.id === conversationId)) {
          state.conversations = [
            {
              id: conversationId,
              type: "direct",
              name: "Direct chat",
              avatar: "",
              memberIds: [message.senderId],
              pinned: false,
              muted: false,
              lastMessagePreview: message.content,
              lastMessageAt: message.createdAt,
            },
            ...state.conversations,
          ];
        } else {
          updateConversationPreview(
            state,
            conversationId,
            message.content,
            message.createdAt
          );
        }
        state.activeConversationId = conversationId;
        state.mobileView = "conversation";
      });
  },
});

export const {
  resetChatState,
  selectConversation,
  clearActiveConversation,
  setDraft,
  setReplyToMessage,
  clearReply,
  setMobileView,
  clearGroupActionError,
  addOptimisticMessage,
  deleteMessage,
  toggleStarMessage,
  advanceMessageStatus,
  markMessagesReadByPeer,
  upsertRealtimeMessage,
  upsertConversation,
  removeConversation,
  setUnreadCount,
  setTypingUsers,
  addTypingUser,
  removeTypingUser,
  mergeUsers,
  mergePresence,
} = chatSlice.actions;

export { statusProgression };

export default chatSlice.reducer;
