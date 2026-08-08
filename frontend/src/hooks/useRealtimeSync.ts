import { useEffect, useMemo, useRef } from "react";
import { isRestMode } from "../config/env";
import { useDispatch, useSelector } from "../redux/store";
import { selectIsAuthenticated, selectCurrentUserId } from "../redux/selectors/authSelectors";
import {
  selectActiveConversation,
  selectActiveConversationId,
  selectConversations,
} from "../redux/selectors/chatSelectors";
import {
  connectSocket,
  disconnectSocket,
  emitSocketEvent,
  emitSocketFireAndForget,
  onSocketConnection,
  onSocketEvent,
  RealtimeEvents,
} from "../services/socket/socketClient";
import { getPresenceService } from "../services/serviceRegistry";
import { transformConversation, transformMessage } from "../services/api/transformers";
import type { ApiConversationDto, ApiMessageDto, ApiPresenceDto } from "../services/api/apiTypes";
import type { Notification } from "../services/notificationService";
import { toast } from "react-toastify";
import {
  addTypingUser,
  advanceMessageStatus,
  markConversationRead,
  markMessagesReadByPeer,
  mergePresence,
  removeConversation,
  removeTypingUser,
  setUnreadCount,
  upsertConversation,
  upsertRealtimeMessage,
} from "../redux/slices/chatSlice";
import {
  markAllReadLocal,
  removeNotificationLocal,
  upsertNotification,
} from "../redux/slices/notificationSlice";
import {
  setPeerLastSeen,
  setPeerPresence,
} from "../redux/slices/presenceSlice";
import type { PresenceStatus } from "../types/chat";

function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object"
    ? (payload as Record<string, unknown>)
    : {};
}

function normalizeNotification(value: unknown): Notification | null {
  const data = asRecord(value);
  const id = String(data.id ?? "");
  if (!id) {
    return null;
  }
  const statusRaw = String(data.status ?? "unread").toLowerCase();
  const status =
    statusRaw === "read" || statusRaw === "dismissed" ? statusRaw : "unread";
  const typeRaw = String(data.type ?? "system").toLowerCase();
  const type =
    typeRaw === "message" ||
    typeRaw === "mention" ||
    typeRaw === "group_invite" ||
    typeRaw === "group_update" ||
    typeRaw === "system"
      ? typeRaw
      : "system";

  return {
    id,
    type,
    status,
    title: String(data.title ?? "Notification"),
    body: String(data.body ?? ""),
    conversationId:
      data.conversationId == null ? null : String(data.conversationId),
    messageId: data.messageId == null ? null : String(data.messageId),
    payload:
      data.payload && typeof data.payload === "object"
        ? (data.payload as Record<string, unknown>)
        : null,
    readAt: data.readAt == null ? null : String(data.readAt),
    createdAt: String(data.createdAt ?? new Date().toISOString()),
    updatedAt: data.updatedAt ? String(data.updatedAt) : undefined,
  };
}

function normalizePresenceStatus(value: unknown): PresenceStatus {
  const s = String(value ?? "offline").toLowerCase();
  if (
    s === "online" ||
    s === "offline" ||
    s === "away" ||
    s === "invisible"
  ) {
    return s;
  }
  return "offline";
}

function applyPeerPresence(
  dispatch: ReturnType<typeof useDispatch>,
  userId: string,
  status: PresenceStatus,
  lastSeenAt?: string | null
): void {
  dispatch(setPeerPresence({ userId, status }));
  dispatch(mergePresence({ [userId]: status }));
  if (lastSeenAt !== undefined) {
    dispatch(
      setPeerLastSeen({
        userId,
        lastSeenAt: lastSeenAt ? String(lastSeenAt) : null,
      })
    );
  }
}

/**
 * Subscribes to Socket.IO realtime events when authenticated in REST mode.
 */
export function useRealtimeSync(): void {
  const dispatch = useDispatch();
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const currentUserId = useSelector(selectCurrentUserId);
  const activeConversationId = useSelector(selectActiveConversationId);
  const activeConversation = useSelector(selectActiveConversation);
  const conversations = useSelector(selectConversations);
  const joinedRef = useRef<string | null>(null);
  const subscribedPeersRef = useRef<Set<string>>(new Set());
  const activeConversationIdRef = useRef<string | null>(activeConversationId);
  activeConversationIdRef.current = activeConversationId;
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;

  const directPeerIds = useMemo(() => {
    if (!currentUserId) {
      return [] as string[];
    }
    const ids = new Set<string>();
    for (const conversation of conversations) {
      if (conversation.type !== "direct") {
        continue;
      }
      for (const memberId of conversation.memberIds) {
        if (memberId !== currentUserId) {
          ids.add(memberId);
        }
      }
    }
    return Array.from(ids).sort();
  }, [conversations, currentUserId]);

  useEffect(() => {
    if (!isRestMode() || !isAuthenticated) {
      disconnectSocket();
      return;
    }

    connectSocket();

    // Keep Redis presence TTL alive while the tab is open (TTL is ~2 minutes).
    const heartbeatId = window.setInterval(() => {
      emitSocketFireAndForget("presence:ping");
    }, 30_000);
    emitSocketFireAndForget("presence:ping");

    const unsubscribers = [
      onSocketEvent(RealtimeEvents.MESSAGE_CREATED, (payload) => {
        const data = asRecord(payload);
        const conversationId = String(data.conversationId ?? "");
        const messageDto = data.message as ApiMessageDto | undefined;
        if (!conversationId || !messageDto) return;
        const viewerId = currentUserIdRef.current;
        dispatch(
          upsertRealtimeMessage({
            conversationId,
            message: transformMessage(messageDto),
            currentUserId: viewerId,
          })
        );
        // Reader already has this chat open — mark read so sender gets receipts.
        if (
          viewerId &&
          messageDto.senderId !== viewerId &&
          activeConversationIdRef.current === conversationId
        ) {
          void dispatch(markConversationRead(conversationId));
        }
      }),
      onSocketEvent(RealtimeEvents.MESSAGE_UPDATED, (payload) => {
        const data = asRecord(payload);
        const messageDto = (data.message ?? data) as ApiMessageDto;
        const conversationId = String(
          messageDto.conversationId ?? data.conversationId ?? ""
        );
        if (!conversationId || !messageDto?.id) return;
        dispatch(
          upsertRealtimeMessage({
            conversationId,
            message: transformMessage(messageDto),
            currentUserId,
          })
        );
      }),
      onSocketEvent(RealtimeEvents.MESSAGE_DELETED, (payload) => {
        const data = asRecord(payload);
        const messageDto = (data.message ?? data) as ApiMessageDto;
        const conversationId = String(
          messageDto.conversationId ?? data.conversationId ?? ""
        );
        if (!conversationId || !messageDto?.id) return;
        dispatch(
          upsertRealtimeMessage({
            conversationId,
            message: transformMessage({ ...messageDto, deleted: true }),
          })
        );
      }),
      onSocketEvent(RealtimeEvents.MESSAGE_STARRED, (payload) => {
        const data = asRecord(payload);
        const messageDto = data.message as ApiMessageDto | undefined;
        const conversationId = String(data.conversationId ?? "");
        if (!conversationId || !messageDto) return;
        dispatch(
          upsertRealtimeMessage({
            conversationId,
            message: transformMessage(messageDto),
            currentUserId,
          })
        );
      }),
      onSocketEvent(RealtimeEvents.MESSAGE_UNSTARRED, (payload) => {
        const data = asRecord(payload);
        const messageDto = data.message as ApiMessageDto | undefined;
        const conversationId = String(data.conversationId ?? "");
        if (!conversationId || !messageDto) return;
        dispatch(
          upsertRealtimeMessage({
            conversationId,
            message: transformMessage(messageDto),
            currentUserId,
          })
        );
      }),
      onSocketEvent(RealtimeEvents.MESSAGE_PINNED, (payload) => {
        const data = asRecord(payload);
        const messageDto = data.message as ApiMessageDto | undefined;
        const conversationId = String(data.conversationId ?? "");
        if (!conversationId || !messageDto) return;
        dispatch(
          upsertRealtimeMessage({
            conversationId,
            message: transformMessage(messageDto),
            currentUserId,
          })
        );
      }),
      onSocketEvent(RealtimeEvents.MESSAGE_UNPINNED, (payload) => {
        const data = asRecord(payload);
        const messageDto = data.message as ApiMessageDto | undefined;
        const conversationId = String(data.conversationId ?? "");
        if (!conversationId || !messageDto) return;
        dispatch(
          upsertRealtimeMessage({
            conversationId,
            message: transformMessage(messageDto),
            currentUserId,
          })
        );
      }),
      onSocketEvent(RealtimeEvents.MESSAGE_DELIVERED, (payload) => {
        const data = asRecord(payload);
        const messageDto = data.message as ApiMessageDto | undefined;
        const conversationId = String(
          data.conversationId ?? messageDto?.conversationId ?? ""
        );
        const messageId = String(data.messageId ?? messageDto?.id ?? "");
        if (conversationId && messageDto?.id) {
          dispatch(
            upsertRealtimeMessage({
              conversationId,
              message: transformMessage(messageDto),
              currentUserId,
            })
          );
          return;
        }
        if (conversationId && messageId) {
          dispatch(
            advanceMessageStatus({
              conversationId,
              messageId,
              status: "delivered",
            })
          );
        }
      }),
      onSocketEvent(RealtimeEvents.MESSAGE_READ, (payload) => {
        const data = asRecord(payload);
        const conversationId = String(data.conversationId ?? "");
        const readerUserId = String(data.userId ?? "");
        if (!conversationId || !readerUserId) return;
        // Ignore our own mark-read echo for outbound ticks; still safe to apply.
        dispatch(
          markMessagesReadByPeer({
            conversationId,
            readerUserId,
          })
        );
      }),
      onSocketEvent(RealtimeEvents.CONVERSATION_CREATED, (payload) => {
        const data = asRecord(payload);
        const dto = data.conversation as ApiConversationDto | undefined;
        if (dto) {
          dispatch(upsertConversation(transformConversation(dto)));
        }
      }),
      onSocketEvent(RealtimeEvents.CONVERSATION_UPDATED, (payload) => {
        const data = asRecord(payload);
        const dto = data.conversation as ApiConversationDto | undefined;
        if (dto) {
          dispatch(upsertConversation(transformConversation(dto)));
        }
      }),
      onSocketEvent(RealtimeEvents.CONVERSATION_DELETED, (payload) => {
        const data = asRecord(payload);
        const id = String(data.conversationId ?? "");
        if (id) dispatch(removeConversation(id));
      }),
      onSocketEvent(RealtimeEvents.CONVERSATION_UNREAD, (payload) => {
        const data = asRecord(payload);
        const conversationId = String(data.conversationId ?? "");
        const unreadCount = Number(data.unreadCount ?? 0);
        if (!conversationId) {
          return;
        }
        // Don't flash a badge on the chat the user is currently reading.
        if (activeConversationIdRef.current === conversationId) {
          dispatch(setUnreadCount({ conversationId, unreadCount: 0 }));
          return;
        }
        dispatch(setUnreadCount({ conversationId, unreadCount }));
      }),
      onSocketEvent(RealtimeEvents.MEMBER_JOINED, (payload) => {
        const data = asRecord(payload);
        const dto = data.conversation as ApiConversationDto | undefined;
        if (dto) dispatch(upsertConversation(transformConversation(dto)));
      }),
      onSocketEvent(RealtimeEvents.MEMBER_LEFT, (payload) => {
        const data = asRecord(payload);
        const dto = data.conversation as ApiConversationDto | undefined;
        if (dto) dispatch(upsertConversation(transformConversation(dto)));
      }),
      onSocketEvent(RealtimeEvents.MEMBER_REMOVED, (payload) => {
        const data = asRecord(payload);
        const dto = data.conversation as ApiConversationDto | undefined;
        if (dto) dispatch(upsertConversation(transformConversation(dto)));
      }),
      onSocketEvent(RealtimeEvents.ROLE_CHANGED, (payload) => {
        const data = asRecord(payload);
        const dto = data.conversation as ApiConversationDto | undefined;
        if (dto) dispatch(upsertConversation(transformConversation(dto)));
      }),
      onSocketEvent(RealtimeEvents.OWNERSHIP_TRANSFERRED, (payload) => {
        const data = asRecord(payload);
        const dto = data.conversation as ApiConversationDto | undefined;
        if (dto) dispatch(upsertConversation(transformConversation(dto)));
      }),
      onSocketEvent(RealtimeEvents.PRESENCE_ONLINE, (payload) => {
        const data = asRecord(payload);
        const userId = String(data.userId ?? "");
        if (!userId) return;
        const status = normalizePresenceStatus(data.status ?? "online");
        applyPeerPresence(dispatch, userId, status, data.lastSeenAt as string | null | undefined);
      }),
      onSocketEvent(RealtimeEvents.PRESENCE_OFFLINE, (payload) => {
        const data = asRecord(payload);
        const userId = String(data.userId ?? "");
        if (!userId) return;
        applyPeerPresence(
          dispatch,
          userId,
          "offline",
          data.lastSeenAt ? String(data.lastSeenAt) : null
        );
      }),
      onSocketEvent(RealtimeEvents.PRESENCE_LAST_SEEN, (payload) => {
        const data = asRecord(payload);
        const userId = String(data.userId ?? "");
        if (!userId) return;
        dispatch(
          setPeerLastSeen({
            userId,
            lastSeenAt: data.lastSeenAt ? String(data.lastSeenAt) : null,
          })
        );
      }),
      onSocketEvent(RealtimeEvents.PRESENCE_STATUS_CHANGED, (payload) => {
        const data = asRecord(payload);
        const userId = String(data.userId ?? "");
        if (!userId) return;
        const status = normalizePresenceStatus(data.status);
        applyPeerPresence(dispatch, userId, status, data.lastSeenAt as string | null | undefined);
      }),
      onSocketEvent(RealtimeEvents.TYPING_STARTED, (payload) => {
        const data = asRecord(payload);
        const conversationId = String(data.conversationId ?? "");
        const userId = String(data.userId ?? "");
        if (conversationId && userId) {
          dispatch(addTypingUser({ conversationId, userId }));
        }
      }),
      onSocketEvent(RealtimeEvents.TYPING_STOPPED, (payload) => {
        const data = asRecord(payload);
        const conversationId = String(data.conversationId ?? "");
        const userId = String(data.userId ?? "");
        if (conversationId && userId) {
          dispatch(removeTypingUser({ conversationId, userId }));
        }
      }),
      onSocketEvent(RealtimeEvents.NOTIFICATION_CREATED, (payload) => {
        const data = asRecord(payload);
        const notification = normalizeNotification(
          data.notification ?? data
        );
        if (!notification) {
          return;
        }
        dispatch(upsertNotification(notification));
        const viewingSameChat =
          Boolean(notification.conversationId) &&
          activeConversationIdRef.current === notification.conversationId;
        if (!viewingSameChat) {
          toast.info(
            notification.body
              ? `${notification.title}\n${notification.body}`
              : notification.title,
            {
              toastId: `notif-${notification.id}`,
              autoClose: 5000,
            }
          );
        }
      }),
      onSocketEvent(RealtimeEvents.NOTIFICATION_READ, (payload) => {
        const data = asRecord(payload);
        const notification = normalizeNotification(
          data.notification ?? data
        );
        if (notification) {
          dispatch(upsertNotification(notification));
        }
      }),
      onSocketEvent(RealtimeEvents.NOTIFICATION_READ_ALL, () => {
        dispatch(markAllReadLocal());
      }),
      onSocketEvent(RealtimeEvents.NOTIFICATION_DELETED, (payload) => {
        const data = asRecord(payload);
        const id = String(data.notificationId ?? "");
        if (id) dispatch(removeNotificationLocal(id));
      }),
    ];

    return () => {
      window.clearInterval(heartbeatId);
      for (const unsub of unsubscribers) {
        unsub();
      }
    };
  }, [dispatch, isAuthenticated, currentUserId]);

  useEffect(() => {
    if (!isRestMode() || !isAuthenticated || !activeConversationId) {
      return;
    }
    if (joinedRef.current && joinedRef.current !== activeConversationId) {
      void emitSocketEvent("conversation:leave", {
        conversationId: joinedRef.current,
      });
    }
    joinedRef.current = activeConversationId;
    void emitSocketEvent("conversation:join", {
      conversationId: activeConversationId,
    });
  }, [activeConversationId, isAuthenticated]);

  // Join peer presence rooms so online/offline events reach this client.
  useEffect(() => {
    if (!isRestMode() || !isAuthenticated) {
      return;
    }

    const nextPeers = new Set(directPeerIds);
    const prevPeers = subscribedPeersRef.current;

    for (const peerId of prevPeers) {
      if (!nextPeers.has(peerId)) {
        void emitSocketEvent("presence.unsubscribe", { userId: peerId }).catch(
          () => undefined
        );
      }
    }

    for (const peerId of nextPeers) {
      if (prevPeers.has(peerId)) {
        continue;
      }
      void emitSocketEvent<{
        ok?: boolean;
        allowed?: boolean;
        presence?: ApiPresenceDto;
      }>("presence.subscribe", { userId: peerId })
        .then((response) => {
          const presence = response?.presence;
          if (!presence?.userId) {
            return;
          }
          applyPeerPresence(
            dispatch,
            presence.userId,
            normalizePresenceStatus(presence.status),
            presence.lastSeenAt
          );
        })
        .catch(() => undefined);
    }

    subscribedPeersRef.current = nextPeers;

    return () => {
      // Keep subscriptions while authenticated; cleanup on logout below.
    };
  }, [directPeerIds, dispatch, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      return;
    }
    for (const peerId of subscribedPeersRef.current) {
      void emitSocketEvent("presence.unsubscribe", { userId: peerId }).catch(
        () => undefined
      );
    }
    subscribedPeersRef.current = new Set();
  }, [isAuthenticated]);

  // Refresh active DM peer presence when opening the chat (covers stale REST snapshot).
  useEffect(() => {
    if (
      !isRestMode() ||
      !isAuthenticated ||
      !currentUserId ||
      !activeConversation ||
      activeConversation.type !== "direct"
    ) {
      return;
    }
    const peerId = activeConversation.memberIds.find(
      (id) => id !== currentUserId
    );
    if (!peerId) {
      return;
    }

    const refreshPeer = () => {
      void emitSocketEvent<{
        ok?: boolean;
        presence?: ApiPresenceDto;
      }>("presence.subscribe", { userId: peerId })
        .then((response) => {
          const presence = response?.presence;
          if (!presence?.userId) {
            return;
          }
          applyPeerPresence(
            dispatch,
            presence.userId,
            normalizePresenceStatus(presence.status),
            presence.lastSeenAt
          );
        })
        .catch(() => undefined);

      void getPresenceService()
        .getPresence(peerId)
        .then((info) => {
          applyPeerPresence(
            dispatch,
            info.userId,
            normalizePresenceStatus(info.status),
            info.lastSeenAt
          );
        })
        .catch(() => undefined);
    };

    refreshPeer();
    // Socket presence is primary; REST is a slow fallback to avoid rate limits.
    const intervalId = window.setInterval(refreshPeer, 60_000);
    return () => window.clearInterval(intervalId);
  }, [activeConversation, currentUserId, dispatch, isAuthenticated]);

  // After socket (re)connect, re-subscribe all DM peers so presence rooms are joined.
  useEffect(() => {
    if (!isRestMode() || !isAuthenticated) {
      return;
    }
    return onSocketConnection((connected) => {
      if (!connected) {
        return;
      }
      subscribedPeersRef.current = new Set();
      for (const peerId of directPeerIds) {
        void emitSocketEvent<{
          ok?: boolean;
          presence?: ApiPresenceDto;
        }>("presence.subscribe", { userId: peerId })
          .then((response) => {
            subscribedPeersRef.current.add(peerId);
            const presence = response?.presence;
            if (!presence?.userId) {
              return;
            }
            applyPeerPresence(
              dispatch,
              presence.userId,
              normalizePresenceStatus(presence.status),
              presence.lastSeenAt
            );
          })
          .catch(() => undefined);
      }
    });
  }, [directPeerIds, dispatch, isAuthenticated]);
}
