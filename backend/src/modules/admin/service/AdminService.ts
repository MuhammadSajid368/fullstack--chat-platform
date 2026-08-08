import type { AuditAction, GlobalRole } from "@prisma/client";
import type { Logger } from "pino";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@common/errors/index.js";
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
import type { IAdminRepository } from "@modules/admin/interfaces/IAdminRepository.js";
import { disconnectUserSockets } from "@websocket/socketSessionRevoker.js";
import type {
  AdminListAuditInput,
  AdminListConversationsInput,
  AdminListGroupsInput,
  AdminListMessagesInput,
  AdminListReportsInput,
  AdminListUsersInput,
  AdminReasonInput,
  IAdminService,
} from "@modules/admin/interfaces/IAdminService.js";
import { AdminMapper } from "@modules/admin/mapper/AdminMapper.js";
import {
  decodeAdminCursor,
  encodeAdminCursor,
} from "@modules/admin/validators/AdminValidators.js";

function pageResults<T extends { createdAt: Date; id: string }, D>(
  rows: T[],
  limit: number,
  map: (row: T) => D
): { results: D[]; nextCursor: string | null; hasMore: boolean } {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice[slice.length - 1];
  return {
    results: slice.map(map),
    nextCursor: hasMore && last ? encodeAdminCursor(last.createdAt, last.id) : null,
    hasMore,
  };
}

/**
 * AdminService — fine-grained authz + audit orchestration (no Prisma).
 */
export class AdminService implements IAdminService {
  constructor(
    protected readonly repository: IAdminRepository,
    protected readonly logger: Logger
  ) {}

  async listUsers(
    actor: AdminActor,
    input: AdminListUsersInput
  ): Promise<AdminUsersPageDto> {
    this.assertAdmin(actor);
    const cursor = input.cursor ? decodeAdminCursor(input.cursor) : undefined;
    const rows = await this.repository.listUsers({
      q: input.q,
      includeDeleted: input.includeDeleted ?? false,
      cursor: cursor
        ? { createdAt: new Date(cursor.createdAt), id: cursor.id }
        : undefined,
      limit: input.limit,
    });
    return pageResults(rows, input.limit, (r) => AdminMapper.toUserDto(r));
  }

  async getUser(actor: AdminActor, userId: string): Promise<AdminUserDto> {
    this.assertAdmin(actor);
    const user = await this.repository.findUserById(userId);
    if (!user) throw new NotFoundError("User not found");
    return AdminMapper.toUserDto(user);
  }

  async suspendUser(
    actor: AdminActor,
    userId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminUserDto> {
    this.assertAdmin(actor);
    const target = await this.requireUser(userId);
    this.assertCanModerateUser(actor, target);
    if (target.suspendedAt) {
      throw new ConflictError("User is already suspended");
    }
    if (target.deletedAt) {
      throw new ConflictError("Cannot suspend a soft-deleted user");
    }

    const updated = await this.repository.suspendUser({
      userId,
      audit: this.audit(
        actor,
        "USER_SUSPEND",
        "user",
        userId,
        input.reason,
        context
      ),
    });
    if (!updated) throw new NotFoundError("User not found");
    this.logAction(actor, "USER_SUSPEND", userId, context);
    return AdminMapper.toUserDto(updated);
  }

  async unsuspendUser(
    actor: AdminActor,
    userId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminUserDto> {
    this.assertAdmin(actor);
    const target = await this.requireUser(userId);
    this.assertCanModerateUser(actor, target);

    const updated = await this.repository.unsuspendUser({
      userId,
      audit: this.audit(
        actor,
        "USER_UNSUSPEND",
        "user",
        userId,
        input.reason,
        context
      ),
    });
    if (!updated) throw new NotFoundError("User is not suspended");
    this.logAction(actor, "USER_UNSUSPEND", userId, context);
    return AdminMapper.toUserDto(updated);
  }

  async softDeleteUser(
    actor: AdminActor,
    userId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminMutationResultDto> {
    this.assertAdmin(actor);
    const target = await this.requireUser(userId);
    this.assertCanModerateUser(actor, target);

    const updated = await this.repository.softDeleteUser({
      userId,
      audit: this.audit(
        actor,
        "USER_SOFT_DELETE",
        "user",
        userId,
        input.reason,
        context
      ),
    });
    if (!updated) throw new NotFoundError("User not found");
    this.logAction(actor, "USER_SOFT_DELETE", userId, context);
    return { ok: true, id: userId };
  }

  async restoreUser(
    actor: AdminActor,
    userId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminUserDto> {
    this.assertAdmin(actor);
    const target = await this.requireUser(userId);
    this.assertCanModerateUser(actor, target);

    const updated = await this.repository.restoreUser({
      userId,
      audit: this.audit(
        actor,
        "USER_RESTORE",
        "user",
        userId,
        input.reason,
        context
      ),
    });
    if (!updated) throw new NotFoundError("User is not soft-deleted");
    this.logAction(actor, "USER_RESTORE", userId, context);
    return AdminMapper.toUserDto(updated);
  }

  async forceLogoutAll(
    actor: AdminActor,
    userId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminForceLogoutResultDto> {
    this.assertAdmin(actor);
    const target = await this.requireUser(userId);
    this.assertCanModerateUser(actor, target);

    const result = await this.repository.forceLogoutAll({
      userId,
      audit: this.audit(
        actor,
        "USER_FORCE_LOGOUT",
        "user",
        userId,
        input.reason,
        context
      ),
    });
    this.logAction(actor, "USER_FORCE_LOGOUT", userId, context);
    disconnectUserSockets(userId);
    return { ok: true, userId, ...result };
  }

  async listConversations(
    actor: AdminActor,
    input: AdminListConversationsInput
  ): Promise<AdminConversationsPageDto> {
    this.assertAdmin(actor);
    const cursor = input.cursor ? decodeAdminCursor(input.cursor) : undefined;
    let type: "DIRECT" | "GROUP" | undefined;
    if (input.type) {
      const t = input.type.toUpperCase();
      if (t !== "DIRECT" && t !== "GROUP") {
        throw new ValidationError("Invalid conversation type", {
          type: "Must be direct or group",
        });
      }
      type = t;
    }

    const rows = await this.repository.listConversations({
      q: input.q,
      type,
      includeDeleted: input.includeDeleted ?? false,
      cursor: cursor
        ? { createdAt: new Date(cursor.createdAt), id: cursor.id }
        : undefined,
      limit: input.limit,
    });
    return pageResults(rows, input.limit, (r) =>
      AdminMapper.toConversationDto(r)
    );
  }

  async softDeleteConversation(
    actor: AdminActor,
    conversationId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminMutationResultDto> {
    this.assertAdmin(actor);
    const ok = await this.repository.softDeleteConversation({
      conversationId,
      audit: this.audit(
        actor,
        "ADMIN_CONVERSATION_DELETE",
        "conversation",
        conversationId,
        input.reason,
        context
      ),
    });
    if (!ok) throw new NotFoundError("Conversation not found");
    this.logAction(actor, "ADMIN_CONVERSATION_DELETE", conversationId, context);
    return { ok: true, id: conversationId };
  }

  async restoreConversation(
    actor: AdminActor,
    conversationId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminMutationResultDto> {
    this.assertAdmin(actor);
    const ok = await this.repository.restoreConversation({
      conversationId,
      audit: this.audit(
        actor,
        "ADMIN_CONVERSATION_RESTORE",
        "conversation",
        conversationId,
        input.reason,
        context
      ),
    });
    if (!ok) throw new NotFoundError("Conversation is not soft-deleted");
    this.logAction(actor, "ADMIN_CONVERSATION_RESTORE", conversationId, context);
    return { ok: true, id: conversationId };
  }

  async archiveConversation(
    actor: AdminActor,
    conversationId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminMutationResultDto> {
    this.assertAdmin(actor);
    const ok = await this.repository.archiveConversation({
      conversationId,
      audit: this.audit(
        actor,
        "ADMIN_CONVERSATION_ARCHIVE",
        "conversation",
        conversationId,
        input.reason,
        context
      ),
    });
    if (!ok) throw new NotFoundError("Conversation not found");
    this.logAction(actor, "ADMIN_CONVERSATION_ARCHIVE", conversationId, context);
    return { ok: true, id: conversationId };
  }

  async listConversationMembers(
    actor: AdminActor,
    conversationId: string
  ): Promise<AdminMemberDto[]> {
    this.assertAdmin(actor);
    const conversation =
      await this.repository.findConversationById(conversationId);
    if (!conversation) throw new NotFoundError("Conversation not found");
    const members =
      await this.repository.listConversationMembers(conversationId);
    return members.map((m) => AdminMapper.toMemberDto(m));
  }

  async listGroups(
    actor: AdminActor,
    input: AdminListGroupsInput
  ): Promise<AdminGroupsPageDto> {
    this.assertAdmin(actor);
    const cursor = input.cursor ? decodeAdminCursor(input.cursor) : undefined;
    const rows = await this.repository.listGroups({
      q: input.q,
      includeDeleted: input.includeDeleted ?? false,
      cursor: cursor
        ? { createdAt: new Date(cursor.createdAt), id: cursor.id }
        : undefined,
      limit: input.limit,
    });
    return pageResults(rows, input.limit, (r) => AdminMapper.toGroupDto(r));
  }

  async softDeleteGroup(
    actor: AdminActor,
    groupId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminMutationResultDto> {
    this.assertAdmin(actor);
    const ok = await this.repository.softDeleteGroup({
      groupId,
      audit: this.audit(
        actor,
        "ADMIN_GROUP_DELETE",
        "group",
        groupId,
        input.reason,
        context
      ),
    });
    if (!ok) throw new NotFoundError("Group not found");
    this.logAction(actor, "ADMIN_GROUP_DELETE", groupId, context);
    return { ok: true, id: groupId };
  }

  async restoreGroup(
    actor: AdminActor,
    groupId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminMutationResultDto> {
    this.assertAdmin(actor);
    const ok = await this.repository.restoreGroup({
      groupId,
      audit: this.audit(
        actor,
        "ADMIN_GROUP_RESTORE",
        "group",
        groupId,
        input.reason,
        context
      ),
    });
    if (!ok) throw new NotFoundError("Group is not soft-deleted");
    this.logAction(actor, "ADMIN_GROUP_RESTORE", groupId, context);
    return { ok: true, id: groupId };
  }

  async transferGroupOwnership(
    actor: AdminActor,
    groupId: string,
    newOwnerId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminGroupDto> {
    this.assertAdmin(actor);
    const updated = await this.repository.transferGroupOwnership({
      groupId,
      newOwnerId,
      audit: this.audit(
        actor,
        "OWNERSHIP_TRANSFER",
        "group",
        groupId,
        input.reason,
        context,
        { newOwnerId }
      ),
    });
    if (!updated) {
      throw new NotFoundError(
        "Group not found or new owner is not an active member"
      );
    }
    this.logAction(actor, "OWNERSHIP_TRANSFER", groupId, context);
    return AdminMapper.toGroupDto(updated);
  }

  async removeGroupMember(
    actor: AdminActor,
    groupId: string,
    targetUserId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminMutationResultDto> {
    this.assertAdmin(actor);
    const ok = await this.repository.removeGroupMember({
      groupId,
      targetUserId,
      audit: this.audit(
        actor,
        "MEMBER_REMOVE",
        "group",
        groupId,
        input.reason,
        context,
        { targetUserId }
      ),
    });
    if (!ok) {
      throw new NotFoundError(
        "Member not found or cannot remove group owner without transfer"
      );
    }
    this.logAction(actor, "MEMBER_REMOVE", groupId, context);
    return { ok: true, id: targetUserId };
  }

  async changeGroupMemberRole(
    actor: AdminActor,
    groupId: string,
    targetUserId: string,
    role: "ADMIN" | "MEMBER",
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminMutationResultDto> {
    this.assertAdmin(actor);
    const ok = await this.repository.changeGroupMemberRole({
      groupId,
      targetUserId,
      role,
      audit: this.audit(
        actor,
        "MEMBER_ROLE_CHANGE",
        "group",
        groupId,
        input.reason,
        context,
        { targetUserId, role }
      ),
    });
    if (!ok) {
      throw new NotFoundError(
        "Member not found or cannot change owner role without transfer"
      );
    }
    this.logAction(actor, "MEMBER_ROLE_CHANGE", groupId, context);
    return { ok: true, id: targetUserId };
  }

  async listMessages(
    actor: AdminActor,
    input: AdminListMessagesInput
  ): Promise<AdminMessagesPageDto> {
    this.assertAdmin(actor);
    const cursor = input.cursor ? decodeAdminCursor(input.cursor) : undefined;
    const rows = await this.repository.listMessages({
      q: input.q,
      conversationId: input.conversationId,
      senderId: input.senderId,
      includeDeleted: input.includeDeleted ?? false,
      cursor: cursor
        ? { createdAt: new Date(cursor.createdAt), id: cursor.id }
        : undefined,
      limit: input.limit,
    });
    return pageResults(rows, input.limit, (r) => AdminMapper.toMessageDto(r));
  }

  async softDeleteMessage(
    actor: AdminActor,
    messageId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminMutationResultDto> {
    this.assertAdmin(actor);
    const ok = await this.repository.softDeleteMessage({
      messageId,
      audit: this.audit(
        actor,
        "ADMIN_MESSAGE_DELETE",
        "message",
        messageId,
        input.reason,
        context
      ),
    });
    if (!ok) throw new NotFoundError("Message not found");
    this.logAction(actor, "ADMIN_MESSAGE_DELETE", messageId, context);
    return { ok: true, id: messageId };
  }

  async restoreMessage(
    actor: AdminActor,
    messageId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminMutationResultDto> {
    this.assertAdmin(actor);
    const ok = await this.repository.restoreMessage({
      messageId,
      audit: this.audit(
        actor,
        "ADMIN_MESSAGE_RESTORE",
        "message",
        messageId,
        input.reason,
        context
      ),
    });
    if (!ok) throw new NotFoundError("Message is not soft-deleted");
    this.logAction(actor, "ADMIN_MESSAGE_RESTORE", messageId, context);
    return { ok: true, id: messageId };
  }

  async listMessageAudit(
    actor: AdminActor,
    messageId: string
  ): Promise<AdminAuditPageDto> {
    this.assertAdmin(actor);
    const message = await this.repository.findMessageById(messageId);
    if (!message) throw new NotFoundError("Message not found");
    const rows = await this.repository.listAuditForEntity({
      entityType: "message",
      entityId: messageId,
      limit: 100,
    });
    return {
      results: rows.map((r) => AdminMapper.toAuditDto(r)),
      nextCursor: null,
      hasMore: false,
    };
  }

  async listAudit(
    actor: AdminActor,
    input: AdminListAuditInput
  ): Promise<AdminAuditPageDto> {
    this.assertAdmin(actor);
    const cursor = input.cursor ? decodeAdminCursor(input.cursor) : undefined;
    const rows = await this.repository.listAuditLogs({
      actorId: input.actorId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      cursor: cursor
        ? { createdAt: new Date(cursor.createdAt), id: cursor.id }
        : undefined,
      limit: input.limit,
    });
    return pageResults(rows, input.limit, (r) => AdminMapper.toAuditDto(r));
  }

  async createReport(
    actor: AdminActor,
    input: {
      targetType: "USER" | "MESSAGE" | "CONVERSATION" | "GROUP";
      targetId: string;
      reason: string;
      details?: string;
    },
    context: AdminClientContext
  ): Promise<AdminReportDto> {
    this.assertAdmin(actor);
    const report = await this.repository.createReport({
      reporterId: actor.id,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      details: input.details,
      audit: this.audit(
        actor,
        "REPORT_CREATE",
        "report",
        "pending",
        input.reason,
        context,
        { targetType: input.targetType, targetId: input.targetId }
      ),
    });
    this.logAction(actor, "REPORT_CREATE", report.id, context);
    return AdminMapper.toReportDto(report);
  }

  async listReports(
    actor: AdminActor,
    input: AdminListReportsInput
  ): Promise<AdminReportsPageDto> {
    this.assertAdmin(actor);
    const cursor = input.cursor ? decodeAdminCursor(input.cursor) : undefined;
    const rows = await this.repository.listReports({
      status: input.status,
      cursor: cursor
        ? { createdAt: new Date(cursor.createdAt), id: cursor.id }
        : undefined,
      limit: input.limit,
    });
    return pageResults(rows, input.limit, (r) => AdminMapper.toReportDto(r));
  }

  async reviewReport(
    actor: AdminActor,
    reportId: string,
    input: AdminReasonInput,
    context: AdminClientContext
  ): Promise<AdminReportDto> {
    this.assertAdmin(actor);
    const report = await this.requireReport(reportId);
    if (report.status !== "OPEN") {
      throw new ConflictError("Only OPEN reports can move to review");
    }
    const updated = await this.repository.updateReportStatus({
      reportId,
      status: "UNDER_REVIEW",
      reviewerId: actor.id,
      audit: this.audit(
        actor,
        "REPORT_REVIEW",
        "report",
        reportId,
        input.reason,
        context
      ),
    });
    if (!updated) throw new NotFoundError("Report not found");
    this.logAction(actor, "REPORT_REVIEW", reportId, context);
    return AdminMapper.toReportDto(updated);
  }

  async resolveReport(
    actor: AdminActor,
    reportId: string,
    input: { resolution: string; reason?: string },
    context: AdminClientContext
  ): Promise<AdminReportDto> {
    this.assertAdmin(actor);
    const report = await this.requireReport(reportId);
    if (report.status !== "OPEN" && report.status !== "UNDER_REVIEW") {
      throw new ConflictError("Report is already closed");
    }
    const updated = await this.repository.updateReportStatus({
      reportId,
      status: "RESOLVED",
      reviewerId: actor.id,
      resolution: input.resolution,
      audit: this.audit(
        actor,
        "REPORT_RESOLVE",
        "report",
        reportId,
        input.reason,
        context
      ),
    });
    if (!updated) throw new NotFoundError("Report not found");
    this.logAction(actor, "REPORT_RESOLVE", reportId, context);
    return AdminMapper.toReportDto(updated);
  }

  async dismissReport(
    actor: AdminActor,
    reportId: string,
    input: { resolution?: string; reason?: string },
    context: AdminClientContext
  ): Promise<AdminReportDto> {
    this.assertAdmin(actor);
    const report = await this.requireReport(reportId);
    if (report.status !== "OPEN" && report.status !== "UNDER_REVIEW") {
      throw new ConflictError("Report is already closed");
    }
    const updated = await this.repository.updateReportStatus({
      reportId,
      status: "DISMISSED",
      reviewerId: actor.id,
      resolution: input.resolution ?? null,
      audit: this.audit(
        actor,
        "REPORT_DISMISS",
        "report",
        reportId,
        input.reason,
        context
      ),
    });
    if (!updated) throw new NotFoundError("Report not found");
    this.logAction(actor, "REPORT_DISMISS", reportId, context);
    return AdminMapper.toReportDto(updated);
  }

  private assertAdmin(actor: AdminActor): void {
    if (actor.globalRole !== "ADMIN" && actor.globalRole !== "SUPER_ADMIN") {
      throw new ForbiddenError("Admin access required");
    }
  }

  private assertCanModerateUser(
    actor: AdminActor,
    target: { id: string; globalRole: GlobalRole }
  ): void {
    if (actor.id === target.id) {
      throw new ForbiddenError("Cannot moderate your own account");
    }
    if (target.globalRole === "SUPER_ADMIN" && actor.globalRole !== "SUPER_ADMIN") {
      throw new ForbiddenError("Cannot moderate a super admin");
    }
    if (target.globalRole === "ADMIN" && actor.globalRole !== "SUPER_ADMIN") {
      throw new ForbiddenError("Only super admins can moderate admins");
    }
  }

  private async requireUser(userId: string) {
    const user = await this.repository.findUserById(userId);
    if (!user) throw new NotFoundError("User not found");
    return user;
  }

  private async requireReport(reportId: string) {
    const report = await this.repository.findReportById(reportId);
    if (!report) throw new NotFoundError("Report not found");
    return report;
  }

  private audit(
    actor: AdminActor,
    action: AuditAction,
    entityType: string,
    entityId: string,
    reason: string | undefined,
    context: AdminClientContext,
    metadata?: Record<string, unknown>
  ) {
    return {
      actorId: actor.id,
      action,
      entityType,
      entityId,
      reason,
      metadata,
      context,
    };
  }

  private logAction(
    actor: AdminActor,
    action: string,
    targetId: string,
    context: AdminClientContext
  ): void {
    this.logger.info(
      {
        module: "admin",
        action,
        actorId: actor.id,
        actorRole: actor.globalRole,
        targetId,
        requestId: context.requestId,
      },
      "admin.action"
    );
  }
}
