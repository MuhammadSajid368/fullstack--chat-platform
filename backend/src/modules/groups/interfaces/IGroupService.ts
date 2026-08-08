import type {
  AddMembersInput,
  ChangeMemberRoleInput,
  CreateGroupInput,
  GroupClientContext,
  GroupConversationDto,
  TransferOwnershipInput,
  UpdateGroupInput,
} from "@modules/groups/dto/GroupDto.js";

export interface IGroupService {
  createGroup(
    userId: string,
    input: CreateGroupInput,
    context: GroupClientContext
  ): Promise<GroupConversationDto>;

  getGroup(userId: string, groupId: string): Promise<GroupConversationDto>;

  updateGroup(
    userId: string,
    groupId: string,
    input: UpdateGroupInput,
    context: GroupClientContext
  ): Promise<GroupConversationDto>;

  deleteGroup(
    userId: string,
    groupId: string,
    context: GroupClientContext
  ): Promise<void>;

  addMembers(
    userId: string,
    groupId: string,
    input: AddMembersInput,
    context: GroupClientContext
  ): Promise<GroupConversationDto>;

  removeMember(
    userId: string,
    groupId: string,
    targetUserId: string,
    context: GroupClientContext
  ): Promise<GroupConversationDto>;

  changeMemberRole(
    userId: string,
    groupId: string,
    targetUserId: string,
    input: ChangeMemberRoleInput,
    context: GroupClientContext
  ): Promise<GroupConversationDto>;

  leaveGroup(
    userId: string,
    groupId: string,
    context: GroupClientContext
  ): Promise<void>;

  transferOwnership(
    userId: string,
    groupId: string,
    input: TransferOwnershipInput,
    context: GroupClientContext
  ): Promise<GroupConversationDto>;
}
