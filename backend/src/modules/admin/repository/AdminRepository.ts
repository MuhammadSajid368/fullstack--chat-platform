import type {
  AuditAction,
  GlobalRole,
  Prisma,
  PrismaClient,
  ReportStatus,
} from "@prisma/client";
import type {
  AdminAuditRecord,
  AdminAuditWrite,
  AdminConversationRecord,
  AdminGroupRecord,
  AdminListAuditFilters,
  AdminListConversationsFilters,
  AdminListGroupsFilters,
  AdminListMessagesFilters,
  AdminListReportsFilters,
  AdminListUsersFilters,
  AdminMemberRecord,
  AdminMessageRecord,
  AdminReportRecord,
  AdminUserRecord,
  IAdminRepository,
} from "@modules/admin/interfaces/IAdminRepository.js";

const userSelect = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  phone: true,
  about: true,
  globalRole: true,
  suspendedAt: true,
  lastSeenAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.UserSelect;

function cursorWhere(
  cursor?: { createdAt: Date; id: string }
): Prisma.UserWhereInput | undefined {
  if (!cursor) return undefined;
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

function toJson(
  value: Record<string, unknown> | undefined
): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return value as Prisma.InputJsonValue;
}

function buildAuditData(audit: AdminAuditWrite) {
  return {
    actorId: audit.actorId,
    action: audit.action,
    entityType: audit.entityType,
    entityId: audit.entityId,
    ipAddress: audit.context.ipAddress,
    userAgent: audit.context.userAgent,
    metadata: toJson({
      ...(audit.metadata ?? {}),
      ...(audit.reason ? { reason: audit.reason } : {}),
      ...(audit.context.requestId
        ? { requestId: audit.context.requestId }
        : {}),
    }),
  };
}

async function countActiveMembers(
  tx: Prisma.TransactionClient,
  conversationId: string
): Promise<number> {
  return tx.conversationMember.count({
    where: {
      conversationId,
      deletedAt: null,
      leftAt: null,
    },
  });
}

/**
 * AdminRepository — privileged moderation queries; always writes AuditLog on mutations.
 */
export class AdminRepository implements IAdminRepository {
  constructor(protected readonly prisma: PrismaClient) {}

  async getGlobalRole(userId: string): Promise<GlobalRole | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { globalRole: true },
    });
    return user?.globalRole ?? null;
  }

  async findUserById(userId: string): Promise<AdminUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: userSelect,
    });
  }

  async listUsers(filters: AdminListUsersFilters): Promise<AdminUserRecord[]> {
    const where: Prisma.UserWhereInput = {
      ...(filters.includeDeleted ? {} : { deletedAt: null }),
      ...(filters.q
        ? {
            OR: [
              { name: { contains: filters.q, mode: "insensitive" } },
              { email: { contains: filters.q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...cursorWhere(filters.cursor),
    };

    return this.prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: filters.limit + 1,
    });
  }

  async suspendUser(input: {
    userId: string;
    audit: AdminAuditWrite;
  }): Promise<AdminUserRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({
        where: { id: input.userId, deletedAt: null, suspendedAt: null },
        select: { id: true },
      });
      if (!existing) return null;

      const updated = await tx.user.update({
        where: { id: input.userId },
        data: { suspendedAt: new Date() },
        select: userSelect,
      });
      await tx.auditLog.create({ data: buildAuditData(input.audit) });
      return updated;
    });
  }

  async unsuspendUser(input: {
    userId: string;
    audit: AdminAuditWrite;
  }): Promise<AdminUserRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({
        where: {
          id: input.userId,
          deletedAt: null,
          suspendedAt: { not: null },
        },
        select: { id: true },
      });
      if (!existing) return null;

      const updated = await tx.user.update({
        where: { id: input.userId },
        data: { suspendedAt: null },
        select: userSelect,
      });
      await tx.auditLog.create({ data: buildAuditData(input.audit) });
      return updated;
    });
  }

  async softDeleteUser(input: {
    userId: string;
    audit: AdminAuditWrite;
  }): Promise<AdminUserRecord | null> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({
        where: { id: input.userId, deletedAt: null },
        select: { id: true },
      });
      if (!existing) return null;

      const updated = await tx.user.update({
        where: { id: input.userId },
        data: { deletedAt: now, suspendedAt: now },
        select: userSelect,
      });

      await tx.session.updateMany({
        where: { userId: input.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.refreshToken.updateMany({
        where: { userId: input.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.auditLog.create({ data: buildAuditData(input.audit) });
      return updated;
    });
  }

  async restoreUser(input: {
    userId: string;
    audit: AdminAuditWrite;
  }): Promise<AdminUserRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({
        where: { id: input.userId, deletedAt: { not: null } },
        select: { id: true },
      });
      if (!existing) return null;

      const updated = await tx.user.update({
        where: { id: input.userId },
        data: { deletedAt: null, suspendedAt: null },
        select: userSelect,
      });
      await tx.auditLog.create({ data: buildAuditData(input.audit) });
      return updated;
    });
  }

  async forceLogoutAll(input: {
    userId: string;
    audit: AdminAuditWrite;
  }): Promise<{ sessionsRevoked: number; refreshTokensRevoked: number }> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const sessions = await tx.session.updateMany({
        where: { userId: input.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      const tokens = await tx.refreshToken.updateMany({
        where: { userId: input.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.auditLog.create({ data: buildAuditData(input.audit) });
      return {
        sessionsRevoked: sessions.count,
        refreshTokensRevoked: tokens.count,
      };
    });
  }

  async listConversations(
    filters: AdminListConversationsFilters
  ): Promise<AdminConversationRecord[]> {
    const where: Prisma.ConversationWhereInput = {
      ...(filters.includeDeleted ? {} : { deletedAt: null }),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.q
        ? { name: { contains: filters.q, mode: "insensitive" } }
        : {}),
      ...(filters.cursor
        ? {
            OR: [
              { createdAt: { lt: filters.cursor.createdAt } },
              {
                createdAt: filters.cursor.createdAt,
                id: { lt: filters.cursor.id },
              },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.conversation.findMany({
      where,
      select: {
        id: true,
        type: true,
        status: true,
        name: true,
        avatarUrl: true,
        description: true,
        lastMessageAt: true,
        createdAt: true,
        deletedAt: true,
        _count: {
          select: {
            members: {
              where: { deletedAt: null, leftAt: null },
            },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: filters.limit + 1,
    });

    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      name: r.name,
      avatarUrl: r.avatarUrl,
      description: r.description,
      memberCount: r._count.members,
      lastMessageAt: r.lastMessageAt,
      createdAt: r.createdAt,
      deletedAt: r.deletedAt,
    }));
  }

  async findConversationById(
    conversationId: string
  ): Promise<AdminConversationRecord | null> {
    const r = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        type: true,
        status: true,
        name: true,
        avatarUrl: true,
        description: true,
        lastMessageAt: true,
        createdAt: true,
        deletedAt: true,
        _count: {
          select: {
            members: { where: { deletedAt: null, leftAt: null } },
          },
        },
      },
    });
    if (!r) return null;
    return {
      id: r.id,
      type: r.type,
      status: r.status,
      name: r.name,
      avatarUrl: r.avatarUrl,
      description: r.description,
      memberCount: r._count.members,
      lastMessageAt: r.lastMessageAt,
      createdAt: r.createdAt,
      deletedAt: r.deletedAt,
    };
  }

  async softDeleteConversation(input: {
    conversationId: string;
    audit: AdminAuditWrite;
  }): Promise<boolean> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.conversation.findFirst({
        where: { id: input.conversationId, deletedAt: null },
        select: { id: true },
      });
      if (!existing) return false;

      await tx.conversation.update({
        where: { id: input.conversationId },
        data: { deletedAt: now, status: "ARCHIVED" },
      });
      await tx.auditLog.create({ data: buildAuditData(input.audit) });
      return true;
    });
  }

  async restoreConversation(input: {
    conversationId: string;
    audit: AdminAuditWrite;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.conversation.findFirst({
        where: {
          id: input.conversationId,
          deletedAt: { not: null },
        },
        select: { id: true },
      });
      if (!existing) return false;

      await tx.conversation.update({
        where: { id: input.conversationId },
        data: { deletedAt: null, status: "ACTIVE" },
      });
      await tx.auditLog.create({ data: buildAuditData(input.audit) });
      return true;
    });
  }

  async archiveConversation(input: {
    conversationId: string;
    audit: AdminAuditWrite;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.conversation.findFirst({
        where: { id: input.conversationId, deletedAt: null },
        select: { id: true },
      });
      if (!existing) return false;

      await tx.conversation.update({
        where: { id: input.conversationId },
        data: { status: "ARCHIVED" },
      });
      await tx.auditLog.create({ data: buildAuditData(input.audit) });
      return true;
    });
  }

  async listConversationMembers(
    conversationId: string
  ): Promise<AdminMemberRecord[]> {
    const rows = await this.prisma.conversationMember.findMany({
      where: { conversationId },
      select: {
        userId: true,
        role: true,
        muted: true,
        joinedAt: true,
        leftAt: true,
        deletedAt: true,
        user: {
          select: {
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    });

    return rows.map((r) => ({
      userId: r.userId,
      name: r.user.name,
      email: r.user.email,
      avatarUrl: r.user.avatarUrl,
      role: r.role,
      muted: r.muted,
      joinedAt: r.joinedAt,
      leftAt: r.leftAt,
      deletedAt: r.deletedAt,
    }));
  }

  async listGroups(
    filters: AdminListGroupsFilters
  ): Promise<AdminGroupRecord[]> {
    const where: Prisma.ConversationWhereInput = {
      type: "GROUP",
      ...(filters.includeDeleted ? {} : { deletedAt: null }),
      ...(filters.q
        ? { name: { contains: filters.q, mode: "insensitive" } }
        : {}),
      ...(filters.cursor
        ? {
            OR: [
              { createdAt: { lt: filters.cursor.createdAt } },
              {
                createdAt: filters.cursor.createdAt,
                id: { lt: filters.cursor.id },
              },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.conversation.findMany({
      where,
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        description: true,
        status: true,
        createdAt: true,
        deletedAt: true,
        members: {
          where: { role: "OWNER", deletedAt: null, leftAt: null },
          select: { userId: true },
          take: 1,
        },
        _count: {
          select: {
            members: { where: { deletedAt: null, leftAt: null } },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: filters.limit + 1,
    });

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      avatarUrl: r.avatarUrl,
      description: r.description,
      status: r.status,
      memberCount: r._count.members,
      ownerId: r.members[0]?.userId ?? null,
      createdAt: r.createdAt,
      deletedAt: r.deletedAt,
    }));
  }

  async findGroupById(groupId: string): Promise<AdminGroupRecord | null> {
    const r = await this.prisma.conversation.findFirst({
      where: { id: groupId, type: "GROUP" },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        description: true,
        status: true,
        createdAt: true,
        deletedAt: true,
        members: {
          where: { role: "OWNER", deletedAt: null, leftAt: null },
          select: { userId: true },
          take: 1,
        },
        _count: {
          select: {
            members: { where: { deletedAt: null, leftAt: null } },
          },
        },
      },
    });
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      avatarUrl: r.avatarUrl,
      description: r.description,
      status: r.status,
      memberCount: r._count.members,
      ownerId: r.members[0]?.userId ?? null,
      createdAt: r.createdAt,
      deletedAt: r.deletedAt,
    };
  }

  async softDeleteGroup(input: {
    groupId: string;
    audit: AdminAuditWrite;
  }): Promise<boolean> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.conversation.findFirst({
        where: { id: input.groupId, type: "GROUP", deletedAt: null },
        select: { id: true },
      });
      if (!existing) return false;

      await tx.conversation.update({
        where: { id: input.groupId },
        data: { deletedAt: now, status: "ARCHIVED" },
      });
      await tx.conversationMember.updateMany({
        where: {
          conversationId: input.groupId,
          deletedAt: null,
        },
        data: { deletedAt: now, leftAt: now },
      });
      await tx.auditLog.create({ data: buildAuditData(input.audit) });
      return true;
    });
  }

  async restoreGroup(input: {
    groupId: string;
    audit: AdminAuditWrite;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.conversation.findFirst({
        where: {
          id: input.groupId,
          type: "GROUP",
          deletedAt: { not: null },
        },
        select: { id: true },
      });
      if (!existing) return false;

      await tx.conversation.update({
        where: { id: input.groupId },
        data: { deletedAt: null, status: "ACTIVE" },
      });
      await tx.conversationMember.updateMany({
        where: {
          conversationId: input.groupId,
          deletedAt: { not: null },
        },
        data: { deletedAt: null, leftAt: null },
      });
      await tx.auditLog.create({ data: buildAuditData(input.audit) });
      return true;
    });
  }

  async transferGroupOwnership(input: {
    groupId: string;
    newOwnerId: string;
    audit: AdminAuditWrite;
  }): Promise<AdminGroupRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.conversation.findFirst({
        where: { id: input.groupId, type: "GROUP", deletedAt: null },
        select: { id: true },
      });
      if (!group) return null;

      const newOwner = await tx.conversationMember.findFirst({
        where: {
          conversationId: input.groupId,
          userId: input.newOwnerId,
          deletedAt: null,
          leftAt: null,
        },
        select: { id: true, role: true },
      });
      if (!newOwner) return null;

      const currentOwners = await tx.conversationMember.findMany({
        where: {
          conversationId: input.groupId,
          role: "OWNER",
          deletedAt: null,
          leftAt: null,
        },
        select: { id: true, userId: true },
      });

      for (const owner of currentOwners) {
        if (owner.userId === input.newOwnerId) continue;
        await tx.conversationMember.update({
          where: { id: owner.id },
          data: { role: "ADMIN" },
        });
      }

      await tx.conversationMember.update({
        where: { id: newOwner.id },
        data: { role: "OWNER" },
      });

      await tx.auditLog.create({
        data: buildAuditData({
          ...input.audit,
          metadata: {
            ...(input.audit.metadata ?? {}),
            previousOwnerIds: currentOwners.map((o) => o.userId),
            newOwnerId: input.newOwnerId,
          },
        }),
      });

      const memberCount = await countActiveMembers(tx, input.groupId);
      const row = await tx.conversation.findUniqueOrThrow({
        where: { id: input.groupId },
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          description: true,
          status: true,
          createdAt: true,
          deletedAt: true,
        },
      });

      return {
        ...row,
        memberCount,
        ownerId: input.newOwnerId,
      };
    });
  }

  async removeGroupMember(input: {
    groupId: string;
    targetUserId: string;
    audit: AdminAuditWrite;
  }): Promise<boolean> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const membership = await tx.conversationMember.findFirst({
        where: {
          conversationId: input.groupId,
          userId: input.targetUserId,
          deletedAt: null,
          leftAt: null,
        },
        select: { id: true, role: true },
      });
      if (!membership) return false;
      if (membership.role === "OWNER") return false;

      await tx.conversationMember.update({
        where: { id: membership.id },
        data: { deletedAt: now, leftAt: now },
      });
      await tx.auditLog.create({ data: buildAuditData(input.audit) });
      return true;
    });
  }

  async changeGroupMemberRole(input: {
    groupId: string;
    targetUserId: string;
    role: "ADMIN" | "MEMBER";
    audit: AdminAuditWrite;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const membership = await tx.conversationMember.findFirst({
        where: {
          conversationId: input.groupId,
          userId: input.targetUserId,
          deletedAt: null,
          leftAt: null,
        },
        select: { id: true, role: true },
      });
      if (!membership) return false;
      if (membership.role === "OWNER") return false;

      await tx.conversationMember.update({
        where: { id: membership.id },
        data: { role: input.role },
      });
      await tx.auditLog.create({
        data: buildAuditData({
          ...input.audit,
          metadata: {
            ...(input.audit.metadata ?? {}),
            previousRole: membership.role,
            newRole: input.role,
          },
        }),
      });
      return true;
    });
  }

  async listMessages(
    filters: AdminListMessagesFilters
  ): Promise<AdminMessageRecord[]> {
    const where: Prisma.MessageWhereInput = {
      ...(filters.includeDeleted ? {} : { deletedAt: null }),
      ...(filters.conversationId
        ? { conversationId: filters.conversationId }
        : {}),
      ...(filters.senderId ? { senderId: filters.senderId } : {}),
      ...(filters.q
        ? { content: { contains: filters.q, mode: "insensitive" } }
        : {}),
      ...(filters.cursor
        ? {
            OR: [
              { createdAt: { lt: filters.cursor.createdAt } },
              {
                createdAt: filters.cursor.createdAt,
                id: { lt: filters.cursor.id },
              },
            ],
          }
        : {}),
    };

    return this.prisma.message.findMany({
      where,
      select: {
        id: true,
        conversationId: true,
        senderId: true,
        type: true,
        content: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: filters.limit + 1,
    });
  }

  async findMessageById(messageId: string): Promise<AdminMessageRecord | null> {
    return this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        conversationId: true,
        senderId: true,
        type: true,
        content: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });
  }

  async softDeleteMessage(input: {
    messageId: string;
    audit: AdminAuditWrite;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.message.findFirst({
        where: { id: input.messageId, deletedAt: null },
        select: { id: true },
      });
      if (!existing) return false;

      await tx.message.update({
        where: { id: input.messageId },
        data: { deletedAt: new Date() },
      });
      await tx.auditLog.create({ data: buildAuditData(input.audit) });
      return true;
    });
  }

  async restoreMessage(input: {
    messageId: string;
    audit: AdminAuditWrite;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.message.findFirst({
        where: { id: input.messageId, deletedAt: { not: null } },
        select: { id: true },
      });
      if (!existing) return false;

      await tx.message.update({
        where: { id: input.messageId },
        data: { deletedAt: null },
      });
      await tx.auditLog.create({ data: buildAuditData(input.audit) });
      return true;
    });
  }

  async listAuditForEntity(input: {
    entityType: string;
    entityId: string;
    limit: number;
  }): Promise<AdminAuditRecord[]> {
    return this.prisma.auditLog.findMany({
      where: {
        entityType: input.entityType,
        entityId: input.entityId,
      },
      select: {
        id: true,
        actorId: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit,
    });
  }

  async listAuditLogs(
    filters: AdminListAuditFilters
  ): Promise<AdminAuditRecord[]> {
    const where: Prisma.AuditLogWhereInput = {
      ...(filters.actorId ? { actorId: filters.actorId } : {}),
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(filters.entityId ? { entityId: filters.entityId } : {}),
      ...(filters.action
        ? { action: filters.action as AuditAction }
        : {}),
      ...(filters.cursor
        ? {
            OR: [
              { createdAt: { lt: filters.cursor.createdAt } },
              {
                createdAt: filters.cursor.createdAt,
                id: { lt: filters.cursor.id },
              },
            ],
          }
        : {}),
    };

    return this.prisma.auditLog.findMany({
      where,
      select: {
        id: true,
        actorId: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: filters.limit + 1,
    });
  }

  async createReport(input: {
    reporterId: string;
    targetType: "USER" | "MESSAGE" | "CONVERSATION" | "GROUP";
    targetId: string;
    reason: string;
    details?: string;
    audit: AdminAuditWrite;
  }): Promise<AdminReportRecord> {
    return this.prisma.$transaction(async (tx) => {
      const report = await tx.report.create({
        data: {
          reporterId: input.reporterId,
          targetType: input.targetType,
          targetId: input.targetId,
          reason: input.reason,
          details: input.details,
          status: "OPEN",
        },
      });
      await tx.auditLog.create({
        data: buildAuditData({
          ...input.audit,
          entityId: report.id,
          metadata: {
            ...(input.audit.metadata ?? {}),
            targetType: input.targetType,
            targetId: input.targetId,
          },
        }),
      });
      return report;
    });
  }

  async findReportById(reportId: string): Promise<AdminReportRecord | null> {
    return this.prisma.report.findFirst({
      where: { id: reportId, deletedAt: null },
    });
  }

  async listReports(
    filters: AdminListReportsFilters
  ): Promise<AdminReportRecord[]> {
    const where: Prisma.ReportWhereInput = {
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.cursor
        ? {
            OR: [
              { createdAt: { lt: filters.cursor.createdAt } },
              {
                createdAt: filters.cursor.createdAt,
                id: { lt: filters.cursor.id },
              },
            ],
          }
        : {}),
    };

    return this.prisma.report.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: filters.limit + 1,
    });
  }

  async updateReportStatus(input: {
    reportId: string;
    status: ReportStatus;
    reviewerId: string;
    resolution?: string | null;
    audit: AdminAuditWrite;
  }): Promise<AdminReportRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.report.findFirst({
        where: { id: input.reportId, deletedAt: null },
      });
      if (!existing) return null;

      const updated = await tx.report.update({
        where: { id: input.reportId },
        data: {
          status: input.status,
          reviewerId: input.reviewerId,
          ...(input.resolution !== undefined
            ? { resolution: input.resolution }
            : {}),
        },
      });
      await tx.auditLog.create({ data: buildAuditData(input.audit) });
      return updated;
    });
  }
}
