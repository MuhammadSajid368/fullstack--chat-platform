/**
 * Group API DTOs — conversation-shaped responses (frontend ApiConversationDto).
 */

export type ApiGroupMemberRole = "owner" | "admin" | "member";

export type ApiGroupMemberDto = {
  userId: string;
  role: ApiGroupMemberRole;
};

export type GroupConversationDto = {
  id: string;
  type: "group";
  name: string;
  avatarUrl: string | null;
  memberIds: string[];
  pinned: boolean;
  muted: boolean;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  description: string | null;
  members: ApiGroupMemberDto[];
  createdBy: string | null;
  adminIds: string[];
  inviteCode: string | null;
};

export type CreateGroupInput = {
  name: string;
  description?: string | null;
  avatarUrl?: string | null;
  memberUserIds: string[];
};

export type UpdateGroupInput = {
  name?: string;
  description?: string | null;
  avatarUrl?: string | null;
};

export type AddMembersInput = {
  memberUserIds: string[];
};

export type ChangeMemberRoleInput = {
  role: "admin" | "member";
};

export type TransferOwnershipInput = {
  newOwnerUserId: string;
};

export type GroupClientContext = {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};
