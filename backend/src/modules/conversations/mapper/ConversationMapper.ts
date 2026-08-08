import type { MemberRole } from "@prisma/client";
import type {
  ApiGroupMemberDto,
  ConversationDto,
  ConversationUserDto,
} from "@modules/conversations/dto/ConversationDto.js";
import type {
  ActiveMemberRecord,
  ConversationRecord,
  ConversationUserRecord,
} from "@modules/conversations/interfaces/IConversationRepository.js";

function mapRole(role: MemberRole): ApiGroupMemberDto["role"] {
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
 * Maps persistence ↔ API DTOs. Never exposes auth secrets.
 */
export class ConversationMapper {
  static toUserDto(user: ConversationUserRecord): ConversationUserDto {
    return {
      id: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      about: user.about,
    };
  }

  static toConversationDto(input: {
    conversation: ConversationRecord;
    viewerMembership: ActiveMemberRecord;
    members: ActiveMemberRecord[];
    usersById: Map<string, ConversationUserRecord>;
    viewerUserId: string;
  }): ConversationDto {
    const { conversation, viewerMembership, members, usersById, viewerUserId } =
      input;

    const memberIds = members.map((m) => m.userId);
    const base = {
      id: conversation.id,
      memberIds,
      pinned: viewerMembership.pinned,
      muted: viewerMembership.muted,
      lastMessagePreview: conversation.lastMessagePreview,
      lastMessageAt: conversation.lastMessageAt
        ? conversation.lastMessageAt.toISOString()
        : null,
      unreadCount: viewerMembership.unreadCount,
    };

    if (conversation.type === "DIRECT") {
      const peerId = memberIds.find((id) => id !== viewerUserId) ?? null;
      const peer = peerId ? usersById.get(peerId) : undefined;

      return {
        ...base,
        type: "direct",
        name: peer?.name ?? "Unknown",
        avatarUrl: peer?.avatarUrl ?? null,
        description: null,
        members: null,
        createdBy: null,
        adminIds: null,
        inviteCode: null,
      };
    }

    const groupMembers: ApiGroupMemberDto[] = members.map((m) => ({
      userId: m.userId,
      role: mapRole(m.role),
    }));

    const adminIds = members
      .filter((m) => m.role === "ADMIN")
      .map((m) => m.userId);

    return {
      ...base,
      type: "group",
      name: conversation.name ?? "Group",
      avatarUrl: conversation.avatarUrl,
      description: conversation.description,
      members: groupMembers,
      createdBy: conversation.createdById,
      adminIds,
      inviteCode: conversation.inviteCode,
    };
  }
}
