import type {
  AuditAction,
  MessageStatus,
  MessageType,
  Prisma,
} from "@prisma/client";

export type MessageCursor = {
  createdAt: Date;
  id: string;
};

export type AttachmentRecord = {
  id: string;
  conversationId: string | null;
  messageId: string | null;
  uploaderId: string;
  status: string;
  virusScanStatus: string;
  storageKey: string;
  bucket: string | null;
  mimeType: string;
  fileName: string;
  byteSize: bigint;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  thumbnailKey: string | null;
  deletedAt: Date | null;
};

export type MessageRecord = {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  status: MessageStatus;
  content: string;
  clientMessageId: string | null;
  replyToMessageId: string | null;
  linkPreview: Prisma.JsonValue | null;
  metadata: Prisma.JsonValue | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MessageWithFlags = MessageRecord & {
  starred: boolean;
  pinned: boolean;
  attachments: AttachmentRecord[];
};

export type ActiveMembership = {
  id: string;
  conversationId: string;
  userId: string;
  role: string;
  leftAt: Date | null;
  deletedAt: Date | null;
};

export type CreateAuditLogInput = {
  actorId?: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};

export type InsertMessageData = {
  conversationId: string;
  senderId: string;
  type: MessageType;
  status: MessageStatus;
  content: string;
  clientMessageId: string;
  replyToMessageId?: string | null;
  linkPreview?: Prisma.InputJsonValue | null;
  metadata?: Prisma.InputJsonValue | null;
};

export type SendInConversationResult = {
  message: MessageRecord;
  created: boolean;
};

export type DirectSendResult = {
  conversationId: string;
  message: MessageRecord;
  created: boolean;
  conversationCreated: boolean;
};

export type ActiveUserRecord = {
  id: string;
};

/** Thrown when send TX finds the sender is no longer an active member. */
export class NotActiveMemberError extends Error {
  constructor() {
    super("NOT_ACTIVE_MEMBER");
    this.name = "NotActiveMemberError";
  }
}

export interface IMessageRepository {
  findActiveMembership(
    userId: string,
    conversationId: string
  ): Promise<ActiveMembership | null>;

  /** Active members of a conversation (for realtime fan-out). */
  listActiveMemberUserIds(conversationId: string): Promise<string[]>;

  /** Per-member unread after a send (used for conversation.unread events). */
  listActiveMemberUnread(
    conversationId: string
  ): Promise<Array<{ userId: string; unreadCount: number }>>;

  findActiveUserById(userId: string): Promise<ActiveUserRecord | null>;

  findMessageById(messageId: string): Promise<MessageRecord | null>;

  findReplyInConversation(
    replyToMessageId: string,
    conversationId: string
  ): Promise<MessageRecord | null>;

  listMessagesKeyset(input: {
    conversationId: string;
    cursor?: MessageCursor;
    limit: number;
  }): Promise<MessageRecord[]>;

  findViewerStars(
    userId: string,
    messageIds: string[]
  ): Promise<Set<string>>;

  findPinnedMessageIds(
    conversationId: string,
    messageIds: string[]
  ): Promise<Set<string>>;

  findAttachmentsByMessageIds(
    messageIds: string[]
  ): Promise<Map<string, AttachmentRecord[]>>;

  findReadyAttachmentsForSender(input: {
    attachmentIds: string[];
    uploaderId: string;
    /** Target conversation, or null for pending DIRECT (unscoped attachments only). */
    conversationId: string | null;
  }): Promise<AttachmentRecord[]>;

  /**
   * Single TX: idempotent insert (or return existing), bind attachments,
   * update lastMessage*, increment unread, audit.
   */
  sendInConversation(input: {
    data: InsertMessageData;
    attachmentIds: string[];
    preview: string;
    audit: CreateAuditLogInput;
  }): Promise<SendInConversationResult>;

  /**
   * Single TX: lazy DIRECT create + first message (CAS on pair key).
   */
  sendDirectFirstMessage(input: {
    senderId: string;
    peerUserId: string;
    pairKey: string;
    data: Omit<InsertMessageData, "conversationId">;
    attachmentIds: string[];
    preview: string;
    createConversationAudit: CreateAuditLogInput;
    sendAudit: CreateAuditLogInput;
  }): Promise<DirectSendResult>;

  retryFailedMessage(input: {
    messageId: string;
    senderId: string;
    audit: CreateAuditLogInput;
  }): Promise<MessageRecord | null>;

  softDeleteMessage(input: {
    messageId: string;
    audit: CreateAuditLogInput;
  }): Promise<MessageRecord | null>;

  starMessage(input: {
    userId: string;
    messageId: string;
    audit: CreateAuditLogInput;
  }): Promise<boolean>;

  unstarMessage(input: {
    userId: string;
    messageId: string;
    audit: CreateAuditLogInput;
  }): Promise<boolean>;

  pinMessage(input: {
    userId: string;
    messageId: string;
    conversationId: string;
    audit: CreateAuditLogInput;
  }): Promise<boolean>;

  unpinMessage(input: {
    messageId: string;
    conversationId: string;
    audit: CreateAuditLogInput;
  }): Promise<boolean>;
}
