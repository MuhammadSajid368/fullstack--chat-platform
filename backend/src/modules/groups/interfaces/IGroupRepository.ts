import type { AuditAction, MemberRole } from "@prisma/client";

export type GroupConversationRecord = {
  id: string;
  type: "GROUP";
  status: string;
  name: string | null;
  avatarUrl: string | null;
  description: string | null;
  inviteCode: string | null;
  createdById: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type GroupMemberRecord = {
  id: string;
  conversationId: string;
  userId: string;
  role: MemberRole;
  groupRoleId: string | null;
  muted: boolean;
  pinned: boolean;
  unreadCount: number;
  leftAt: Date | null;
  deletedAt: Date | null;
};

export type GroupRoleRecord = {
  id: string;
  conversationId: string;
  key: string;
  displayName: string;
  isSystem: boolean;
  deletedAt: Date | null;
};

export type ActiveUserRecord = {
  id: string;
  suspendedAt: Date | null;
};

export type CreateAuditLogInput = {
  actorId?: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};

export type CreateGroupTxInput = {
  name: string;
  description: string | null;
  avatarUrl: string | null;
  createdById: string;
  memberUserIds: string[];
  audit: CreateAuditLogInput;
};

export type CreateGroupTxResult = {
  conversation: GroupConversationRecord;
};

export interface IGroupRepository {
  findActiveGroup(groupId: string): Promise<GroupConversationRecord | null>;

  findActiveMembership(
    userId: string,
    groupId: string
  ): Promise<GroupMemberRecord | null>;

  listActiveMembers(groupId: string): Promise<GroupMemberRecord[]>;

  findActiveUsersByIds(userIds: string[]): Promise<ActiveUserRecord[]>;

  countActiveMembers(groupId: string): Promise<number>;

  findSystemRoleIds(
    groupId: string
  ): Promise<{ ownerId: string; adminId: string; memberId: string } | null>;

  createGroup(input: CreateGroupTxInput): Promise<CreateGroupTxResult>;

  updateGroupMetadata(input: {
    groupId: string;
    name?: string;
    description?: string | null;
    avatarUrl?: string | null;
    audit: CreateAuditLogInput;
  }): Promise<GroupConversationRecord | null>;

  softDeleteGroup(input: {
    groupId: string;
    audit: CreateAuditLogInput;
  }): Promise<boolean>;

  addMembers(input: {
    groupId: string;
    userIds: string[];
    memberRoleId: string | null;
    audit: CreateAuditLogInput;
  }): Promise<number>;

  removeMember(input: {
    groupId: string;
    userId: string;
    audit: CreateAuditLogInput;
  }): Promise<boolean>;

  changeMemberRole(input: {
    groupId: string;
    userId: string;
    role: MemberRole;
    groupRoleId: string | null;
    audit: CreateAuditLogInput;
  }): Promise<boolean>;

  transferOwnership(input: {
    groupId: string;
    fromUserId: string;
    toUserId: string;
    ownerRoleId: string | null;
    adminRoleId: string | null;
    audit: CreateAuditLogInput;
  }): Promise<boolean>;

  leaveGroup(input: {
    groupId: string;
    userId: string;
    audit: CreateAuditLogInput;
  }): Promise<boolean>;
}
