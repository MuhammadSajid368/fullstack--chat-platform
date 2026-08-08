import type { Conversation, MemberRole } from "../types/chat";

export interface CreateGroupParams {
  name: string;
  description: string;
  memberUserIds: string[];
  createdByUserId: string;
}

export interface UpdateGroupParams {
  conversationId: string;
  name?: string;
  description?: string | null;
  avatarUrl?: string | null;
}

export interface AddGroupMembersParams {
  conversationId: string;
  memberUserIds: string[];
  actorUserId: string;
}

export interface RemoveGroupMemberParams {
  conversationId: string;
  targetUserId: string;
  actorUserId: string;
}

export interface ChangeMemberRoleParams {
  conversationId: string;
  targetUserId: string;
  role: Extract<MemberRole, "admin" | "member">;
  actorUserId: string;
}

export interface LeaveGroupParams {
  conversationId: string;
  userId: string;
}

export interface TransferGroupOwnershipParams {
  conversationId: string;
  fromUserId: string;
  toUserId: string;
}

export interface GroupService {
  createGroup(params: CreateGroupParams): Promise<Conversation>;
  updateGroup(params: UpdateGroupParams): Promise<Conversation>;
  deleteGroup(conversationId: string): Promise<void>;
  addMembers(params: AddGroupMembersParams): Promise<Conversation>;
  removeMember(params: RemoveGroupMemberParams): Promise<Conversation>;
  changeMemberRole(params: ChangeMemberRoleParams): Promise<Conversation>;
  leaveGroup(params: LeaveGroupParams): Promise<void>;
  transferOwnership(params: TransferGroupOwnershipParams): Promise<Conversation>;
}
