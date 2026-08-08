import { AuditAction, type MemberRole } from "@prisma/client";
import type { Logger } from "pino";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@common/errors/index.js";
import type {
  AddMembersInput,
  ChangeMemberRoleInput,
  CreateGroupInput,
  GroupClientContext,
  GroupConversationDto,
  TransferOwnershipInput,
  UpdateGroupInput,
} from "@modules/groups/dto/GroupDto.js";
import type {
  GroupMemberRecord,
  IGroupRepository,
} from "@modules/groups/interfaces/IGroupRepository.js";
import type { IGroupService } from "@modules/groups/interfaces/IGroupService.js";
import { GroupMapper } from "@modules/groups/mapper/GroupMapper.js";
import {
  GROUP_MAX_MEMBERS,
  GROUP_MIN_MEMBERS,
} from "@modules/groups/validators/GroupValidators.js";
import {
  conversationRoom,
  groupRoom,
  RealtimeEvents,
  userRoom,
} from "@websocket/events.js";
import {
  NoOpEventPublisher,
  type IEventPublisher,
} from "@websocket/EventPublisher.js";

/**
 * Group service — authz, ownership rules, validation, transaction orchestration.
 * Never inserts messages.
 */
export class GroupService implements IGroupService {
  constructor(
    protected readonly repository: IGroupRepository,
    protected readonly logger: Logger,
    protected readonly events: IEventPublisher = new NoOpEventPublisher()
  ) {}

  async createGroup(
    userId: string,
    input: CreateGroupInput,
    context: GroupClientContext
  ): Promise<GroupConversationDto> {
    const memberUserIds = input.memberUserIds;

    if (memberUserIds.includes(userId)) {
      throw new ValidationError("Creator cannot be in memberUserIds", {
        memberUserIds: "Creator must not appear in members array",
      });
    }

    const uniqueMemberIds = [...new Set(memberUserIds)];
    if (uniqueMemberIds.length !== memberUserIds.length) {
      throw new ValidationError("Duplicate member IDs", {
        memberUserIds: "Duplicate member IDs are not allowed",
      });
    }

    if (uniqueMemberIds.length < GROUP_MIN_MEMBERS) {
      throw new ValidationError("Not enough members", {
        memberUserIds: `At least ${GROUP_MIN_MEMBERS} unique members required`,
      });
    }

    if (uniqueMemberIds.length + 1 > GROUP_MAX_MEMBERS) {
      throw new ValidationError("Too many members", {
        memberUserIds: `Maximum ${GROUP_MAX_MEMBERS} members`,
      });
    }

    await this.assertActiveUsers(uniqueMemberIds);

    const created = await this.repository.createGroup({
      name: input.name.trim().replace(/\s+/g, " "),
      description: input.description ?? null,
      avatarUrl: input.avatarUrl ?? null,
      createdById: userId,
      memberUserIds: uniqueMemberIds,
      audit: {
        actorId: userId,
        action: AuditAction.CONVERSATION_CREATE,
        entityType: "Conversation",
        metadata: {
          requestId: context.requestId,
          type: "GROUP",
          memberCount: uniqueMemberIds.length + 1,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    this.logger.info(
      {
        requestId: context.requestId,
        userId,
        groupId: created.conversation.id,
      },
      "Group created"
    );

    const dto = await this.toDto(userId, created.conversation.id);
    const memberRooms = [
      userId,
      ...uniqueMemberIds,
    ].map((id) => userRoom(id));
    this.events.publish({
      name: RealtimeEvents.CONVERSATION_CREATED,
      rooms: [
        conversationRoom(created.conversation.id),
        groupRoom(created.conversation.id),
        ...memberRooms,
      ],
      payload: {
        conversationId: created.conversation.id,
        type: "group",
        conversation: dto,
      },
    });
    return dto;
  }

  async getGroup(
    userId: string,
    groupId: string
  ): Promise<GroupConversationDto> {
    await this.requireMember(userId, groupId);
    return this.toDto(userId, groupId);
  }

  async updateGroup(
    userId: string,
    groupId: string,
    input: UpdateGroupInput,
    context: GroupClientContext
  ): Promise<GroupConversationDto> {
    const membership = await this.requireMember(userId, groupId);
    this.requireOwnerOrAdmin(membership);

    const updated = await this.repository.updateGroupMetadata({
      groupId,
      name: input.name,
      description: input.description,
      avatarUrl: input.avatarUrl,
      audit: {
        actorId: userId,
        action: AuditAction.CONVERSATION_UPDATE,
        entityType: "Conversation",
        entityId: groupId,
        metadata: { requestId: context.requestId },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    if (!updated) {
      throw new NotFoundError("Group not found");
    }

    const dto = await this.toDto(userId, groupId);
    this.events.publish({
      name: RealtimeEvents.CONVERSATION_UPDATED,
      rooms: [conversationRoom(groupId), groupRoom(groupId)],
      payload: {
        conversationId: groupId,
        conversation: dto,
      },
    });
    return dto;
  }

  async deleteGroup(
    userId: string,
    groupId: string,
    context: GroupClientContext
  ): Promise<void> {
    const membership = await this.requireMember(userId, groupId);
    if (membership.role !== "OWNER") {
      throw new ForbiddenError("Only the owner can delete the group");
    }

    const members = await this.repository.listActiveMembers(groupId);
    const owners = members.filter((m) => m.role === "OWNER");
    if (owners.length === 0) {
      throw new ConflictError("Cannot delete a group without an owner");
    }

    const ok = await this.repository.softDeleteGroup({
      groupId,
      audit: {
        actorId: userId,
        action: AuditAction.CONVERSATION_ARCHIVE,
        entityType: "Conversation",
        entityId: groupId,
        metadata: { requestId: context.requestId, softDelete: true },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    if (!ok) {
      throw new NotFoundError("Group not found");
    }

    this.events.publish({
      name: RealtimeEvents.CONVERSATION_DELETED,
      rooms: [
        conversationRoom(groupId),
        groupRoom(groupId),
        ...members.map((m) => userRoom(m.userId)),
      ],
      payload: {
        conversationId: groupId,
      },
    });
  }

  async addMembers(
    userId: string,
    groupId: string,
    input: AddMembersInput,
    context: GroupClientContext
  ): Promise<GroupConversationDto> {
    const membership = await this.requireMember(userId, groupId);
    this.requireOwnerOrAdmin(membership);

    const uniqueIds = [...new Set(input.memberUserIds)];
    if (uniqueIds.length === 0) {
      throw new ValidationError("memberUserIds is required", {
        memberUserIds: "At least one user id is required",
      });
    }

    const existing = await this.repository.listActiveMembers(groupId);
    const existingIds = new Set(existing.map((m) => m.userId));
    const toAdd = uniqueIds.filter((id) => !existingIds.has(id));

    if (toAdd.length === 0) {
      throw new ConflictError("All users are already members");
    }

    if (existing.length + toAdd.length > GROUP_MAX_MEMBERS) {
      throw new ValidationError("Member limit exceeded", {
        memberUserIds: `Maximum ${GROUP_MAX_MEMBERS} members`,
      });
    }

    await this.assertActiveUsers(toAdd);

    const roles = await this.repository.findSystemRoleIds(groupId);

    await this.repository.addMembers({
      groupId,
      userIds: toAdd,
      memberRoleId: roles?.memberId ?? null,
      audit: {
        actorId: userId,
        action: AuditAction.MEMBER_ADD,
        entityType: "Conversation",
        entityId: groupId,
        metadata: { requestId: context.requestId },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    const dto = await this.toDto(userId, groupId);
    for (const memberUserId of toAdd) {
      this.events.publish({
        name: RealtimeEvents.MEMBER_JOINED,
        rooms: [
          conversationRoom(groupId),
          groupRoom(groupId),
          userRoom(memberUserId),
        ],
        payload: {
          conversationId: groupId,
          userId: memberUserId,
        },
      });
    }
    return dto;
  }

  async removeMember(
    userId: string,
    groupId: string,
    targetUserId: string,
    context: GroupClientContext
  ): Promise<GroupConversationDto> {
    const actor = await this.requireMember(userId, groupId);
    const members = await this.repository.listActiveMembers(groupId);
    const target = members.find((m) => m.userId === targetUserId);
    if (!target) {
      throw new NotFoundError("Member not found");
    }

    if (!this.canRemove(actor, target, members)) {
      throw new ForbiddenError("Insufficient permissions to remove member");
    }

    const ok = await this.repository.removeMember({
      groupId,
      userId: targetUserId,
      audit: {
        actorId: userId,
        action: AuditAction.MEMBER_REMOVE,
        entityType: "Conversation",
        entityId: groupId,
        metadata: { requestId: context.requestId },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    if (!ok) {
      throw new NotFoundError("Member not found");
    }

    const dto = await this.toDto(userId, groupId);
    this.events.publish({
      name: RealtimeEvents.MEMBER_REMOVED,
      rooms: [
        conversationRoom(groupId),
        groupRoom(groupId),
        userRoom(targetUserId),
      ],
      payload: {
        conversationId: groupId,
        userId: targetUserId,
        removedBy: userId,
      },
    });
    return dto;
  }

  async changeMemberRole(
    userId: string,
    groupId: string,
    targetUserId: string,
    input: ChangeMemberRoleInput,
    context: GroupClientContext
  ): Promise<GroupConversationDto> {
    const actor = await this.requireMember(userId, groupId);
    if (actor.role !== "OWNER") {
      throw new ForbiddenError("Only the owner can change member roles");
    }

    if (targetUserId === userId) {
      throw new ForbiddenError("Owner cannot demote themselves");
    }

    const members = await this.repository.listActiveMembers(groupId);
    const target = members.find((m) => m.userId === targetUserId);
    if (!target) {
      throw new NotFoundError("Member not found");
    }

    if (target.role === "OWNER") {
      throw new ForbiddenError("Use transfer ownership to change the owner");
    }

    const newRole: MemberRole = input.role === "admin" ? "ADMIN" : "MEMBER";
    const roles = await this.repository.findSystemRoleIds(groupId);
    const groupRoleId =
      newRole === "ADMIN" ? (roles?.adminId ?? null) : (roles?.memberId ?? null);

    const ok = await this.repository.changeMemberRole({
      groupId,
      userId: targetUserId,
      role: newRole,
      groupRoleId,
      audit: {
        actorId: userId,
        action: AuditAction.MEMBER_ROLE_CHANGE,
        entityType: "Conversation",
        entityId: groupId,
        metadata: { requestId: context.requestId },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    if (!ok) {
      throw new NotFoundError("Member not found");
    }

    const dto = await this.toDto(userId, groupId);
    this.events.publish({
      name: RealtimeEvents.ROLE_CHANGED,
      rooms: [
        conversationRoom(groupId),
        groupRoom(groupId),
        userRoom(targetUserId),
      ],
      payload: {
        conversationId: groupId,
        userId: targetUserId,
        role: input.role,
      },
    });
    return dto;
  }

  async leaveGroup(
    userId: string,
    groupId: string,
    context: GroupClientContext
  ): Promise<void> {
    const membership = await this.requireMember(userId, groupId);
    const members = await this.repository.listActiveMembers(groupId);

    if (membership.role === "OWNER") {
      const owners = members.filter((m) => m.role === "OWNER");
      if (owners.length === 1) {
        throw new ConflictError(
          "Sole owner cannot leave; transfer ownership or delete the group"
        );
      }
    }

    const ok = await this.repository.leaveGroup({
      groupId,
      userId,
      audit: {
        actorId: userId,
        action: AuditAction.MEMBER_REMOVE,
        entityType: "Conversation",
        entityId: groupId,
        metadata: { requestId: context.requestId, leave: true },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    if (!ok) {
      throw new NotFoundError("Group not found");
    }

    this.events.publish({
      name: RealtimeEvents.MEMBER_LEFT,
      rooms: [
        conversationRoom(groupId),
        groupRoom(groupId),
        userRoom(userId),
      ],
      payload: {
        conversationId: groupId,
        userId,
      },
    });
  }

  async transferOwnership(
    userId: string,
    groupId: string,
    input: TransferOwnershipInput,
    context: GroupClientContext
  ): Promise<GroupConversationDto> {
    const actor = await this.requireMember(userId, groupId);
    if (actor.role !== "OWNER") {
      throw new ForbiddenError("Only the owner can transfer ownership");
    }

    if (input.newOwnerUserId === userId) {
      throw new ValidationError("Cannot transfer ownership to yourself", {
        newOwnerUserId: "Invalid target",
      });
    }

    const members = await this.repository.listActiveMembers(groupId);
    const target = members.find((m) => m.userId === input.newOwnerUserId);
    if (!target) {
      throw new ValidationError("New owner must be an active group member", {
        newOwnerUserId: "Not a member",
      });
    }

    const roles = await this.repository.findSystemRoleIds(groupId);

    const ok = await this.repository.transferOwnership({
      groupId,
      fromUserId: userId,
      toUserId: input.newOwnerUserId,
      ownerRoleId: roles?.ownerId ?? null,
      adminRoleId: roles?.adminId ?? null,
      audit: {
        actorId: userId,
        action: AuditAction.OWNERSHIP_TRANSFER,
        entityType: "Conversation",
        entityId: groupId,
        metadata: { requestId: context.requestId },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    if (!ok) {
      throw new ForbiddenError("Ownership transfer failed");
    }

    const dto = await this.toDto(userId, groupId);
    this.events.publish({
      name: RealtimeEvents.OWNERSHIP_TRANSFERRED,
      rooms: [
        conversationRoom(groupId),
        groupRoom(groupId),
        userRoom(userId),
        userRoom(input.newOwnerUserId),
      ],
      payload: {
        conversationId: groupId,
        fromUserId: userId,
        toUserId: input.newOwnerUserId,
      },
    });
    return dto;
  }

  private canRemove(
    actor: GroupMemberRecord,
    target: GroupMemberRecord,
    members: GroupMemberRecord[]
  ): boolean {
    if (target.role === "OWNER") {
      const owners = members.filter((m) => m.role === "OWNER");
      if (owners.length <= 1) {
        return false;
      }
      return actor.role === "OWNER" && actor.userId !== target.userId;
    }
    if (actor.role === "OWNER") {
      return true;
    }
    if (actor.role === "ADMIN") {
      return target.role === "MEMBER";
    }
    return false;
  }

  private requireOwnerOrAdmin(membership: GroupMemberRecord): void {
    if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
      throw new ForbiddenError("Insufficient permissions");
    }
  }

  private async requireMember(userId: string, groupId: string) {
    const group = await this.repository.findActiveGroup(groupId);
    if (!group) {
      throw new NotFoundError("Group not found");
    }
    const membership = await this.repository.findActiveMembership(
      userId,
      groupId
    );
    if (!membership) {
      throw new NotFoundError("Group not found");
    }
    return membership;
  }

  private async assertActiveUsers(userIds: string[]): Promise<void> {
    const found = await this.repository.findActiveUsersByIds(userIds);
    const foundIds = new Set(found.map((u) => u.id));
    const missing = userIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new ValidationError("One or more users do not exist", {
        memberUserIds: `Unknown user IDs: ${missing.join(", ")}`,
      });
    }

    const suspended = found.filter((u) => u.suspendedAt !== null);
    if (suspended.length > 0) {
      throw new ValidationError("One or more users are suspended", {
        memberUserIds: `Suspended user IDs: ${suspended.map((u) => u.id).join(", ")}`,
      });
    }
  }

  private async toDto(
    userId: string,
    groupId: string
  ): Promise<GroupConversationDto> {
    const conversation = await this.repository.findActiveGroup(groupId);
    if (!conversation) {
      throw new NotFoundError("Group not found");
    }
    const membership = await this.repository.findActiveMembership(
      userId,
      groupId
    );
    if (!membership) {
      throw new NotFoundError("Group not found");
    }
    const members = await this.repository.listActiveMembers(groupId);
    return GroupMapper.toGroupDto({
      conversation,
      viewerMembership: membership,
      members,
    });
  }
}
