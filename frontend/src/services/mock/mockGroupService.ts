import type { GroupService } from "../groupService";
import type { Conversation, GroupMember } from "../../types/chat";
import {
  canRemoveMember,
  getMemberRole,
  mustTransferOwnershipBeforeLeave,
  normalizeGroupText,
} from "../../utils/groupPermissions";
import {
  generateConversationId,
  generateInviteCode,
  mockDataStore,
} from "./mockDataStore";

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function syncMemberIds(conversation: Conversation): void {
  if (conversation.members) {
    conversation.memberIds = conversation.members.map((member) => member.userId);
    conversation.adminIds = conversation.members
      .filter((member) => member.role === "admin" || member.role === "owner")
      .map((member) => member.userId);
  }
}

function getGroupOrThrow(conversationId: string): Conversation {
  const conversation = mockDataStore.conversations.find(
    (item) => item.id === conversationId
  );
  if (!conversation || conversation.type !== "group" || !conversation.members) {
    throw new Error("Group conversation not found");
  }
  return conversation;
}

class MockGroupService implements GroupService {
  async createGroup(params: {
    name: string;
    description: string;
    memberUserIds: string[];
    createdByUserId: string;
  }): Promise<Conversation> {
    await delay(500);

    const name = normalizeGroupText(params.name);
    if (!name) {
      throw new Error("Group name is required");
    }

    const uniqueMemberIds = Array.from(
      new Set(
        params.memberUserIds.filter((id) => id !== params.createdByUserId)
      )
    );

    if (uniqueMemberIds.length < 1) {
      throw new Error("Select at least one member to invite");
    }

    const members: GroupMember[] = [
      { userId: params.createdByUserId, role: "owner" },
      ...uniqueMemberIds.map((userId) => ({
        userId,
        role: "member" as const,
      })),
    ];

    const conversation: Conversation = {
      id: generateConversationId(),
      type: "group",
      name,
      avatar: "",
      description: normalizeGroupText(params.description),
      memberIds: members.map((member) => member.userId),
      members,
      createdBy: params.createdByUserId,
      adminIds: [params.createdByUserId],
      inviteCode: generateInviteCode(),
      pinned: false,
      lastMessagePreview: "",
      lastMessageAt: new Date().toISOString(),
    };

    mockDataStore.conversations = [conversation, ...mockDataStore.conversations];
    mockDataStore.messagesByConversation[conversation.id] = [];
    mockDataStore.unreadCounts[conversation.id] = 0;

    return { ...conversation };
  }

  async updateGroup(params: {
    conversationId: string;
    name?: string;
    description?: string | null;
    avatarUrl?: string | null;
  }): Promise<Conversation> {
    await delay(300);
    const conversation = getGroupOrThrow(params.conversationId);
    if (params.name !== undefined) {
      conversation.name = normalizeGroupText(params.name);
    }
    if (params.description !== undefined) {
      conversation.description = params.description ?? undefined;
    }
    if (params.avatarUrl !== undefined) {
      conversation.avatar = params.avatarUrl ?? "";
    }
    return { ...conversation };
  }

  async deleteGroup(conversationId: string): Promise<void> {
    await delay(300);
    getGroupOrThrow(conversationId);
    mockDataStore.conversations = mockDataStore.conversations.filter(
      (item) => item.id !== conversationId
    );
    delete mockDataStore.messagesByConversation[conversationId];
    delete mockDataStore.unreadCounts[conversationId];
  }

  async addMembers(params: {
    conversationId: string;
    memberUserIds: string[];
    actorUserId: string;
  }): Promise<Conversation> {
    await delay(300);
    const conversation = getGroupOrThrow(params.conversationId);
    const actorRole = getMemberRole(conversation.members ?? [], params.actorUserId);

    if (actorRole !== "owner" && actorRole !== "admin") {
      throw new Error("Only owners and admins can add members");
    }

    const existingIds = new Set(conversation.members?.map((m) => m.userId) ?? []);
    const toAdd = params.memberUserIds.filter((id) => !existingIds.has(id));

    if (toAdd.length === 0) {
      throw new Error("Selected users are already members");
    }

    const updatedMembers: GroupMember[] = [
      ...(conversation.members ?? []),
      ...toAdd.map((userId) => ({ userId, role: "member" as const })),
    ];

    conversation.members = updatedMembers;
    syncMemberIds(conversation);

    return { ...conversation };
  }

  async removeMember(params: {
    conversationId: string;
    targetUserId: string;
    actorUserId: string;
  }): Promise<Conversation> {
    await delay(300);
    const conversation = getGroupOrThrow(params.conversationId);
    const members = conversation.members ?? [];
    const actorRole = getMemberRole(members, params.actorUserId);
    const targetRole = getMemberRole(members, params.targetUserId);

    if (!canRemoveMember(actorRole, targetRole)) {
      throw new Error("You do not have permission to remove this member");
    }

    conversation.members = members.filter(
      (member) => member.userId !== params.targetUserId
    );
    syncMemberIds(conversation);

    return { ...conversation };
  }

  async changeMemberRole(params: {
    conversationId: string;
    targetUserId: string;
    role: "admin" | "member";
    actorUserId: string;
  }): Promise<Conversation> {
    await delay(300);
    const conversation = getGroupOrThrow(params.conversationId);
    const members = conversation.members ?? [];
    const actorRole = getMemberRole(members, params.actorUserId);

    if (actorRole !== "owner" && actorRole !== "admin") {
      throw new Error("You do not have permission to change roles");
    }

    const targetRole = getMemberRole(members, params.targetUserId);
    if (targetRole === "owner") {
      throw new Error("Cannot change the owner's role");
    }

    conversation.members = members.map((member) =>
      member.userId === params.targetUserId
        ? { ...member, role: params.role }
        : member
    );
    syncMemberIds(conversation);
    return { ...conversation };
  }

  async leaveGroup(params: {
    conversationId: string;
    userId: string;
  }): Promise<void> {
    await delay(300);
    const conversation = getGroupOrThrow(params.conversationId);
    const members = conversation.members ?? [];

    if (mustTransferOwnershipBeforeLeave(members, params.userId)) {
      throw new Error(
        "Transfer ownership to another member before leaving the group"
      );
    }

    if (members.length === 1 && members[0]?.userId === params.userId) {
      mockDataStore.conversations = mockDataStore.conversations.filter(
        (item) => item.id !== params.conversationId
      );
      delete mockDataStore.messagesByConversation[params.conversationId];
      delete mockDataStore.unreadCounts[params.conversationId];
      return;
    }

    conversation.members = members.filter(
      (member) => member.userId !== params.userId
    );
    syncMemberIds(conversation);
  }

  async transferOwnership(params: {
    conversationId: string;
    fromUserId: string;
    toUserId: string;
  }): Promise<Conversation> {
    await delay(300);
    const conversation = getGroupOrThrow(params.conversationId);
    const members = conversation.members ?? [];
    const fromRole = getMemberRole(members, params.fromUserId);

    if (fromRole !== "owner") {
      throw new Error("Only the owner can transfer ownership");
    }

    const targetExists = members.some(
      (member) => member.userId === params.toUserId
    );
    if (!targetExists) {
      throw new Error("New owner must be a group member");
    }

    conversation.members = members.map((member) => {
      if (member.userId === params.fromUserId) {
        return { ...member, role: "admin" as const };
      }
      if (member.userId === params.toUserId) {
        return { ...member, role: "owner" as const };
      }
      return member;
    });
    syncMemberIds(conversation);

    return { ...conversation };
  }
}

export const mockGroupService = new MockGroupService();
