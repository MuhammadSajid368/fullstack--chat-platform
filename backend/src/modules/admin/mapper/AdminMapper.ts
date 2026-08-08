import type {
  AdminAuditLogDto,
  AdminConversationDto,
  AdminGlobalRole,
  AdminGroupDto,
  AdminMemberDto,
  AdminMessageDto,
  AdminReportDto,
  AdminUserDto,
} from "@modules/admin/dto/AdminDto.js";

type UserRow = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  phone: string | null;
  about: string | null;
  globalRole: AdminGlobalRole | string;
  suspendedAt: Date | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

type ConversationRow = {
  id: string;
  type: "DIRECT" | "GROUP" | string;
  status: string;
  name: string | null;
  avatarUrl: string | null;
  description: string | null;
  memberCount: number;
  lastMessageAt: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
};

type GroupRow = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  description: string | null;
  status: string;
  memberCount: number;
  ownerId: string | null;
  createdAt: Date;
  deletedAt: Date | null;
};

type MemberRow = {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: "OWNER" | "ADMIN" | "MEMBER" | string;
  muted: boolean;
  joinedAt: Date;
  leftAt: Date | null;
  deletedAt: Date | null;
};

type MessageRow = {
  id: string;
  conversationId: string;
  senderId: string;
  type: string;
  content: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

type AuditRow = {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
};

type ReportRow = {
  id: string;
  reporterId: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string | null;
  status: string;
  reviewerId: string | null;
  resolution: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * AdminMapper — pure mapping, no IO.
 */
export class AdminMapper {
  static toUserDto(row: UserRow): AdminUserDto {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      avatarUrl: row.avatarUrl,
      phone: row.phone,
      about: row.about,
      globalRole: row.globalRole as AdminGlobalRole,
      suspendedAt: row.suspendedAt?.toISOString() ?? null,
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      deletedAt: row.deletedAt?.toISOString() ?? null,
    };
  }

  static toConversationDto(row: ConversationRow): AdminConversationDto {
    return {
      id: row.id,
      type: row.type === "GROUP" || row.type === "group" ? "group" : "direct",
      status: String(row.status).toLowerCase(),
      name: row.name,
      avatarUrl: row.avatarUrl,
      description: row.description,
      memberCount: row.memberCount,
      lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      deletedAt: row.deletedAt?.toISOString() ?? null,
    };
  }

  static toGroupDto(row: GroupRow): AdminGroupDto {
    return {
      id: row.id,
      name: row.name,
      avatarUrl: row.avatarUrl,
      description: row.description,
      status: String(row.status).toLowerCase(),
      memberCount: row.memberCount,
      ownerId: row.ownerId,
      createdAt: row.createdAt.toISOString(),
      deletedAt: row.deletedAt?.toISOString() ?? null,
    };
  }

  static toMemberDto(row: MemberRow): AdminMemberDto {
    return {
      userId: row.userId,
      name: row.name,
      email: row.email,
      avatarUrl: row.avatarUrl,
      role: row.role as AdminMemberDto["role"],
      muted: row.muted,
      joinedAt: row.joinedAt.toISOString(),
      leftAt: row.leftAt?.toISOString() ?? null,
      deletedAt: row.deletedAt?.toISOString() ?? null,
    };
  }

  static toMessageDto(row: MessageRow): AdminMessageDto {
    return {
      id: row.id,
      conversationId: row.conversationId,
      senderId: row.senderId,
      type: String(row.type).toLowerCase(),
      content: row.content,
      status: String(row.status).toLowerCase(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      deletedAt: row.deletedAt?.toISOString() ?? null,
    };
  }

  static toAuditDto(row: AuditRow): AdminAuditLogDto {
    const metadata =
      row.metadata &&
      typeof row.metadata === "object" &&
      !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null;
    return {
      id: row.id,
      actorId: row.actorId,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      metadata,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      createdAt: row.createdAt.toISOString(),
    };
  }

  static toReportDto(row: ReportRow): AdminReportDto {
    return {
      id: row.id,
      reporterId: row.reporterId,
      targetType: row.targetType as AdminReportDto["targetType"],
      targetId: row.targetId,
      reason: row.reason,
      details: row.details,
      status: row.status as AdminReportDto["status"],
      reviewerId: row.reviewerId,
      resolution: row.resolution,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
