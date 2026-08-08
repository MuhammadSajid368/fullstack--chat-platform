import type { GlobalRole } from "../types/auth";

export type AdminReportStatus =
  | "OPEN"
  | "UNDER_REVIEW"
  | "RESOLVED"
  | "DISMISSED";

export type AdminReportTargetType =
  | "USER"
  | "MESSAGE"
  | "CONVERSATION"
  | "GROUP";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  avatar: string;
  phone?: string | null;
  about?: string | null;
  globalRole: GlobalRole;
  suspendedAt?: string | null;
  lastSeenAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface AdminConversation {
  id: string;
  type: "direct" | "group";
  status: string;
  name?: string | null;
  avatar: string;
  description?: string | null;
  memberCount: number;
  lastMessageAt?: string | null;
  createdAt: string;
  deletedAt?: string | null;
}

export interface AdminGroup {
  id: string;
  name?: string | null;
  avatar: string;
  description?: string | null;
  status: string;
  memberCount: number;
  ownerId?: string | null;
  createdAt: string;
  deletedAt?: string | null;
}

export interface AdminMessage {
  id: string;
  conversationId: string;
  senderId: string;
  type: string;
  content: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface AdminMember {
  userId: string;
  name: string;
  email: string;
  avatar: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  muted: boolean;
  joinedAt: string;
  leftAt?: string | null;
  deletedAt?: string | null;
}

export interface AdminAuditLog {
  id: string;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
}

export interface AdminReport {
  id: string;
  reporterId: string;
  targetType: AdminReportTargetType;
  targetId: string;
  reason: string;
  details?: string | null;
  status: AdminReportStatus;
  reviewerId?: string | null;
  resolution?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface AdminPage<T> {
  results: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface AdminListParams {
  cursor?: string;
  limit?: number;
}

export interface AdminCreateReportParams {
  targetType: AdminReportTargetType;
  targetId: string;
  reason: string;
  details?: string | null;
}

export interface AdminService {
  listUsers(params?: AdminListParams): Promise<AdminPage<AdminUser>>;
  getUser(userId: string): Promise<AdminUser>;
  suspendUser(userId: string, reason?: string | null): Promise<AdminUser>;
  unsuspendUser(userId: string, reason?: string | null): Promise<AdminUser>;
  deleteUser(userId: string, reason?: string | null): Promise<void>;
  restoreUser(userId: string, reason?: string | null): Promise<AdminUser>;
  logoutAll(userId: string, reason?: string | null): Promise<void>;
  listConversations(params?: AdminListParams): Promise<AdminPage<AdminConversation>>;
  listConversationMembers(conversationId: string): Promise<AdminMember[]>;
  deleteConversation(conversationId: string, reason?: string | null): Promise<void>;
  restoreConversation(
    conversationId: string,
    reason?: string | null
  ): Promise<AdminConversation>;
  archiveConversation(
    conversationId: string,
    reason?: string | null
  ): Promise<AdminConversation>;
  listGroups(params?: AdminListParams): Promise<AdminPage<AdminGroup>>;
  deleteGroup(groupId: string, reason?: string | null): Promise<void>;
  restoreGroup(groupId: string, reason?: string | null): Promise<AdminGroup>;
  transferGroupOwnership(
    groupId: string,
    newOwnerUserId: string,
    reason?: string | null
  ): Promise<AdminGroup>;
  removeGroupMember(
    groupId: string,
    userId: string,
    reason?: string | null
  ): Promise<void>;
  changeGroupMemberRole(
    groupId: string,
    userId: string,
    role: "ADMIN" | "MEMBER" | "OWNER",
    reason?: string | null
  ): Promise<void>;
  listMessages(params?: AdminListParams): Promise<AdminPage<AdminMessage>>;
  listMessageAudit(messageId: string): Promise<AdminAuditLog[]>;
  deleteMessage(messageId: string, reason?: string | null): Promise<void>;
  restoreMessage(messageId: string, reason?: string | null): Promise<AdminMessage>;
  listAudit(params?: AdminListParams): Promise<AdminPage<AdminAuditLog>>;
  listReports(params?: AdminListParams): Promise<AdminPage<AdminReport>>;
  createReport(params: AdminCreateReportParams): Promise<AdminReport>;
  reviewReport(reportId: string, reason?: string | null): Promise<AdminReport>;
  resolveReport(
    reportId: string,
    resolution: string,
    reason?: string | null
  ): Promise<AdminReport>;
  dismissReport(
    reportId: string,
    reason?: string | null
  ): Promise<AdminReport>;
}
