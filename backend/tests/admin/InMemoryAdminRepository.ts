import type { AuditAction, GlobalRole, MemberRole, ReportStatus } from "@prisma/client";
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
} from "../../src/modules/admin/interfaces/IAdminRepository.js";

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function applyCursor<T extends { createdAt: Date; id: string }>(
  rows: T[],
  cursor?: { createdAt: Date; id: string }
): T[] {
  if (!cursor) return rows;
  return rows.filter(
    (r) =>
      r.createdAt.getTime() < cursor.createdAt.getTime() ||
      (r.createdAt.getTime() === cursor.createdAt.getTime() && r.id < cursor.id)
  );
}

/**
 * In-memory AdminRepository for unit/HTTP tests.
 */
export class InMemoryAdminRepository implements IAdminRepository {
  users: AdminUserRecord[] = [];
  conversations: Array<
    AdminConversationRecord & {
      members: Array<{
        userId: string;
        role: MemberRole;
        muted: boolean;
        joinedAt: Date;
        leftAt: Date | null;
        deletedAt: Date | null;
      }>;
    }
  > = [];
  messages: AdminMessageRecord[] = [];
  audits: AdminAuditRecord[] = [];
  reports: AdminReportRecord[] = [];
  sessions = new Map<string, { revokedAt: Date | null }>();
  refreshTokens = new Map<string, { userId: string; revokedAt: Date | null }>();

  seedUser(
    partial: Partial<AdminUserRecord> & Pick<AdminUserRecord, "id" | "email" | "name">
  ): AdminUserRecord {
    const user: AdminUserRecord = {
      avatarUrl: null,
      phone: null,
      about: null,
      globalRole: "USER",
      suspendedAt: null,
      lastSeenAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...partial,
    };
    this.users.push(user);
    return user;
  }

  seedSession(userId: string, sessionId = id("sess")): string {
    this.sessions.set(sessionId, { revokedAt: null });
    this.refreshTokens.set(id("rt"), { userId, revokedAt: null });
    (this.sessions.get(sessionId) as { userId?: string }).userId = userId;
    return sessionId;
  }

  private writeAudit(audit: AdminAuditWrite): void {
    this.audits.push({
      id: id("aud"),
      actorId: audit.actorId,
      action: audit.action,
      entityType: audit.entityType,
      entityId: audit.entityId,
      metadata: {
        ...(audit.metadata ?? {}),
        ...(audit.reason ? { reason: audit.reason } : {}),
        ...(audit.context.requestId
          ? { requestId: audit.context.requestId }
          : {}),
      },
      ipAddress: audit.context.ipAddress ?? null,
      userAgent: audit.context.userAgent ?? null,
      createdAt: new Date(),
    });
  }

  async getGlobalRole(userId: string): Promise<GlobalRole | null> {
    const user = this.users.find((u) => u.id === userId && !u.deletedAt);
    return user?.globalRole ?? null;
  }

  async findUserById(userId: string): Promise<AdminUserRecord | null> {
    return this.users.find((u) => u.id === userId) ?? null;
  }

  async listUsers(filters: AdminListUsersFilters): Promise<AdminUserRecord[]> {
    let rows = [...this.users];
    if (!filters.includeDeleted) {
      rows = rows.filter((u) => !u.deletedAt);
    }
    if (filters.q) {
      const q = filters.q.toLowerCase();
      rows = rows.filter(
        (u) =>
          u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );
    }
    rows.sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() ||
        b.id.localeCompare(a.id)
    );
    rows = applyCursor(rows, filters.cursor);
    return rows.slice(0, filters.limit + 1);
  }

  async suspendUser(input: {
    userId: string;
    audit: AdminAuditWrite;
  }): Promise<AdminUserRecord | null> {
    const user = this.users.find(
      (u) => u.id === input.userId && !u.deletedAt && !u.suspendedAt
    );
    if (!user) return null;
    user.suspendedAt = new Date();
    user.updatedAt = new Date();
    this.writeAudit(input.audit);
    return { ...user };
  }

  async unsuspendUser(input: {
    userId: string;
    audit: AdminAuditWrite;
  }): Promise<AdminUserRecord | null> {
    const user = this.users.find(
      (u) => u.id === input.userId && !u.deletedAt && u.suspendedAt
    );
    if (!user) return null;
    user.suspendedAt = null;
    user.updatedAt = new Date();
    this.writeAudit(input.audit);
    return { ...user };
  }

  async softDeleteUser(input: {
    userId: string;
    audit: AdminAuditWrite;
  }): Promise<AdminUserRecord | null> {
    const user = this.users.find((u) => u.id === input.userId && !u.deletedAt);
    if (!user) return null;
    const now = new Date();
    user.deletedAt = now;
    user.suspendedAt = now;
    user.updatedAt = now;
    for (const [sid, s] of this.sessions) {
      if ((s as { userId?: string }).userId === input.userId && !s.revokedAt) {
        s.revokedAt = now;
      }
      void sid;
    }
    for (const tok of this.refreshTokens.values()) {
      if (tok.userId === input.userId && !tok.revokedAt) tok.revokedAt = now;
    }
    this.writeAudit(input.audit);
    return { ...user };
  }

  async restoreUser(input: {
    userId: string;
    audit: AdminAuditWrite;
  }): Promise<AdminUserRecord | null> {
    const user = this.users.find((u) => u.id === input.userId && u.deletedAt);
    if (!user) return null;
    user.deletedAt = null;
    user.suspendedAt = null;
    user.updatedAt = new Date();
    this.writeAudit(input.audit);
    return { ...user };
  }

  async forceLogoutAll(input: {
    userId: string;
    audit: AdminAuditWrite;
  }): Promise<{ sessionsRevoked: number; refreshTokensRevoked: number }> {
    const now = new Date();
    let sessionsRevoked = 0;
    let refreshTokensRevoked = 0;
    for (const s of this.sessions.values()) {
      if ((s as { userId?: string }).userId === input.userId && !s.revokedAt) {
        s.revokedAt = now;
        sessionsRevoked += 1;
      }
    }
    for (const tok of this.refreshTokens.values()) {
      if (tok.userId === input.userId && !tok.revokedAt) {
        tok.revokedAt = now;
        refreshTokensRevoked += 1;
      }
    }
    this.writeAudit(input.audit);
    return { sessionsRevoked, refreshTokensRevoked };
  }

  async listConversations(
    filters: AdminListConversationsFilters
  ): Promise<AdminConversationRecord[]> {
    let rows = this.conversations.map((c) => ({
      id: c.id,
      type: c.type,
      status: c.status,
      name: c.name,
      avatarUrl: c.avatarUrl,
      description: c.description,
      memberCount: c.members.filter((m) => !m.deletedAt && !m.leftAt).length,
      lastMessageAt: c.lastMessageAt,
      createdAt: c.createdAt,
      deletedAt: c.deletedAt,
    }));
    if (!filters.includeDeleted) rows = rows.filter((c) => !c.deletedAt);
    if (filters.type) rows = rows.filter((c) => c.type === filters.type);
    if (filters.q) {
      const q = filters.q.toLowerCase();
      rows = rows.filter((c) => (c.name ?? "").toLowerCase().includes(q));
    }
    rows.sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() ||
        b.id.localeCompare(a.id)
    );
    rows = applyCursor(rows, filters.cursor);
    return rows.slice(0, filters.limit + 1);
  }

  async findConversationById(
    conversationId: string
  ): Promise<AdminConversationRecord | null> {
    const c = this.conversations.find((x) => x.id === conversationId);
    if (!c) return null;
    return {
      id: c.id,
      type: c.type,
      status: c.status,
      name: c.name,
      avatarUrl: c.avatarUrl,
      description: c.description,
      memberCount: c.members.filter((m) => !m.deletedAt && !m.leftAt).length,
      lastMessageAt: c.lastMessageAt,
      createdAt: c.createdAt,
      deletedAt: c.deletedAt,
    };
  }

  async softDeleteConversation(input: {
    conversationId: string;
    audit: AdminAuditWrite;
  }): Promise<boolean> {
    const c = this.conversations.find(
      (x) => x.id === input.conversationId && !x.deletedAt
    );
    if (!c) return false;
    c.deletedAt = new Date();
    c.status = "ARCHIVED";
    this.writeAudit(input.audit);
    return true;
  }

  async restoreConversation(input: {
    conversationId: string;
    audit: AdminAuditWrite;
  }): Promise<boolean> {
    const c = this.conversations.find(
      (x) => x.id === input.conversationId && x.deletedAt
    );
    if (!c) return false;
    c.deletedAt = null;
    c.status = "ACTIVE";
    this.writeAudit(input.audit);
    return true;
  }

  async archiveConversation(input: {
    conversationId: string;
    audit: AdminAuditWrite;
  }): Promise<boolean> {
    const c = this.conversations.find(
      (x) => x.id === input.conversationId && !x.deletedAt
    );
    if (!c) return false;
    c.status = "ARCHIVED";
    this.writeAudit(input.audit);
    return true;
  }

  async listConversationMembers(
    conversationId: string
  ): Promise<AdminMemberRecord[]> {
    const c = this.conversations.find((x) => x.id === conversationId);
    if (!c) return [];
    return c.members.map((m) => {
      const user = this.users.find((u) => u.id === m.userId)!;
      return {
        userId: m.userId,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        role: m.role,
        muted: m.muted,
        joinedAt: m.joinedAt,
        leftAt: m.leftAt,
        deletedAt: m.deletedAt,
      };
    });
  }

  async listGroups(
    filters: AdminListGroupsFilters
  ): Promise<AdminGroupRecord[]> {
    let rows = this.conversations
      .filter((c) => c.type === "GROUP")
      .map((c) => ({
        id: c.id,
        name: c.name,
        avatarUrl: c.avatarUrl,
        description: c.description,
        status: c.status,
        memberCount: c.members.filter((m) => !m.deletedAt && !m.leftAt).length,
        ownerId:
          c.members.find((m) => m.role === "OWNER" && !m.deletedAt && !m.leftAt)
            ?.userId ?? null,
        createdAt: c.createdAt,
        deletedAt: c.deletedAt,
      }));
    if (!filters.includeDeleted) rows = rows.filter((c) => !c.deletedAt);
    if (filters.q) {
      const q = filters.q.toLowerCase();
      rows = rows.filter((c) => (c.name ?? "").toLowerCase().includes(q));
    }
    rows.sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() ||
        b.id.localeCompare(a.id)
    );
    rows = applyCursor(rows, filters.cursor);
    return rows.slice(0, filters.limit + 1);
  }

  async findGroupById(groupId: string): Promise<AdminGroupRecord | null> {
    const rows = await this.listGroups({
      includeDeleted: true,
      limit: 1000,
    });
    return rows.find((g) => g.id === groupId) ?? null;
  }

  async softDeleteGroup(input: {
    groupId: string;
    audit: AdminAuditWrite;
  }): Promise<boolean> {
    const c = this.conversations.find(
      (x) => x.id === input.groupId && x.type === "GROUP" && !x.deletedAt
    );
    if (!c) return false;
    const now = new Date();
    c.deletedAt = now;
    c.status = "ARCHIVED";
    for (const m of c.members) {
      if (!m.deletedAt) {
        m.deletedAt = now;
        m.leftAt = now;
      }
    }
    this.writeAudit(input.audit);
    return true;
  }

  async restoreGroup(input: {
    groupId: string;
    audit: AdminAuditWrite;
  }): Promise<boolean> {
    const c = this.conversations.find(
      (x) => x.id === input.groupId && x.type === "GROUP" && x.deletedAt
    );
    if (!c) return false;
    c.deletedAt = null;
    c.status = "ACTIVE";
    for (const m of c.members) {
      m.deletedAt = null;
      m.leftAt = null;
    }
    this.writeAudit(input.audit);
    return true;
  }

  async transferGroupOwnership(input: {
    groupId: string;
    newOwnerId: string;
    audit: AdminAuditWrite;
  }): Promise<AdminGroupRecord | null> {
    const c = this.conversations.find(
      (x) => x.id === input.groupId && x.type === "GROUP" && !x.deletedAt
    );
    if (!c) return null;
    const target = c.members.find(
      (m) =>
        m.userId === input.newOwnerId && !m.deletedAt && !m.leftAt
    );
    if (!target) return null;
    for (const m of c.members) {
      if (m.role === "OWNER" && m.userId !== input.newOwnerId) {
        m.role = "ADMIN";
      }
    }
    target.role = "OWNER";
    this.writeAudit(input.audit);
    return this.findGroupById(input.groupId);
  }

  async removeGroupMember(input: {
    groupId: string;
    targetUserId: string;
    audit: AdminAuditWrite;
  }): Promise<boolean> {
    const c = this.conversations.find((x) => x.id === input.groupId);
    if (!c) return false;
    const m = c.members.find(
      (x) =>
        x.userId === input.targetUserId && !x.deletedAt && !x.leftAt
    );
    if (!m || m.role === "OWNER") return false;
    const now = new Date();
    m.deletedAt = now;
    m.leftAt = now;
    this.writeAudit(input.audit);
    return true;
  }

  async changeGroupMemberRole(input: {
    groupId: string;
    targetUserId: string;
    role: "ADMIN" | "MEMBER";
    audit: AdminAuditWrite;
  }): Promise<boolean> {
    const c = this.conversations.find((x) => x.id === input.groupId);
    if (!c) return false;
    const m = c.members.find(
      (x) =>
        x.userId === input.targetUserId && !x.deletedAt && !x.leftAt
    );
    if (!m || m.role === "OWNER") return false;
    m.role = input.role;
    this.writeAudit(input.audit);
    return true;
  }

  async listMessages(
    filters: AdminListMessagesFilters
  ): Promise<AdminMessageRecord[]> {
    let rows = [...this.messages];
    if (!filters.includeDeleted) rows = rows.filter((m) => !m.deletedAt);
    if (filters.conversationId) {
      rows = rows.filter((m) => m.conversationId === filters.conversationId);
    }
    if (filters.senderId) {
      rows = rows.filter((m) => m.senderId === filters.senderId);
    }
    if (filters.q) {
      const q = filters.q.toLowerCase();
      rows = rows.filter((m) => m.content.toLowerCase().includes(q));
    }
    rows.sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() ||
        b.id.localeCompare(a.id)
    );
    rows = applyCursor(rows, filters.cursor);
    return rows.slice(0, filters.limit + 1);
  }

  async findMessageById(messageId: string): Promise<AdminMessageRecord | null> {
    return this.messages.find((m) => m.id === messageId) ?? null;
  }

  async softDeleteMessage(input: {
    messageId: string;
    audit: AdminAuditWrite;
  }): Promise<boolean> {
    const m = this.messages.find((x) => x.id === input.messageId && !x.deletedAt);
    if (!m) return false;
    m.deletedAt = new Date();
    this.writeAudit(input.audit);
    return true;
  }

  async restoreMessage(input: {
    messageId: string;
    audit: AdminAuditWrite;
  }): Promise<boolean> {
    const m = this.messages.find((x) => x.id === input.messageId && x.deletedAt);
    if (!m) return false;
    m.deletedAt = null;
    this.writeAudit(input.audit);
    return true;
  }

  async listAuditForEntity(input: {
    entityType: string;
    entityId: string;
    limit: number;
  }): Promise<AdminAuditRecord[]> {
    return this.audits
      .filter(
        (a) => a.entityType === input.entityType && a.entityId === input.entityId
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, input.limit);
  }

  async listAuditLogs(
    filters: AdminListAuditFilters
  ): Promise<AdminAuditRecord[]> {
    let rows = [...this.audits];
    if (filters.actorId) rows = rows.filter((a) => a.actorId === filters.actorId);
    if (filters.entityType) {
      rows = rows.filter((a) => a.entityType === filters.entityType);
    }
    if (filters.entityId) {
      rows = rows.filter((a) => a.entityId === filters.entityId);
    }
    if (filters.action) {
      rows = rows.filter((a) => a.action === filters.action);
    }
    rows.sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() ||
        b.id.localeCompare(a.id)
    );
    rows = applyCursor(rows, filters.cursor);
    return rows.slice(0, filters.limit + 1);
  }

  async createReport(input: {
    reporterId: string;
    targetType: "USER" | "MESSAGE" | "CONVERSATION" | "GROUP";
    targetId: string;
    reason: string;
    details?: string;
    audit: AdminAuditWrite;
  }): Promise<AdminReportRecord> {
    const report: AdminReportRecord = {
      id: id("rep"),
      reporterId: input.reporterId,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      details: input.details ?? null,
      status: "OPEN",
      reviewerId: null,
      resolution: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.reports.push(report);
    this.writeAudit({ ...input.audit, entityId: report.id });
    return report;
  }

  async findReportById(reportId: string): Promise<AdminReportRecord | null> {
    return this.reports.find((r) => r.id === reportId) ?? null;
  }

  async listReports(
    filters: AdminListReportsFilters
  ): Promise<AdminReportRecord[]> {
    let rows = [...this.reports];
    if (filters.status) rows = rows.filter((r) => r.status === filters.status);
    rows.sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() ||
        b.id.localeCompare(a.id)
    );
    rows = applyCursor(rows, filters.cursor);
    return rows.slice(0, filters.limit + 1);
  }

  async updateReportStatus(input: {
    reportId: string;
    status: ReportStatus;
    reviewerId: string;
    resolution?: string | null;
    audit: AdminAuditWrite;
  }): Promise<AdminReportRecord | null> {
    const report = this.reports.find((r) => r.id === input.reportId);
    if (!report) return null;
    report.status = input.status;
    report.reviewerId = input.reviewerId;
    if (input.resolution !== undefined) report.resolution = input.resolution;
    report.updatedAt = new Date();
    this.writeAudit(input.audit);
    return { ...report };
  }

  /** test helper */
  auditActions(): AuditAction[] {
    return this.audits.map((a) => a.action as AuditAction);
  }
}
