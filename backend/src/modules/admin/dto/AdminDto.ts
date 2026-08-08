/**
 * Admin & Moderation API DTOs.
 */

export type AdminGlobalRole = "USER" | "ADMIN" | "SUPER_ADMIN";

export type AdminActor = {
  id: string;
  globalRole: "ADMIN" | "SUPER_ADMIN";
};

export type AdminClientContext = {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export type AdminUserDto = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  phone: string | null;
  about: string | null;
  globalRole: AdminGlobalRole;
  suspendedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type AdminUsersPageDto = {
  results: AdminUserDto[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type AdminConversationDto = {
  id: string;
  type: "direct" | "group";
  status: string;
  name: string | null;
  avatarUrl: string | null;
  description: string | null;
  memberCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  deletedAt: string | null;
};

export type AdminConversationsPageDto = {
  results: AdminConversationDto[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type AdminMemberDto = {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: "OWNER" | "ADMIN" | "MEMBER";
  muted: boolean;
  joinedAt: string;
  leftAt: string | null;
  deletedAt: string | null;
};

export type AdminGroupDto = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  description: string | null;
  status: string;
  memberCount: number;
  ownerId: string | null;
  createdAt: string;
  deletedAt: string | null;
};

export type AdminGroupsPageDto = {
  results: AdminGroupDto[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type AdminMessageDto = {
  id: string;
  conversationId: string;
  senderId: string;
  type: string;
  content: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type AdminMessagesPageDto = {
  results: AdminMessageDto[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type AdminAuditLogDto = {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type AdminAuditPageDto = {
  results: AdminAuditLogDto[];
  nextCursor: string | null;
  hasMore: boolean;
};

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

export type AdminReportDto = {
  id: string;
  reporterId: string;
  targetType: AdminReportTargetType;
  targetId: string;
  reason: string;
  details: string | null;
  status: AdminReportStatus;
  reviewerId: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminReportsPageDto = {
  results: AdminReportDto[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type AdminMutationResultDto = {
  ok: true;
  id: string;
};

export type AdminForceLogoutResultDto = {
  ok: true;
  userId: string;
  sessionsRevoked: number;
  refreshTokensRevoked: number;
};
