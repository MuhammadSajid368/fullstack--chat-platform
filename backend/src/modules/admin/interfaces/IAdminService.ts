import type {
  AdminActor,
  AdminAuditPageDto,
  AdminClientContext,
  AdminConversationsPageDto,
  AdminForceLogoutResultDto,
  AdminGroupDto,
  AdminGroupsPageDto,
  AdminMemberDto,
  AdminMessagesPageDto,
  AdminMutationResultDto,
  AdminReportDto,
  AdminReportsPageDto,
  AdminUserDto,
  AdminUsersPageDto,
} from "@modules/admin/dto/AdminDto.js";

export type AdminListUsersInput = {
  q?: string;
  includeDeleted?: boolean;
  cursor?: string;
  limit: number;
};

export type AdminListConversationsInput = {
  q?: string;
  type?: string;
  includeDeleted?: boolean;
  cursor?: string;
  limit: number;
};

export type AdminListGroupsInput = {
  q?: string;
  includeDeleted?: boolean;
  cursor?: string;
  limit: number;
};

export type AdminListMessagesInput = {
  q?: string;
  conversationId?: string;
  senderId?: string;
  includeDeleted?: boolean;
  cursor?: string;
  limit: number;
};

export type AdminListAuditInput = {
  actorId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  cursor?: string;
  limit: number;
};

export type AdminListReportsInput = {
  status?: "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "DISMISSED";
  cursor?: string;
  limit: number;
};

export type AdminReasonInput = {
  reason?: string;
};

export interface IAdminService {
  listUsers(
    actor: AdminActor,
    input: AdminListUsersInput
  ): Promise<AdminUsersPageDto>;

  getUser(actor: AdminActor, userId: string): Promise<AdminUserDto>;

  suspendUser(
    actor: AdminActor,
    userId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminUserDto>;

  unsuspendUser(
    actor: AdminActor,
    userId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminUserDto>;

  softDeleteUser(
    actor: AdminActor,
    userId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminMutationResultDto>;

  restoreUser(
    actor: AdminActor,
    userId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminUserDto>;

  forceLogoutAll(
    actor: AdminActor,
    userId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminForceLogoutResultDto>;

  listConversations(
    actor: AdminActor,
    input: AdminListConversationsInput
  ): Promise<AdminConversationsPageDto>;

  softDeleteConversation(
    actor: AdminActor,
    conversationId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminMutationResultDto>;

  restoreConversation(
    actor: AdminActor,
    conversationId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminMutationResultDto>;

  archiveConversation(
    actor: AdminActor,
    conversationId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminMutationResultDto>;

  listConversationMembers(
    actor: AdminActor,
    conversationId: string
  ): Promise<AdminMemberDto[]>;

  listGroups(
    actor: AdminActor,
    input: AdminListGroupsInput
  ): Promise<AdminGroupsPageDto>;

  softDeleteGroup(
    actor: AdminActor,
    groupId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminMutationResultDto>;

  restoreGroup(
    actor: AdminActor,
    groupId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminMutationResultDto>;

  transferGroupOwnership(
    actor: AdminActor,
    groupId: string,
    newOwnerId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminGroupDto>;

  removeGroupMember(
    actor: AdminActor,
    groupId: string,
    targetUserId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminMutationResultDto>;

  changeGroupMemberRole(
    actor: AdminActor,
    groupId: string,
    targetUserId: string,
    role: "ADMIN" | "MEMBER",
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminMutationResultDto>;

  listMessages(
    actor: AdminActor,
    input: AdminListMessagesInput
  ): Promise<AdminMessagesPageDto>;

  softDeleteMessage(
    actor: AdminActor,
    messageId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminMutationResultDto>;

  restoreMessage(
    actor: AdminActor,
    messageId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminMutationResultDto>;

  listMessageAudit(
    actor: AdminActor,
    messageId: string
  ): Promise<AdminAuditPageDto>;

  listAudit(
    actor: AdminActor,
    input: AdminListAuditInput
  ): Promise<AdminAuditPageDto>;

  createReport(
    actor: AdminActor,
    input: {
      targetType: "USER" | "MESSAGE" | "CONVERSATION" | "GROUP";
      targetId: string;
      reason: string;
      details?: string;
    },
    context: AdminClientContext
  ): Promise<AdminReportDto>;

  listReports(
    actor: AdminActor,
    input: AdminListReportsInput
  ): Promise<AdminReportsPageDto>;

  reviewReport(
    actor: AdminActor,
    reportId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminReportDto>;

  resolveReport(
    actor: AdminActor,
    reportId: string,
    input: { resolution: string; reason?: string },
    context: AdminClientContext
  ): Promise<AdminReportDto>;

  dismissReport(
    actor: AdminActor,
    reportId: string,
    input: { resolution?: string; reason?: string },
    context: AdminClientContext
  ): Promise<AdminReportDto>;
}
