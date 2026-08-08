export type ConversationType = "direct" | "group";

export type MessageType =
  | "text"
  | "image"
  | "document"
  | "link"
  | "reply"
  | "voice"
  | "video"
  | "sticker"
  | "contact"
  | "location"
  | "system";

export type MessageStatus =
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export type PresenceStatus = "online" | "offline" | "away" | "invisible";

export type MobileChatView = "list" | "conversation";

export type MemberRole = "owner" | "admin" | "member";

export type LoadStatus = "idle" | "loading" | "succeeded" | "failed";

export interface User {
  id: string;
  name: string;
  avatar: string;
  phone?: string;
  about?: string;
}

export interface GroupMember {
  userId: string;
  role: MemberRole;
}

export interface LinkPreview {
  title: string;
  url: string;
  imageUrl: string;
}

export interface MessageAttachment {
  id: string;
  mimeType: string;
  fileName: string;
  byteSize: string;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  status?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  content: string;
  createdAt: string;
  status: MessageStatus;
  starred: boolean;
  /** Pinned in the conversation (shown in the pinned banner). */
  pinned: boolean;
  deleted: boolean;
  replyToMessageId?: string;
  imageUrl?: string;
  documentName?: string;
  linkPreview?: LinkPreview;
  /** Client idempotency key used for optimistic sends / retries. */
  clientMessageId?: string;
  metadata?: Record<string, unknown>;
  attachmentIds?: string[];
  attachments?: MessageAttachment[];
  lat?: number;
  lng?: number;
  contactName?: string;
  contactPhone?: string;
  durationMs?: number;
  mimeType?: string;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  name: string;
  avatar: string;
  memberIds: string[];
  pinned: boolean;
  lastMessagePreview: string;
  lastMessageAt: string;
  description?: string;
  members?: GroupMember[];
  createdBy?: string;
  adminIds?: string[];
  inviteCode?: string;
  muted?: boolean;
}

export interface PresenceState {
  [userId: string]: PresenceStatus;
}

export interface TypingState {
  [conversationId: string]: string[];
}

export interface ActiveConversationState {
  conversationId: string | null;
  replyToMessageId: string | null;
}

export interface SendMessageParams {
  conversationId: string;
  content: string;
  replyToMessageId?: string;
  type?: MessageType;
  attachmentIds?: string[];
  metadata?: Record<string, unknown>;
  linkPreview?: LinkPreview;
  /** Mock/test-only: force the next send to fail. */
  forceFailure?: boolean;
  senderId: string;
  /** Stable client id for optimistic send + retry idempotency. */
  clientMessageId?: string;
}

export interface SendDirectMessageParams {
  peerUserId: string;
  content: string;
  clientMessageId: string;
  type?: MessageType;
  replyToMessageId?: string;
  attachmentIds?: string[];
  metadata?: Record<string, unknown>;
  linkPreview?: LinkPreview;
}

export interface LoadMessagesParams {
  conversationId: string;
  cursor?: string | null;
  limit?: number;
}

export interface PaginatedMessages {
  messages: Message[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ConversationMessagesState {
  messages: Message[];
  nextCursor: string | null;
  hasMore: boolean;
  initialLoadStatus: LoadStatus;
  loadingOlderStatus: LoadStatus;
  error: string | null;
  oldestLoadedMessageId: string | null;
}

export interface ChatLoadingState {
  conversations: boolean;
  messages: Record<string, boolean>;
}

export interface ChatErrorState {
  conversations: string | null;
  messages: Record<string, string | null>;
}

export function createEmptyMessagesState(): ConversationMessagesState {
  return {
    messages: [],
    nextCursor: null,
    hasMore: false,
    initialLoadStatus: "idle",
    loadingOlderStatus: "idle",
    error: null,
    oldestLoadedMessageId: null,
  };
}
