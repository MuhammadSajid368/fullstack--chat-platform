import { randomUUID } from "node:crypto";
import type { MemberRole } from "@prisma/client";
import { ValidationError } from "../../src/common/errors/index.js";
import type {
  ActiveUserRecord,
  CreateAuditLogInput,
  CreateGroupTxInput,
  CreateGroupTxResult,
  GroupConversationRecord,
  GroupMemberRecord,
  GroupRoleRecord,
  IGroupRepository,
} from "../../src/modules/groups/interfaces/IGroupRepository.js";

export type InMemoryGroupUser = {
  id: string;
  deletedAt: Date | null;
  suspendedAt: Date | null;
};

function cloneConversation(
  c: GroupConversationRecord
): GroupConversationRecord {
  return { ...c };
}

function cloneMember(m: GroupMemberRecord): GroupMemberRecord {
  return { ...m };
}

/**
 * In-memory group repository for unit / HTTP / concurrency tests.
 */
export class InMemoryGroupRepository implements IGroupRepository {
  conversations = new Map<string, GroupConversationRecord>();
  members = new Map<string, GroupMemberRecord>();
  roles = new Map<string, GroupRoleRecord>();
  users = new Map<string, InMemoryGroupUser>();
  auditLogs: CreateAuditLogInput[] = [];

  /** When true, the next createGroup membership write throws (simulates TX rollback). */
  failNextMembershipCreate = false;

  private pairLocks = new Map<string, Promise<void>>();

  seedUser(user: InMemoryGroupUser): void {
    this.users.set(user.id, { ...user });
  }

  seedConversation(c: GroupConversationRecord): void {
    this.conversations.set(c.id, cloneConversation(c));
  }

  seedMember(m: GroupMemberRecord): void {
    this.members.set(m.id, cloneMember(m));
  }

  seedRole(r: GroupRoleRecord): void {
    this.roles.set(r.id, { ...r });
  }

  async findActiveGroup(
    groupId: string
  ): Promise<GroupConversationRecord | null> {
    const c = this.conversations.get(groupId);
    if (
      !c ||
      c.type !== "GROUP" ||
      c.deletedAt != null ||
      c.status !== "ACTIVE"
    ) {
      return null;
    }
    return cloneConversation(c);
  }

  async findActiveMembership(
    userId: string,
    groupId: string
  ): Promise<GroupMemberRecord | null> {
    const group = await this.findActiveGroup(groupId);
    if (!group) {
      return null;
    }
    const member = [...this.members.values()].find(
      (m) =>
        m.userId === userId &&
        m.conversationId === groupId &&
        m.leftAt == null &&
        m.deletedAt == null
    );
    return member ? cloneMember(member) : null;
  }

  async listActiveMembers(groupId: string): Promise<GroupMemberRecord[]> {
    return [...this.members.values()]
      .filter(
        (m) =>
          m.conversationId === groupId &&
          m.leftAt == null &&
          m.deletedAt == null
      )
      .map(cloneMember);
  }

  async findActiveUsersByIds(userIds: string[]): Promise<ActiveUserRecord[]> {
    return userIds
      .map((id) => this.users.get(id))
      .filter((u): u is InMemoryGroupUser => !!u && u.deletedAt == null)
      .map((u) => ({ id: u.id, suspendedAt: u.suspendedAt }));
  }

  async countActiveMembers(groupId: string): Promise<number> {
    return (await this.listActiveMembers(groupId)).length;
  }

  async findSystemRoleIds(
    groupId: string
  ): Promise<{ ownerId: string; adminId: string; memberId: string } | null> {
    const rows = [...this.roles.values()].filter(
      (r) => r.conversationId === groupId && r.deletedAt == null
    );
    const byKey = new Map(rows.map((r) => [r.key, r.id]));
    const ownerId = byKey.get("owner");
    const adminId = byKey.get("admin");
    const memberId = byKey.get("member");
    if (!ownerId || !adminId || !memberId) {
      return null;
    }
    return { ownerId, adminId, memberId };
  }

  async createGroup(input: CreateGroupTxInput): Promise<CreateGroupTxResult> {
    return this.withLock(`create:${input.createdById}:${input.name}`, () => {
      const snapshot = {
        conversationIds: new Set(this.conversations.keys()),
        memberIds: new Set(this.members.keys()),
        roleIds: new Set(this.roles.keys()),
        auditCount: this.auditLogs.length,
      };

      try {
        const allUserIds = [input.createdById, ...input.memberUserIds];
        for (const userId of allUserIds) {
          const user = this.users.get(userId);
          if (!user || user.deletedAt != null || user.suspendedAt != null) {
            throw new ValidationError(
              "One or more users are unavailable for group membership",
              {
                memberUserIds:
                  "All members must be active (not deleted or suspended)",
              }
            );
          }
        }

        const now = new Date();
        const conversation: GroupConversationRecord = {
          id: `grp_${randomUUID()}`,
          type: "GROUP",
          status: "ACTIVE",
          name: input.name,
          description: input.description,
          avatarUrl: input.avatarUrl,
          inviteCode: null,
          createdById: input.createdById,
          lastMessagePreview: null,
          lastMessageAt: null,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        this.conversations.set(conversation.id, conversation);

        const ownerRoleId = `role_${randomUUID()}`;
        const adminRoleId = `role_${randomUUID()}`;
        const memberRoleId = `role_${randomUUID()}`;
        this.seedRole({
          id: ownerRoleId,
          conversationId: conversation.id,
          key: "owner",
          displayName: "Owner",
          isSystem: true,
          deletedAt: null,
        });
        this.seedRole({
          id: adminRoleId,
          conversationId: conversation.id,
          key: "admin",
          displayName: "Admin",
          isSystem: true,
          deletedAt: null,
        });
        this.seedRole({
          id: memberRoleId,
          conversationId: conversation.id,
          key: "member",
          displayName: "Member",
          isSystem: true,
          deletedAt: null,
        });

        this.seedMember({
          id: `mem_${randomUUID()}`,
          conversationId: conversation.id,
          userId: input.createdById,
          role: "OWNER",
          groupRoleId: ownerRoleId,
          muted: false,
          pinned: false,
          unreadCount: 0,
          leftAt: null,
          deletedAt: null,
        });

        if (this.failNextMembershipCreate) {
          this.failNextMembershipCreate = false;
          throw new Error("Simulated membership creation failure");
        }

        for (const userId of input.memberUserIds) {
          this.seedMember({
            id: `mem_${randomUUID()}`,
            conversationId: conversation.id,
            userId,
            role: "MEMBER",
            groupRoleId: memberRoleId,
            muted: false,
            pinned: false,
            unreadCount: 0,
            leftAt: null,
            deletedAt: null,
          });
        }

        this.auditLogs.push({ ...input.audit, entityId: conversation.id });
        return { conversation: cloneConversation(conversation) };
      } catch (err) {
        for (const id of this.conversations.keys()) {
          if (!snapshot.conversationIds.has(id)) {
            this.conversations.delete(id);
          }
        }
        for (const id of this.members.keys()) {
          if (!snapshot.memberIds.has(id)) {
            this.members.delete(id);
          }
        }
        for (const id of this.roles.keys()) {
          if (!snapshot.roleIds.has(id)) {
            this.roles.delete(id);
          }
        }
        this.auditLogs.length = snapshot.auditCount;
        throw err;
      }
    });
  }

  async updateGroupMetadata(input: {
    groupId: string;
    name?: string;
    description?: string | null;
    avatarUrl?: string | null;
    audit: CreateAuditLogInput;
  }): Promise<GroupConversationRecord | null> {
    const c = await this.findActiveGroup(input.groupId);
    if (!c) {
      return null;
    }
    const updated = this.conversations.get(input.groupId)!;
    if (input.name !== undefined) {
      updated.name = input.name;
    }
    if (input.description !== undefined) {
      updated.description = input.description;
    }
    if (input.avatarUrl !== undefined) {
      updated.avatarUrl = input.avatarUrl;
    }
    updated.updatedAt = new Date();
    this.auditLogs.push({ ...input.audit, entityId: input.groupId });
    return cloneConversation(updated);
  }

  async softDeleteGroup(input: {
    groupId: string;
    audit: CreateAuditLogInput;
  }): Promise<boolean> {
    const c = this.conversations.get(input.groupId);
    if (!c || c.deletedAt) {
      return false;
    }
    const now = new Date();
    c.deletedAt = now;
    c.status = "ARCHIVED";
    for (const m of this.members.values()) {
      if (m.conversationId === input.groupId && m.deletedAt == null) {
        m.deletedAt = now;
        m.leftAt = now;
      }
    }
    for (const r of this.roles.values()) {
      if (r.conversationId === input.groupId && r.deletedAt == null) {
        r.deletedAt = now;
      }
    }
    this.auditLogs.push({ ...input.audit, entityId: input.groupId });
    return true;
  }

  async addMembers(input: {
    groupId: string;
    userIds: string[];
    memberRoleId: string | null;
    audit: CreateAuditLogInput;
  }): Promise<number> {
    return this.withLock(`add:${input.groupId}`, () => {
      for (const userId of input.userIds) {
        const exists = [...this.members.values()].some(
          (m) =>
            m.conversationId === input.groupId &&
            m.userId === userId &&
            m.leftAt == null &&
            m.deletedAt == null
        );
        if (exists) {
          continue;
        }
        this.seedMember({
          id: `mem_${randomUUID()}`,
          conversationId: input.groupId,
          userId,
          role: "MEMBER",
          groupRoleId: input.memberRoleId,
          muted: false,
          pinned: false,
          unreadCount: 0,
          leftAt: null,
          deletedAt: null,
        });
      }
      this.auditLogs.push({ ...input.audit, entityId: input.groupId });
      return input.userIds.length;
    });
  }

  async removeMember(input: {
    groupId: string;
    userId: string;
    audit: CreateAuditLogInput;
  }): Promise<boolean> {
    const member = [...this.members.values()].find(
      (m) =>
        m.conversationId === input.groupId &&
        m.userId === input.userId &&
        m.leftAt == null &&
        m.deletedAt == null
    );
    if (!member) {
      return false;
    }
    const now = new Date();
    member.leftAt = now;
    member.deletedAt = now;
    this.auditLogs.push({ ...input.audit, entityId: input.groupId });
    return true;
  }

  async changeMemberRole(input: {
    groupId: string;
    userId: string;
    role: MemberRole;
    groupRoleId: string | null;
    audit: CreateAuditLogInput;
  }): Promise<boolean> {
    const member = [...this.members.values()].find(
      (m) =>
        m.conversationId === input.groupId &&
        m.userId === input.userId &&
        m.leftAt == null &&
        m.deletedAt == null
    );
    if (!member) {
      return false;
    }
    member.role = input.role;
    member.groupRoleId = input.groupRoleId;
    this.auditLogs.push({ ...input.audit, entityId: input.groupId });
    return true;
  }

  async transferOwnership(input: {
    groupId: string;
    fromUserId: string;
    toUserId: string;
    ownerRoleId: string | null;
    adminRoleId: string | null;
    audit: CreateAuditLogInput;
  }): Promise<boolean> {
    return this.withLock(`transfer:${input.groupId}`, () => {
      const from = [...this.members.values()].find(
        (m) =>
          m.conversationId === input.groupId &&
          m.userId === input.fromUserId &&
          m.leftAt == null &&
          m.deletedAt == null
      );
      if (!from || from.role !== "OWNER") {
        return false;
      }
      const to = [...this.members.values()].find(
        (m) =>
          m.conversationId === input.groupId &&
          m.userId === input.toUserId &&
          m.leftAt == null &&
          m.deletedAt == null
      );
      if (!to) {
        return false;
      }
      from.role = "ADMIN";
      from.groupRoleId = input.adminRoleId;
      to.role = "OWNER";
      to.groupRoleId = input.ownerRoleId;
      this.auditLogs.push({ ...input.audit, entityId: input.groupId });
      return true;
    });
  }

  async leaveGroup(input: {
    groupId: string;
    userId: string;
    audit: CreateAuditLogInput;
  }): Promise<boolean> {
    return this.removeMember(input);
  }

  private async withLock<T>(
    key: string,
    fn: () => Promise<T> | T
  ): Promise<T> {
    const prev = this.pairLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.pairLocks.set(
      key,
      prev.then(() => gate)
    );
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export function makeGroup(
  overrides: Partial<GroupConversationRecord> &
    Pick<GroupConversationRecord, "id" | "name">
): GroupConversationRecord {
  const now = new Date();
  return {
    type: "GROUP",
    status: "ACTIVE",
    avatarUrl: null,
    description: null,
    inviteCode: null,
    createdById: null,
    lastMessagePreview: null,
    lastMessageAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function makeGroupMember(
  overrides: Partial<GroupMemberRecord> &
    Pick<GroupMemberRecord, "id" | "conversationId" | "userId">
): GroupMemberRecord {
  return {
    role: "MEMBER",
    groupRoleId: null,
    muted: false,
    pinned: false,
    unreadCount: 0,
    leftAt: null,
    deletedAt: null,
    ...overrides,
  };
}
