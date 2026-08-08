import { randomUUID } from "node:crypto";
import type {
  ConversationStatus,
  MemberRole,
} from "@prisma/client";
import type {
  AccessibleConversationResult,
  ActiveMemberRecord,
  ConversationRecord,
  ConversationUserRecord,
  CreateAuditLogInput,
  IConversationRepository,
  InboxQueryResult,
} from "../../src/modules/conversations/interfaces/IConversationRepository.js";

export type InMemoryConversation = ConversationRecord;

export type InMemoryMember = ActiveMemberRecord & {
  leftAt: Date | null;
  deletedAt: Date | null;
};

export type InMemoryConvUser = ConversationUserRecord & {
  deletedAt: Date | null;
  passwordHash: string;
};

function isActiveMember(m: InMemoryMember): boolean {
  return m.leftAt == null && m.deletedAt == null;
}

function isActiveConversation(c: InMemoryConversation): boolean {
  return c.deletedAt == null && c.status === "ACTIVE";
}

/**
 * In-memory conversation repository for unit / HTTP tests.
 */
export class InMemoryConversationRepository implements IConversationRepository {
  conversations = new Map<string, InMemoryConversation>();
  members = new Map<string, InMemoryMember>();
  users = new Map<string, InMemoryConvUser>();
  auditLogs: CreateAuditLogInput[] = [];

  seedUser(user: InMemoryConvUser): void {
    this.users.set(user.id, { ...user });
  }

  seedConversation(conversation: InMemoryConversation): void {
    this.conversations.set(conversation.id, { ...conversation });
  }

  seedMember(member: InMemoryMember): void {
    this.members.set(member.id, { ...member });
  }

  async findInboxForUser(
    userId: string,
    limit: number
  ): Promise<InboxQueryResult> {
    const items = [...this.members.values()]
      .filter((m) => {
        if (m.userId !== userId || !isActiveMember(m)) {
          return false;
        }
        const c = this.conversations.get(m.conversationId);
        return c ? isActiveConversation(c) : false;
      })
      .map((m) => ({
        membership: this.toActiveMember(m),
        conversation: { ...this.conversations.get(m.conversationId)! },
      }));

    items.sort((a, b) => {
      const aNull = a.conversation.lastMessageAt == null;
      const bNull = b.conversation.lastMessageAt == null;
      if (aNull && !bNull) {
        return 1;
      }
      if (!aNull && bNull) {
        return -1;
      }
      if (aNull && bNull) {
        return a.conversation.id < b.conversation.id ? -1 : 1;
      }
      const diff =
        b.conversation.lastMessageAt!.getTime() -
        a.conversation.lastMessageAt!.getTime();
      if (diff !== 0) {
        return diff;
      }
      return a.conversation.id < b.conversation.id ? -1 : 1;
    });

    const truncated = items.length > limit;
    return {
      items: truncated ? items.slice(0, limit) : items,
      truncated,
    };
  }

  async findActiveMembersByConversationIds(
    conversationIds: string[]
  ): Promise<ActiveMemberRecord[]> {
    const idSet = new Set(conversationIds);
    return [...this.members.values()]
      .filter((m) => idSet.has(m.conversationId) && isActiveMember(m))
      .map((m) => this.toActiveMember(m));
  }

  async findUsersByIds(userIds: string[]): Promise<ConversationUserRecord[]> {
    return userIds
      .map((id) => this.users.get(id))
      .filter((u): u is InMemoryConvUser => Boolean(u) && u.deletedAt == null)
      .map((u) => ({
        id: u.id,
        name: u.name,
        avatarUrl: u.avatarUrl,
        phone: u.phone,
        about: u.about,
      }));
  }

  async findAccessibleConversation(
    userId: string,
    conversationId: string
  ): Promise<AccessibleConversationResult | null> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || !isActiveConversation(conversation)) {
      return null;
    }

    const membership = [...this.members.values()].find(
      (m) =>
        m.userId === userId &&
        m.conversationId === conversationId &&
        isActiveMember(m)
    );
    if (!membership) {
      return null;
    }

    const members = await this.findActiveMembersByConversationIds([
      conversationId,
    ]);

    return {
      membership: this.toActiveMember(membership),
      conversation: { ...conversation },
      members,
    };
  }

  async updateMute(input: {
    userId: string;
    conversationId: string;
    muted: boolean;
    audit: CreateAuditLogInput;
  }): Promise<AccessibleConversationResult | null> {
    const membership = [...this.members.values()].find(
      (m) =>
        m.userId === input.userId &&
        m.conversationId === input.conversationId &&
        isActiveMember(m)
    );
    const conversation = this.conversations.get(input.conversationId);
    if (!membership || !conversation || !isActiveConversation(conversation)) {
      return null;
    }

    membership.muted = input.muted;
    this.auditLogs.push(input.audit);

    const members = await this.findActiveMembersByConversationIds([
      input.conversationId,
    ]);

    return {
      membership: this.toActiveMember(membership),
      conversation: { ...conversation },
      members,
    };
  }

  async markRead(input: {
    userId: string;
    conversationId: string;
    audit: CreateAuditLogInput;
  }): Promise<boolean> {
    const membership = [...this.members.values()].find(
      (m) =>
        m.userId === input.userId &&
        m.conversationId === input.conversationId &&
        isActiveMember(m)
    );
    const conversation = this.conversations.get(input.conversationId);
    if (!membership || !conversation || !isActiveConversation(conversation)) {
      return false;
    }

    membership.unreadCount = 0;
    membership.lastReadAt = new Date();
    membership.lastReadMessageId = conversation.lastMessageId;
    this.auditLogs.push(input.audit);
    return true;
  }

  async markPeerMessagesRead(_input: {
    conversationId: string;
    readerUserId: string;
  }): Promise<number> {
    // In-memory tests do not track per-message status.
    return 0;
  }

  private toActiveMember(m: InMemoryMember): ActiveMemberRecord {
    return {
      id: m.id,
      conversationId: m.conversationId,
      userId: m.userId,
      role: m.role,
      muted: m.muted,
      pinned: m.pinned,
      unreadCount: m.unreadCount,
      lastReadMessageId: m.lastReadMessageId,
      lastReadAt: m.lastReadAt,
    };
  }

  static id(): string {
    return randomUUID();
  }
}

export function makeConversation(
  overrides: Partial<InMemoryConversation> &
    Pick<InMemoryConversation, "id" | "type">
): InMemoryConversation {
  return {
    status: "ACTIVE" as ConversationStatus,
    name: null,
    avatarUrl: null,
    description: null,
    inviteCode: null,
    createdById: null,
    lastMessagePreview: null,
    lastMessageAt: null,
    lastMessageId: null,
    deletedAt: null,
    ...overrides,
  };
}

export function makeMember(
  overrides: Partial<InMemoryMember> &
    Pick<InMemoryMember, "id" | "conversationId" | "userId">
): InMemoryMember {
  return {
    role: "MEMBER" as MemberRole,
    muted: false,
    pinned: false,
    unreadCount: 0,
    lastReadMessageId: null,
    lastReadAt: null,
    leftAt: null,
    deletedAt: null,
    ...overrides,
  };
}

export function seedUser(
  overrides: Partial<InMemoryConvUser> & Pick<InMemoryConvUser, "id" | "name">
): InMemoryConvUser {
  return {
    avatarUrl: null,
    phone: null,
    about: null,
    deletedAt: null,
    passwordHash: "secret-hash",
    ...overrides,
  };
}
