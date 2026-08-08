import type {
  AuditAction,
  ConversationStatus,
  ConversationType,
  MemberRole,
} from "@prisma/client";

export type ConversationUserRecord = {
  id: string;
  name: string;
  avatarUrl: string | null;
  phone: string | null;
  about: string | null;
};

export type ActiveMemberRecord = {
  id: string;
  conversationId: string;
  userId: string;
  role: MemberRole;
  muted: boolean;
  pinned: boolean;
  unreadCount: number;
  lastReadMessageId: string | null;
  lastReadAt: Date | null;
};

export type ConversationRecord = {
  id: string;
  type: ConversationType;
  status: ConversationStatus;
  name: string | null;
  avatarUrl: string | null;
  description: string | null;
  inviteCode: string | null;
  createdById: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: Date | null;
  lastMessageId: string | null;
  deletedAt: Date | null;
};

export type InboxMembershipRecord = {
  membership: ActiveMemberRecord;
  conversation: ConversationRecord;
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

export type InboxQueryResult = {
  items: InboxMembershipRecord[];
  truncated: boolean;
};

export type AccessibleConversationResult = {
  membership: ActiveMemberRecord;
  conversation: ConversationRecord;
  members: ActiveMemberRecord[];
};

/**
 * Conversation persistence — Prisma only.
 */
export interface IConversationRepository {
  findInboxForUser(userId: string, limit: number): Promise<InboxQueryResult>;

  findActiveMembersByConversationIds(
    conversationIds: string[]
  ): Promise<ActiveMemberRecord[]>;

  findUsersByIds(userIds: string[]): Promise<ConversationUserRecord[]>;

  findAccessibleConversation(
    userId: string,
    conversationId: string
  ): Promise<AccessibleConversationResult | null>;

  updateMute(input: {
    userId: string;
    conversationId: string;
    muted: boolean;
    audit: CreateAuditLogInput;
  }): Promise<AccessibleConversationResult | null>;

  markRead(input: {
    userId: string;
    conversationId: string; 
    audit: CreateAuditLogInput;
  }): Promise<boolean>;

  /** Persist read receipts for messages the reader did not send. */
  markPeerMessagesRead(input: {
    conversationId: string;
    readerUserId: string;
  }): Promise<number>;
}
