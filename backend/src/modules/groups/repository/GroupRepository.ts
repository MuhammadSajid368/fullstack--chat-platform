import type { Prisma, PrismaClient, MemberRole } from "@prisma/client";
import { ValidationError } from "@common/errors/index.js";
import type {
  ActiveUserRecord,
  CreateAuditLogInput,
  CreateGroupTxInput,
  CreateGroupTxResult,
  GroupConversationRecord,
  GroupMemberRecord,
  IGroupRepository,
} from "@modules/groups/interfaces/IGroupRepository.js";

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
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ConversationSelect;

const memberSelect = {
  id: true,
  conversationId: true,
  userId: true,
  role: true,
  groupRoleId: true,
  muted: true,
  pinned: true,
  unreadCount: true,
  leftAt: true,
  deletedAt: true,
} satisfies Prisma.ConversationMemberSelect;

function toJson(
  value: Record<string, unknown> | undefined
): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value as Prisma.InputJsonValue;
}

function mapConversation(
  row: Prisma.ConversationGetPayload<{ select: typeof conversationSelect }>
): GroupConversationRecord {
  return {
    ...row,
    type: "GROUP",
  };
}

function mapMember(
  row: Prisma.ConversationMemberGetPayload<{ select: typeof memberSelect }>
): GroupMemberRecord {
  return { ...row };
}

/**
 * Group repository — Prisma only. Groups are Conversation(type=GROUP).
 */
export class GroupRepository implements IGroupRepository {
  constructor(protected readonly prisma: PrismaClient) {}

  async findActiveGroup(
    groupId: string
  ): Promise<GroupConversationRecord | null> {
    const row = await this.prisma.conversation.findFirst({
      where: {
        id: groupId,
        type: "GROUP",
        deletedAt: null,
        status: "ACTIVE",
      },
      select: conversationSelect,
    });
    return row ? mapConversation(row) : null;
  }

  async findActiveMembership(
    userId: string,
    groupId: string
  ): Promise<GroupMemberRecord | null> {
    const row = await this.prisma.conversationMember.findFirst({
      where: {
        userId,
        conversationId: groupId,
        leftAt: null,
        deletedAt: null,
        conversation: {
          type: "GROUP",
          deletedAt: null,
          status: "ACTIVE",
        },
      },
      select: memberSelect,
    });
    return row ? mapMember(row) : null;
  }

  async listActiveMembers(groupId: string): Promise<GroupMemberRecord[]> {
    const rows = await this.prisma.conversationMember.findMany({
      where: {
        conversationId: groupId,
        leftAt: null,
        deletedAt: null,
      },
      select: memberSelect,
      orderBy: { joinedAt: "asc" },
    });
    return rows.map(mapMember);
  }

  async findActiveUsersByIds(userIds: string[]): Promise<ActiveUserRecord[]> {
    if (userIds.length === 0) {
      return [];
    }
    return this.prisma.user.findMany({
      where: {
        id: { in: userIds },
        deletedAt: null,
      },
      select: { id: true, suspendedAt: true },
    });
  }

  async countActiveMembers(groupId: string): Promise<number> {
    return this.prisma.conversationMember.count({
      where: {
        conversationId: groupId,
        leftAt: null,
        deletedAt: null,
      },
    });
  }

  async findSystemRoleIds(
    groupId: string
  ): Promise<{ ownerId: string; adminId: string; memberId: string } | null> {
    const rows = await this.prisma.groupRole.findMany({
      where: {
        conversationId: groupId,
        deletedAt: null,
        key: { in: ["owner", "admin", "member"] },
      },
      select: { id: true, key: true },
    });
    const byKey = new Map(rows.map((r) => [r.key, r.id]));
    const ownerId = byKey.get("owner");
    const adminId = byKey.get("admin");
    const memberId = byKey.get("member");
    if (!ownerId || !adminId || !memberId) {
      return null;
    }
    return { ownerId, adminId, memberId };
  }

  async createGroup(input: CreateGroupTxInput): Promise<CreateGroupTxResult> {
    return this.prisma.$transaction(async (tx) => {
      const allUserIds = [input.createdById, ...input.memberUserIds];
      const activeUsers = await tx.user.findMany({
        where: {
          id: { in: allUserIds },
          deletedAt: null,
          suspendedAt: null,
        },
        select: { id: true },
      });
      if (activeUsers.length !== allUserIds.length) {
        throw new ValidationError(
          "One or more users are unavailable for group membership",
          {
            memberUserIds:
              "All members must be active (not deleted or suspended)",
          }
        );
      }

      const conversation = await tx.conversation.create({
        data: {
          type: "GROUP",
          status: "ACTIVE",
          name: input.name,
          description: input.description,
          avatarUrl: input.avatarUrl,
          createdById: input.createdById,
        },
        select: conversationSelect,
      });

      const roles = await tx.groupRole.createManyAndReturn({
        data: [
          {
            conversationId: conversation.id,
            key: "owner",
            displayName: "Owner",
            isSystem: true,
            permissions: {},
          },
          {
            conversationId: conversation.id,
            key: "admin",
            displayName: "Admin",
            isSystem: true,
            permissions: {},
          },
          {
            conversationId: conversation.id,
            key: "member",
            displayName: "Member",
            isSystem: true,
            permissions: {},
          },
        ],
      });

      const roleByKey = new Map(roles.map((r) => [r.key, r.id]));
      const ownerRoleId = roleByKey.get("owner")!;
      const memberRoleId = roleByKey.get("member")!;

      await tx.conversationMember.create({
        data: {
          conversationId: conversation.id,
          userId: input.createdById,
          role: "OWNER",
          groupRoleId: ownerRoleId,
        },
      });

      if (input.memberUserIds.length > 0) {
        await tx.conversationMember.createMany({
          data: input.memberUserIds.map((userId) => ({
            conversationId: conversation.id,
            userId,
            role: "MEMBER" as MemberRole,
            groupRoleId: memberRoleId,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: input.audit.actorId,
          action: input.audit.action,
          entityType: input.audit.entityType,
          entityId: conversation.id,
          metadata: toJson(input.audit.metadata),
          ipAddress: input.audit.ipAddress,
          userAgent: input.audit.userAgent,
        },
      });

      return { conversation: mapConversation(conversation) };
    });
  }

  async updateGroupMetadata(input: {
    groupId: string;
    name?: string;
    description?: string | null;
    avatarUrl?: string | null;
    audit: CreateAuditLogInput;
  }): Promise<GroupConversationRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.conversation.findFirst({
        where: {
          id: input.groupId,
          type: "GROUP",
          deletedAt: null,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      if (!existing) {
        return null;
      }

      const updated = await tx.conversation.update({
        where: { id: input.groupId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.avatarUrl !== undefined
            ? { avatarUrl: input.avatarUrl }
            : {}),
        },
        select: conversationSelect,
      });

      await tx.auditLog.create({
        data: {
          actorId: input.audit.actorId,
          action: input.audit.action,
          entityType: input.audit.entityType,
          entityId: input.groupId,
          metadata: toJson(input.audit.metadata),
          ipAddress: input.audit.ipAddress,
          userAgent: input.audit.userAgent,
        },
      });

      return mapConversation(updated);
    });
  }

  async softDeleteGroup(input: {
    groupId: string;
    audit: CreateAuditLogInput;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.conversation.findFirst({
        where: {
          id: input.groupId,
          type: "GROUP",
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!existing) {
        return false;
      }

      const now = new Date();

      await tx.conversation.update({
        where: { id: input.groupId },
        data: { deletedAt: now, status: "ARCHIVED" },
      });

      await tx.conversationMember.updateMany({
        where: {
          conversationId: input.groupId,
          deletedAt: null,
        },
        data: {
          deletedAt: now,
          leftAt: now,
        },
      });

      await tx.groupRole.updateMany({
        where: {
          conversationId: input.groupId,
          deletedAt: null,
        },
        data: { deletedAt: now },
      });

      await tx.auditLog.create({
        data: {
          actorId: input.audit.actorId,
          action: input.audit.action,
          entityType: input.audit.entityType,
          entityId: input.groupId,
          metadata: toJson(input.audit.metadata),
          ipAddress: input.audit.ipAddress,
          userAgent: input.audit.userAgent,
        },
      });

      return true;
    });
  }

  async addMembers(input: {
    groupId: string;
    userIds: string[];
    memberRoleId: string | null;
    audit: CreateAuditLogInput;
  }): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      if (input.userIds.length === 0) {
        return 0;
      }

      await tx.conversationMember.createMany({
        data: input.userIds.map((userId) => ({
          conversationId: input.groupId,
          userId,
          role: "MEMBER" as MemberRole,
          groupRoleId: input.memberRoleId,
        })),
      });

      await tx.auditLog.create({
        data: {
          actorId: input.audit.actorId,
          action: input.audit.action,
          entityType: input.audit.entityType,
          entityId: input.groupId,
          metadata: toJson({
            ...input.audit.metadata,
            memberUserIds: input.userIds,
          }),
          ipAddress: input.audit.ipAddress,
          userAgent: input.audit.userAgent,
        },
      });

      return input.userIds.length;
    });
  }

  async removeMember(input: {
    groupId: string;
    userId: string;
    audit: CreateAuditLogInput;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const result = await tx.conversationMember.updateMany({
        where: {
          conversationId: input.groupId,
          userId: input.userId,
          leftAt: null,
          deletedAt: null,
        },
        data: {
          leftAt: now,
          deletedAt: now,
        },
      });

      if (result.count === 0) {
        return false;
      }

      await tx.auditLog.create({
        data: {
          actorId: input.audit.actorId,
          action: input.audit.action,
          entityType: input.audit.entityType,
          entityId: input.groupId,
          metadata: toJson({
            ...input.audit.metadata,
            removedUserId: input.userId,
          }),
          ipAddress: input.audit.ipAddress,
          userAgent: input.audit.userAgent,
        },
      });

      return true;
    });
  }

  async changeMemberRole(input: {
    groupId: string;
    userId: string;
    role: MemberRole;
    groupRoleId: string | null;
    audit: CreateAuditLogInput;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.conversationMember.updateMany({
        where: {
          conversationId: input.groupId,
          userId: input.userId,
          leftAt: null,
          deletedAt: null,
        },
        data: {
          role: input.role,
          groupRoleId: input.groupRoleId,
        },
      });

      if (result.count === 0) {
        return false;
      }

      await tx.auditLog.create({
        data: {
          actorId: input.audit.actorId,
          action: input.audit.action,
          entityType: input.audit.entityType,
          entityId: input.groupId,
          metadata: toJson({
            ...input.audit.metadata,
            targetUserId: input.userId,
            role: input.role,
          }),
          ipAddress: input.audit.ipAddress,
          userAgent: input.audit.userAgent,
        },
      });

      return true;
    });
  }

  async transferOwnership(input: {
    groupId: string;
    fromUserId: string;
    toUserId: string;
    ownerRoleId: string | null;
    adminRoleId: string | null;
    audit: CreateAuditLogInput;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // Serialize ownership changes on this conversation.
      await tx.$queryRaw`
        SELECT id FROM conversations WHERE id = ${input.groupId} FOR UPDATE
      `;

      const from = await tx.conversationMember.findFirst({
        where: {
          conversationId: input.groupId,
          userId: input.fromUserId,
          leftAt: null,
          deletedAt: null,
          role: "OWNER",
        },
        select: { id: true },
      });
      if (!from) {
        return false;
      }

      const toMember = await tx.conversationMember.findFirst({
        where: {
          conversationId: input.groupId,
          userId: input.toUserId,
          leftAt: null,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!toMember) {
        return false;
      }

      await tx.conversationMember.updateMany({
        where: {
          conversationId: input.groupId,
          userId: input.fromUserId,
          leftAt: null,
          deletedAt: null,
        },
        data: {
          role: "ADMIN",
          groupRoleId: input.adminRoleId,
        },
      });

      await tx.conversationMember.updateMany({
        where: {
          conversationId: input.groupId,
          userId: input.toUserId,
          leftAt: null,
          deletedAt: null,
        },
        data: {
          role: "OWNER",
          groupRoleId: input.ownerRoleId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: input.audit.actorId,
          action: input.audit.action,
          entityType: input.audit.entityType,
          entityId: input.groupId,
          metadata: toJson({
            ...input.audit.metadata,
            fromUserId: input.fromUserId,
            toUserId: input.toUserId,
          }),
          ipAddress: input.audit.ipAddress,
          userAgent: input.audit.userAgent,
        },
      });

      return true;
    });
  }

  async leaveGroup(input: {
    groupId: string;
    userId: string;
    audit: CreateAuditLogInput;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const result = await tx.conversationMember.updateMany({
        where: {
          conversationId: input.groupId,
          userId: input.userId,
          leftAt: null,
          deletedAt: null,
        },
        data: {
          leftAt: now,
          deletedAt: now,
        },
      });

      if (result.count === 0) {
        return false;
      }

      await tx.auditLog.create({
        data: {
          actorId: input.audit.actorId,
          action: input.audit.action,
          entityType: input.audit.entityType,
          entityId: input.groupId,
          metadata: toJson(input.audit.metadata),
          ipAddress: input.audit.ipAddress,
          userAgent: input.audit.userAgent,
        },
      });

      return true;
    });
  }
}
