import type { MemberRole } from "@prisma/client";
import type {
  ApiGroupMemberDto,
  GroupConversationDto,
} from "@modules/groups/dto/GroupDto.js";
import type {
  GroupConversationRecord,
  GroupMemberRecord,
} from "@modules/groups/interfaces/IGroupRepository.js";

function mapRole(role: MemberRole | string): ApiGroupMemberDto["role"] {
  switch (role) {
    case "OWNER":
      return "owner";
    case "ADMIN":
      return "admin";
    case "MEMBER":
    default:
      return "member";
  }
}

/**
 * Maps group persistence → API conversation DTO.
 */
export class GroupMapper {
  static toGroupDto(input: {
    conversation: GroupConversationRecord;
    viewerMembership: GroupMemberRecord;
    members: GroupMemberRecord[];
  }): GroupConversationDto {
    const { conversation, viewerMembership, members } = input;

    const groupMembers: ApiGroupMemberDto[] = members.map((m) => ({
      userId: m.userId,
      role: mapRole(m.role),
    }));

    const adminIds = members
      .filter((m) => m.role === "ADMIN")
      .map((m) => m.userId);

    return {
      id: conversation.id,
      type: "group",
      name: conversation.name ?? "Group",
      avatarUrl: conversation.avatarUrl,
      memberIds: members.map((m) => m.userId),
      pinned: viewerMembership.pinned,
      muted: viewerMembership.muted,
      lastMessagePreview: conversation.lastMessagePreview,
      lastMessageAt: conversation.lastMessageAt
        ? conversation.lastMessageAt.toISOString()
        : null,
      unreadCount: viewerMembership.unreadCount,
      description: conversation.description,
      members: groupMembers,
      createdBy: conversation.createdById,
      adminIds,
      inviteCode: conversation.inviteCode,
    };
  }
}
