import type { GroupMember, MemberRole } from "../types/chat";

/**
 * Frontend-only permission helpers for UI gating.
 * Backend authorization must enforce these rules for any real API.
 */

export function canManageMembers(role: MemberRole | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function canRemoveMember(
  actorRole: MemberRole | undefined,
  targetRole: MemberRole | undefined
): boolean {
  if (!actorRole || !targetRole) {
    return false;
  }
  if (targetRole === "owner") {
    return false;
  }
  if (actorRole === "owner") {
    return true;
  }
  if (actorRole === "admin") {
    return targetRole === "member";
  }
  return false;
}

export function getMemberRole(
  members: GroupMember[],
  userId: string
): MemberRole | undefined {
  return members.find((member) => member.userId === userId)?.role;
}

export function getOwners(members: GroupMember[]): GroupMember[] {
  return members.filter((member) => member.role === "owner");
}

export function mustTransferOwnershipBeforeLeave(
  members: GroupMember[],
  userId: string
): boolean {
  const role = getMemberRole(members, userId);
  if (role !== "owner") {
    return false;
  }
  const owners = getOwners(members);
  return owners.length === 1 && members.length > 1;
}

export function normalizeGroupText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
