import { io, type Socket } from "socket.io-client";
import { getSocketUrl } from "../../config/env";
import { getAccessToken, syncAccessTokenFromDocumentCookie } from "./tokenStore";

/** Real-time event names — keep in sync with backend `RealtimeEvents`. */
export const RealtimeEvents = {
  MESSAGE_CREATED: "message.created",
  MESSAGE_UPDATED: "message.updated",
  MESSAGE_DELETED: "message.deleted",
  MESSAGE_RETRY: "message.retry",
  MESSAGE_STARRED: "message.starred",
  MESSAGE_UNSTARRED: "message.unstarred",
  MESSAGE_PINNED: "message.pinned",
  MESSAGE_UNPINNED: "message.unpinned",
  MESSAGE_REACTION: "message.reaction",
  MESSAGE_REACTION_REMOVED: "message.reaction.removed",
  MESSAGE_DELIVERED: "message.delivered",
  MESSAGE_READ: "message.read",
  CONVERSATION_CREATED: "conversation.created",
  CONVERSATION_UPDATED: "conversation.updated",
  CONVERSATION_DELETED: "conversation.deleted",
  CONVERSATION_UNREAD: "conversation.unread",
  MEMBER_JOINED: "member.joined",
  MEMBER_LEFT: "member.left",
  MEMBER_REMOVED: "member.removed",
  ROLE_CHANGED: "role.changed",
  OWNERSHIP_TRANSFERRED: "ownership.transferred",
  UPLOAD_COMPLETED: "upload.completed",
  UPLOAD_FAILED: "upload.failed",
  PRESENCE_ONLINE: "presence.online",
  PRESENCE_OFFLINE: "presence.offline",
  PRESENCE_LAST_SEEN: "presence.lastSeen",
  PRESENCE_STATUS_CHANGED: "presence.statusChanged",
  TYPING_STARTED: "typing.started",
  TYPING_STOPPED: "typing.stopped",
  NOTIFICATION_CREATED: "notification.created",
  NOTIFICATION_UPDATED: "notification.updated",
  NOTIFICATION_DELETED: "notification.deleted",
  NOTIFICATION_READ: "notification.read",
  NOTIFICATION_READ_ALL: "notification.readAll",
} as const;

export type RealtimeEventName =
  (typeof RealtimeEvents)[keyof typeof RealtimeEvents];

type SocketEventHandler = (payload: unknown) => void;

let socket: Socket | null = null;
const eventHandlers = new Map<string, Set<SocketEventHandler>>();

function resolveSocketUrl(): string {
  const configured = getSocketUrl();
  if (configured) {
    return configured;
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "";
}

function attachStoredHandlers(activeSocket: Socket): void {
  for (const [event, handlers] of eventHandlers.entries()) {
    for (const handler of handlers) {
      activeSocket.on(event, handler);
    }
  }
}

export function connectSocket(): Socket {
  if (socket?.connected) {
    return socket;
  }

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  syncAccessTokenFromDocumentCookie();
  const token = getAccessToken();

  socket = io(resolveSocketUrl(), {
    path: "/socket.io",
    withCredentials: true,
    autoConnect: true,
    auth: {
      ...(token ? { token } : {}),
      deviceType: "browser",
    },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });

  attachStoredHandlers(socket);
  return socket;
}

export function disconnectSocket(): void {
  if (!socket) {
    return;
  }
  socket.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}

export function onSocketEvent(
  event: RealtimeEventName | string,
  handler: SocketEventHandler
): () => void {
  let handlers = eventHandlers.get(event);
  if (!handlers) {
    handlers = new Set();
    eventHandlers.set(event, handlers);
  }
  handlers.add(handler);
  socket?.on(event, handler);

  return () => {
    handlers?.delete(handler);
    socket?.off(event, handler);
  };
}

export function emitSocketEvent<TResponse = unknown>(
  event: string,
  payload?: unknown
): Promise<TResponse> {
  const activeSocket = socket ?? connectSocket();
  return new Promise((resolve, reject) => {
    const settle = (response: TResponse | { error?: string }) => {
      if (
        response &&
        typeof response === "object" &&
        "error" in response &&
        response.error
      ) {
        reject(new Error(String(response.error)));
        return;
      }
      resolve(response as TResponse);
    };

    const doEmit = () => {
      activeSocket.emit(event, payload, settle);
    };

    if (activeSocket.connected) {
      doEmit();
      return;
    }

    const onConnect = () => {
      activeSocket.off("connect_error", onError);
      doEmit();
    };
    const onError = (error: Error) => {
      activeSocket.off("connect", onConnect);
      reject(error);
    };

    activeSocket.once("connect", onConnect);
    activeSocket.once("connect_error", onError);
  });
}

/** Emit without waiting for an ack (heartbeats, fire-and-forget). */
export function emitSocketFireAndForget(
  event: string,
  payload?: unknown
): void {
  const activeSocket = socket ?? connectSocket();
  const send = () => {
    activeSocket.emit(event, payload);
  };
  if (activeSocket.connected) {
    send();
    return;
  }
  activeSocket.once("connect", send);
}

/** Subscribe once to low-level socket lifecycle (connect / connect_error). */
export function onSocketConnection(
  handler: (connected: boolean, error?: Error) => void
): () => void {
  const activeSocket = socket ?? connectSocket();
  const onConnect = () => handler(true);
  const onDisconnect = () => handler(false);
  const onError = (error: Error) => handler(false, error);
  activeSocket.on("connect", onConnect);
  activeSocket.on("disconnect", onDisconnect);
  activeSocket.on("connect_error", onError);
  if (activeSocket.connected) {
    handler(true);
  }
  return () => {
    activeSocket.off("connect", onConnect);
    activeSocket.off("disconnect", onDisconnect);
    activeSocket.off("connect_error", onError);
  };
}

/** Test-only reset. */
export function resetSocketClientForTests(): void {
  disconnectSocket();
  eventHandlers.clear();
}
