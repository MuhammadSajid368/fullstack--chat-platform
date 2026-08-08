import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "../store";
import { selectCurrentUserId } from "./authSelectors";
import type {
  Conversation,
  ConversationMessagesState,
  GroupMember,
  Message,
  User,
} from "../../types/chat";
import { createEmptyMessagesState } from "../../types/chat";
import { formatLastSeen } from "../../utils/formatLastSeen";

const selectChatState = (state: RootState) => state.chat;

export const selectConversations = createSelector(
  selectChatState,
  (chat) => chat.conversations
);

export const selectActiveConversationId = createSelector(
  selectChatState,
  (chat) => chat.activeConversationId
);

export const selectActiveConversation = createSelector(
  [selectConversations, selectActiveConversationId],
  (conversations, activeId): Conversation | null =>
    conversations.find((conversation) => conversation.id === activeId) ?? null
);

export const selectUsers = createSelector(selectChatState, (chat) => chat.users);

export const selectPresence = createSelector(
  selectChatState,
  (chat) => chat.presence
);

export const selectUnreadCounts = createSelector(
  selectChatState,
  (chat) => chat.unreadCounts
);

export const selectDraftForActiveConversation = createSelector(
  [selectChatState, selectActiveConversationId],
  (chat, activeId): string => {
    if (!activeId) {
      return "";
    }
    return chat.draftsByConversationId[activeId] ?? "";
  }
);

export const selectReplyToMessageId = createSelector(
  selectChatState,
  (chat) => chat.replyToMessageId
);

export const selectMessagePage = (
  state: RootState,
  conversationId: string | null
): ConversationMessagesState => {
  if (!conversationId) {
    return createEmptyMessagesState();
  }
  return (
    state.chat.messagePagesByConversationId[conversationId] ??
    createEmptyMessagesState()
  );
};

export const selectMessagesForConversation = (
  state: RootState,
  conversationId: string | null
): Message[] => selectMessagePage(state, conversationId).messages;

export const selectActiveMessages = createSelector(
  [selectChatState, selectActiveConversationId],
  (chat, activeId): Message[] => {
    if (!activeId) {
      return [];
    }
    return chat.messagePagesByConversationId[activeId]?.messages ?? [];
  }
);

export const selectMessagesLoading = (
  state: RootState,
  conversationId: string | null
): boolean => {
  if (!conversationId) {
    return false;
  }
  return (
    state.chat.messagePagesByConversationId[conversationId]
      ?.initialLoadStatus === "loading"
  );
};

export const selectMessagesError = (
  state: RootState,
  conversationId: string | null
): string | null => {
  if (!conversationId) {
    return null;
  }
  return state.chat.messagePagesByConversationId[conversationId]?.error ?? null;
};

export const selectHasMoreMessages = (
  state: RootState,
  conversationId: string | null
): boolean => selectMessagePage(state, conversationId).hasMore;

export const selectLoadingOlderMessages = (
  state: RootState,
  conversationId: string | null
): boolean =>
  selectMessagePage(state, conversationId).loadingOlderStatus === "loading";

export const selectLoadingOlderFailed = (
  state: RootState,
  conversationId: string | null
): boolean =>
  selectMessagePage(state, conversationId).loadingOlderStatus === "failed";

export const selectIsSending = createSelector(
  [selectChatState, selectActiveConversationId],
  (chat, activeId): boolean => {
    if (!activeId) {
      return false;
    }
    return chat.sendingByConversationId[activeId] ?? false;
  }
);

export const selectReplyToMessage = createSelector(
  [selectActiveMessages, selectReplyToMessageId],
  (messages, replyId): Message | null => {
    if (!replyId) {
      return null;
    }
    return messages.find((message) => message.id === replyId) ?? null;
  }
);

export const selectConversationsLoading = createSelector(
  selectChatState,
  (chat) => chat.conversationsLoading
);

export const selectConversationsError = createSelector(
  selectChatState,
  (chat) => chat.conversationsError
);

export const selectMobileView = createSelector(
  selectChatState,
  (chat) => chat.mobileView
);

export const selectChatInitialized = createSelector(
  selectChatState,
  (chat) => chat.initialized
);

export const selectGroupActionError = createSelector(
  selectChatState,
  (chat) => chat.groupActionError
);

export const selectGroupFieldErrors = createSelector(
  selectChatState,
  (chat) => chat.groupFieldErrors
);

export const selectOtherParticipant = createSelector(
  [selectActiveConversation, selectUsers, selectCurrentUserId],
  (conversation, users, currentUserId): User | null => {
    if (!conversation || conversation.type !== "direct") {
      return null;
    }
    const otherId = conversation.memberIds.find(
      (id) => id !== currentUserId
    );
    if (!otherId) {
      return null;
    }
    return users[otherId] ?? null;
  }
);

export const selectOtherParticipantPresence = createSelector(
  [selectActiveConversation, selectPresence, selectCurrentUserId],
  (conversation, presence, currentUserId): string => {
    if (!conversation || conversation.type !== "direct") {
      return "offline";
    }
    const otherId = conversation.memberIds.find(
      (id) => id !== currentUserId
    );
    if (!otherId) {
      return "offline";
    }
    return presence[otherId] ?? "offline";
  }
);

export interface StarredMessageEntry {
  message: Message;
  conversation: Conversation;
}

export const selectStarredMessages = createSelector(
  [selectConversations, selectChatState],
  (conversations, chat): StarredMessageEntry[] => {
    const entries: StarredMessageEntry[] = [];

    for (const conversation of conversations) {
      const messages =
        chat.messagePagesByConversationId[conversation.id]?.messages ?? [];
      for (const message of messages) {
        if (message.starred && !message.deleted) {
          entries.push({ message, conversation });
        }
      }
    }

    return entries.sort(
      (a, b) =>
        new Date(b.message.createdAt).getTime() -
        new Date(a.message.createdAt).getTime()
    );
  }
);

export const selectPinnedMessagesForActive = createSelector(
  selectActiveMessages,
  (messages): Message[] =>
    messages
      .filter((message) => message.pinned && !message.deleted)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
);

export const getPresenceForConversation = (
  conversation: Conversation,
  presence: Record<string, string>,
  currentUserId: string,
  lastSeenByUserId?: Record<string, string | null>
): { isOnline: boolean; statusLabel: string } => {
  if (conversation.type === "group") {
    const memberCount =
      conversation.members?.length ?? conversation.memberIds.length;
    return { isOnline: false, statusLabel: `Group · ${memberCount} members` };
  }

  const otherId = conversation.memberIds.find((id) => id !== currentUserId);
  if (!otherId) {
    return { isOnline: false, statusLabel: "Offline" };
  }

  const status = presence[otherId] ?? "offline";
  if (status === "online") {
    return { isOnline: true, statusLabel: "Online" };
  }
  if (status === "away") {
    return { isOnline: false, statusLabel: "Away" };
  }
  const lastSeenLabel = lastSeenByUserId
    ? formatLastSeen(lastSeenByUserId[otherId])
    : null;
  return {
    isOnline: false,
    statusLabel: lastSeenLabel ?? "Offline",
  };
};

export const selectGroupConversations = createSelector(
  selectConversations,
  (conversations) => conversations.filter((c) => c.type === "group")
);

export const selectActiveGroupMembers = createSelector(
  [selectActiveConversation, selectUsers, selectCurrentUserId],
  (
    conversation,
    users,
    currentUserId
  ): Array<{
    user: User;
    role: GroupMember["role"];
    isCurrentUser: boolean;
  }> => {
    if (!conversation || conversation.type !== "group" || !conversation.members) {
      return [];
    }
    return conversation.members
      .map((member) => {
        const user = users[member.userId];
        if (!user) {
          return null;
        }
        return {
          user,
          role: member.role,
          isCurrentUser: member.userId === currentUserId,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }
);

export const selectCurrentUserGroupRole = createSelector(
  [selectActiveConversation, selectCurrentUserId],
  (conversation, currentUserId) => {
    if (!conversation?.members) {
      return undefined;
    }
    return conversation.members.find((m) => m.userId === currentUserId)?.role;
  }
);

export const selectInvitableUsers = createSelector(
  [selectUsers, selectActiveConversation, selectCurrentUserId],
  (users, conversation, currentUserId) => {
    const memberIds = new Set(conversation?.memberIds ?? []);
    return Object.values(users).filter(
      (user) => user.id !== currentUserId && !memberIds.has(user.id)
    );
  }
);

export const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
};
