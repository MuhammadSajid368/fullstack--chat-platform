import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  AccessibleConversationResult,
  ActiveMemberRecord,
  ConversationRecord,
  ConversationUserRecord,
  CreateAuditLogInput,
  IConversationRepository,
  InboxMembershipRecord,
  InboxQueryResult,
} from "@modules/conversations/interfaces/IConversationRepository.js";

const conversationSelect = {
  id: true,
  type: true,
  status: true,
  name: true,
  avatarUrl: true,
  description: true,
  inviteCode: true,
  createdById: true,
  lastMessagePreview: true,
  lastMessageAt: true,
  lastMessageId: true,
  deletedAt: true,
} satisfies Prisma.ConversationSelect;

const memberSelect = {
  id: true,
  conversationId: true,
  userId: true,
  role: true,
  muted: true,
  pinned: true,
  unreadCount: true,
  lastReadMessageId: true,
  lastReadAt: true,
} satisfies Prisma.ConversationMemberSelect;

const userSelect = {
  id: true,
  name: true,
  avatarUrl: true,
  phone: true,
  about: true,
} satisfies Prisma.UserSelect;

function toJson(
  value: Record<string, unknown> | undefined
): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value as Prisma.InputJsonValue;
}

function mapMember(
  row: Prisma.ConversationMemberGetPayload<{ select: typeof memberSelect }>
): ActiveMemberRecord {
  return { ...row };
}

function mapConversation(
  row: Prisma.ConversationGetPayload<{ select: typeof conversationSelect }>
): ConversationRecord {
  return { ...row };
}

/**
 * Conversation repository — Prisma access only.
 */
export class ConversationRepository implements IConversationRepository {
  constructor(protected readonly prisma: PrismaClient) {}

  async findInboxForUser(
    userId: string,
    limit: number
  ): Promise<InboxQueryResult> {
    const rows = await this.prisma.conversationMember.findMany({
      where: {
        userId,
        leftAt: null,
        deletedAt: null,
        conversation: {
          deletedAt: null,
          status: "ACTIVE",
        },
      },
      select: {
        ...memberSelect,
        conversation: { select: conversationSelect },
      },
      orderBy: {
        conversation: {
          lastMessageAt: { sort: "desc", nulls: "last" },
        },
      },
      take: limit + 1,
    });

    const truncated = rows.length > limit;
    const page = truncated ? rows.slice(0, limit) : rows;

    const items: InboxMembershipRecord[] = page.map((row) => {
      const { conversation, ...membership } = row;
      return {
        membership: mapMember(membership),
        conversation: mapConversation(conversation),
      };
    });

    return { items, truncated };
  }

  async findActiveMembersByConversationIds(
    conversationIds: string[]
  ): Promise<ActiveMemberRecord[]> {
    if (conversationIds.length === 0) {
      return [];
    }

    const rows = await this.prisma.conversationMember.findMany({
      where: {
        conversationId: { in: conversationIds },
        leftAt: null,
        deletedAt: null,
      },
      select: memberSelect,
    });

    return rows.map(mapMember);
  }

  async findUsersByIds(userIds: string[]): Promise<ConversationUserRecord[]> {
    if (userIds.length === 0) {
      return [];
    }

    return this.prisma.user.findMany({
      where: {
        id: { in: userIds },
        deletedAt: null,
      },
      select: userSelect,
    });
  }

  async findAccessibleConversation(
    userId: string,
    conversationId: string
  ): Promise<AccessibleConversationResult | null> {
    const membership = await this.prisma.conversationMember.findFirst({
      where: {
        userId,
        conversationId,
        leftAt: null,
        deletedAt: null,
        conversation: {
          id: conversationId,
          deletedAt: null,
          status: "ACTIVE",
        },
      },
      select: {
        ...memberSelect,
        conversation: { select: conversationSelect },
      },
    });

    if (!membership) {
      return null;
    }

    const { conversation, ...memberRow } = membership;
    const members = await this.findActiveMembersByConversationIds([
      conversationId,
    ]);

    return {
      membership: mapMember(memberRow),
      conversation: mapConversation(conversation),
      members,
    };
  }

  async updateMute(input: {
    userId: string;
    conversationId: string;
    muted: boolean;
    audit: CreateAuditLogInput;
  }): Promise<AccessibleConversationResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.conversationMember.updateMany({
        where: {
          userId: input.userId,
          conversationId: input.conversationId,
          leftAt: null,
          deletedAt: null,
          conversation: {
            deletedAt: null,
            status: "ACTIVE",
          },
        },
        data: { muted: input.muted },
      });

      if (updated.count !== 1) {
        return null;
      }

      await tx.auditLog.create({
        data: {
          actorId: input.audit.actorId,
          action: input.audit.action,
          entityType: input.audit.entityType,
          entityId: input.audit.entityId ?? input.conversationId,
          metadata: toJson(input.audit.metadata),
          ipAddress: input.audit.ipAddress,
          userAgent: input.audit.userAgent,
        },
      });

      const membership = await tx.conversationMember.findFirst({
        where: {
          userId: input.userId,
          conversationId: input.conversationId,
          leftAt: null,
          deletedAt: null,
        },
        select: {
          ...memberSelect,
          conversation: { select: conversationSelect },
        },
      });

      if (!membership) {
        return null;
      }

      const members = await tx.conversationMember.findMany({
        where: {
          conversationId: input.conversationId,
          leftAt: null,
          deletedAt: null,
        },
        select: memberSelect,
      });

      const { conversation, ...memberRow } = membership;
      return {
        membership: mapMember(memberRow),
        conversation: mapConversation(conversation),
        members: members.map(mapMember),
      };
    });
  }

  async markRead(input: {
    userId: string;
    conversationId: string;
    audit: CreateAuditLogInput;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const membership = await tx.conversationMember.findFirst({
        where: {
          userId: input.userId,
          conversationId: input.conversationId,
          leftAt: null,
          deletedAt: null,
          conversation: {
            deletedAt: null,
            status: "ACTIVE",
          },
        },
        select: {
          id: true,
          conversation: {
            select: { lastMessageId: true },
          },
        },
      });

      if (!membership) {
        return false;
      }

      const now = new Date();
      await tx.conversationMember.update({
        where: { id: membership.id },
        data: {
          unreadCount: 0,
          lastReadAt: now,
          lastReadMessageId: membership.conversation.lastMessageId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: input.audit.actorId,
          action: input.audit.action,
          entityType: input.audit.entityType,
          entityId: input.audit.entityId ?? input.conversationId,
          metadata: toJson(input.audit.metadata),
          ipAddress: input.audit.ipAddress,
          userAgent: input.audit.userAgent,
        },
      });

      return true;
    });
  }

  async markPeerMessagesRead(input: {
    conversationId: string;
    readerUserId: string;
  }): Promise<number> {
    const result = await this.prisma.message.updateMany({
      where: {
        conversationId: input.conversationId,
        senderId: { not: input.readerUserId },
        deletedAt: null,
        status: { in: ["SENT", "DELIVERED"] },
      },
      data: { status: "READ" },
    });
    return result.count;
  }
}
