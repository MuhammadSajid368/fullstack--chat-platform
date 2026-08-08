/**
 * Real-time event names — transport contract for Socket.IO fan-out.
 */

export const RealtimeEvents = {
  // Messages
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

  // Conversations
  CONVERSATION_CREATED: "conversation.created",
  CONVERSATION_UPDATED: "conversation.updated",
  CONVERSATION_DELETED: "conversation.deleted",
  CONVERSATION_UNREAD: "conversation.unread",

  // Groups / membership
  MEMBER_JOINED: "member.joined",
  MEMBER_LEFT: "member.left",
  MEMBER_REMOVED: "member.removed",
  ROLE_CHANGED: "role.changed",
  OWNERSHIP_TRANSFERRED: "ownership.transferred",

  // Uploads
  UPLOAD_COMPLETED: "upload.completed",
  UPLOAD_FAILED: "upload.failed",

  // Presence
  PRESENCE_ONLINE: "presence.online",
  PRESENCE_OFFLINE: "presence.offline",
  PRESENCE_LAST_SEEN: "presence.lastSeen",
  PRESENCE_STATUS_CHANGED: "presence.statusChanged",

  // Typing (outgoing fan-out)
  TYPING_STARTED: "typing.started",
  TYPING_STOPPED: "typing.stopped",
  /** @deprecated use TYPING_STARTED — kept for transitional alias */
  TYPING_START: "typing.started",
  /** @deprecated use TYPING_STOPPED — kept for transitional alias */
  TYPING_STOP: "typing.stopped",

  // Notifications
  NOTIFICATION_CREATED: "notification.created",
  NOTIFICATION_UPDATED: "notification.updated",
  NOTIFICATION_DELETED: "notification.deleted",
  NOTIFICATION_READ: "notification.read",
  NOTIFICATION_READ_ALL: "notification.readAll",
} as const;

export type RealtimeEventName =
  (typeof RealtimeEvents)[keyof typeof RealtimeEvents];

export type RealtimeEvent = {
  name: RealtimeEventName | string;
  rooms: string[];
  payload: Record<string, unknown>;
  /** Omit emitting to this socket (e.g. typing originator). */
  exceptSocketId?: string;
};

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

/** Watchers who subscribed to a user's presence updates. */
export function presenceRoom(userId: string): string {
  return `presence:${userId}`;
}

export function conversationRoom(conversationId: string): string {
  return `conversation:${conversationId}`;
}

export function groupRoom(groupId: string): string {
  return `group:${groupId}`;
}
