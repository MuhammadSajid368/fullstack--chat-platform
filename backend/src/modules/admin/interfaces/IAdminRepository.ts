import type { AuditAction, GlobalRole, MemberRole, ReportStatus } from "@prisma/client";
import type { AdminClientContext } from "@modules/admin/dto/AdminDto.js";

export type AdminUserRecord = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  phone: string | null;
  about: string | null;
  globalRole: GlobalRole;
  suspendedAt: Date | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type AdminConversationRecord = {
  id: string;
  type: "DIRECT" | "GROUP";
  status: string;
  name: string | null;
  avatarUrl: string | null;
  description: string | null;
  memberCount: number;
  lastMessageAt: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
};

export type AdminGroupRecord = {
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

export type AdminMemberRecord = {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: MemberRole;
  muted: boolean;
  joinedAt: Date;
  leftAt: Date | null;
  deletedAt: Date | null;
};

export type AdminMessageRecord = {
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

export type AdminAuditRecord = {
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

export type AdminReportRecord = {
  id: string;
  reporterId: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  reviewerId: string | null;
  resolution: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminAuditWrite = {
  actorId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  context: AdminClientContext;
};

export type AdminListUsersFilters = {
  q?: string;
  includeDeleted: boolean;
  cursor?: { createdAt: Date; id: string };
  limit: number;
};

export type AdminListConversationsFilters = {
  q?: string;
  type?: "DIRECT" | "GROUP";
  includeDeleted: boolean;
  cursor?: { createdAt: Date; id: string };
  limit: number;
};

export type AdminListGroupsFilters = {
  q?: string;
  includeDeleted: boolean;
  cursor?: { createdAt: Date; id: string };
  limit: number;
};

export type AdminListMessagesFilters = {
  q?: string;
  conversationId?: string;
  senderId?: string;
  includeDeleted: boolean;
  cursor?: { createdAt: Date; id: string };
  limit: number;
};

export type AdminListAuditFilters = {
  actorId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  cursor?: { createdAt: Date; id: string };
  limit: number;
};

export type AdminListReportsFilters = {
  status?: ReportStatus;
  cursor?: { createdAt: Date; id: string };
  limit: number;
};

/**
 * Admin repository — privileged Prisma access + audit writes.
 */
export interface IAdminRepository {
  getGlobalRole(userId: string): Promise<GlobalRole | null>;

  findUserById(userId: string): Promise<AdminUserRecord | null>;

  listUsers(filters: AdminListUsersFilters): Promise<AdminUserRecord[]>;

  suspendUser(input: {
    userId: string;
    audit: AdminAuditWrite;
  }): Promise<AdminUserRecord | null>;

  unsuspendUser(input: {
    userId: string;
    audit: AdminAuditWrite;
  }): Promise<AdminUserRecord | null>;

  softDeleteUser(input: {
    userId: string;
    audit: AdminAuditWrite;
  }): Promise<AdminUserRecord | null>;

  restoreUser(input: {
    userId: string;
    audit: AdminAuditWrite;
  }): Promise<AdminUserRecord | null>;

  forceLogoutAll(input: {
    userId: string;
    audit: AdminAuditWrite;
  }): Promise<{ sessionsRevoked: number; refreshTokensRevoked: number }>;

  listConversations(
    filters: AdminListConversationsFilters
  ): Promise<AdminConversationRecord[]>;

  findConversationById(
    conversationId: string
  ): Promise<AdminConversationRecord | null>;

  softDeleteConversation(input: {
    conversationId: string;
    audit: AdminAuditWrite;
  }): Promise<boolean>;

  restoreConversation(input: {
    conversationId: string;
    audit: AdminAuditWrite;
  }): Promise<boolean>;

  archiveConversation(input: {
    conversationId: string;
    audit: AdminAuditWrite;
  }): Promise<boolean>;

  listConversationMembers(
    conversationId: string
  ): Promise<AdminMemberRecord[]>;

  listGroups(filters: AdminListGroupsFilters): Promise<AdminGroupRecord[]>;

  findGroupById(groupId: string): Promise<AdminGroupRecord | null>;

  softDeleteGroup(input: {
    groupId: string;
    audit: AdminAuditWrite;
  }): Promise<boolean>;

  restoreGroup(input: {
    groupId: string;
    audit: AdminAuditWrite;
  }): Promise<boolean>;

  transferGroupOwnership(input: {
    groupId: string;
    newOwnerId: string;
    audit: AdminAuditWrite;
  }): Promise<AdminGroupRecord | null>;

  removeGroupMember(input: {
    groupId: string;
    targetUserId: string;
    audit: AdminAuditWrite;
  }): Promise<boolean>;

  changeGroupMemberRole(input: {
    groupId: string;
    targetUserId: string;
    role: "ADMIN" | "MEMBER";
    audit: AdminAuditWrite;
  }): Promise<boolean>;

  listMessages(filters: AdminListMessagesFilters): Promise<AdminMessageRecord[]>;

  findMessageById(messageId: string): Promise<AdminMessageRecord | null>;

  softDeleteMessage(input: {
    messageId: string;
    audit: AdminAuditWrite;
  }): Promise<boolean>;

  restoreMessage(input: {
    messageId: string;
    audit: AdminAuditWrite;
  }): Promise<boolean>;

  listAuditForEntity(input: {
    entityType: string;
    entityId: string;
    limit: number;
  }): Promise<AdminAuditRecord[]>;

  listAuditLogs(filters: AdminListAuditFilters): Promise<AdminAuditRecord[]>;

  createReport(input: {
    reporterId: string;
    targetType: "USER" | "MESSAGE" | "CONVERSATION" | "GROUP";
    targetId: string;
    reason: string;
    details?: string;
    audit: AdminAuditWrite;
  }): Promise<AdminReportRecord>;

  findReportById(reportId: string): Promise<AdminReportRecord | null>;

  listReports(filters: AdminListReportsFilters): Promise<AdminReportRecord[]>;

  updateReportStatus(input: {
    reportId: string;
    status: ReportStatus;
    reviewerId: string;
    resolution?: string | null;
    audit: AdminAuditWrite;
  }): Promise<AdminReportRecord | null>;
}
