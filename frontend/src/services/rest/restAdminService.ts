import type {
  AdminAuditLog,
  AdminConversation,
  AdminCreateReportParams,
  AdminGroup,
  AdminListParams,
  AdminMember,
  AdminMessage,
  AdminPage,
  AdminReport,
  AdminService,
  AdminUser,
} from "../adminService";
import { API_ENDPOINTS } from "../api/endpoints";
import { httpDelete, httpGet, httpPatch, httpPost } from "../api/httpClient";
import type {
  ApiAdminAuditPageResponse,
  ApiAdminConversationsPageResponse,
  ApiAdminConversationDto,
  ApiAdminGroupsPageResponse,
  ApiAdminGroupDto,
  ApiAdminMemberDto,
  ApiAdminMessagesPageResponse,
  ApiAdminMessageDto,
  ApiAdminReportsPageResponse,
  ApiAdminReportDto,
  ApiAdminSuspendRequest,
  ApiAdminUserDto,
  ApiAdminUsersPageResponse,
} from "../api/apiTypes";
import { getErrorMessage } from "../api/apiError";

function reasonBody(reason?: string | null): ApiAdminSuspendRequest {
  return reason ? { reason } : {};
}

function transformAdminUser(dto: ApiAdminUserDto): AdminUser {
  return {
    id: dto.id,
    email: dto.email,
    name: dto.name,
    avatar: dto.avatarUrl ?? "",
    phone: dto.phone,
    about: dto.about,
    globalRole: dto.globalRole,
    suspendedAt: dto.suspendedAt,
    lastSeenAt: dto.lastSeenAt,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    deletedAt: dto.deletedAt,
  };
}

function transformAdminConversation(dto: ApiAdminConversationDto): AdminConversation {
  return {
    id: dto.id,
    type: dto.type,
    status: dto.status,
    name: dto.name,
    avatar: dto.avatarUrl ?? "",
    description: dto.description,
    memberCount: dto.memberCount,
    lastMessageAt: dto.lastMessageAt,
    createdAt: dto.createdAt,
    deletedAt: dto.deletedAt,
  };
}

function transformAdminGroup(dto: ApiAdminGroupDto): AdminGroup {
  return {
    id: dto.id,
    name: dto.name,
    avatar: dto.avatarUrl ?? "",
    description: dto.description,
    status: dto.status,
    memberCount: dto.memberCount,
    ownerId: dto.ownerId,
    createdAt: dto.createdAt,
    deletedAt: dto.deletedAt,
  };
}

function transformAdminMessage(dto: ApiAdminMessageDto): AdminMessage {
  return {
    id: dto.id,
    conversationId: dto.conversationId,
    senderId: dto.senderId,
    type: dto.type,
    content: dto.content,
    status: dto.status,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    deletedAt: dto.deletedAt,
  };
}

function transformAdminReport(dto: ApiAdminReportDto): AdminReport {
  return {
    id: dto.id,
    reporterId: dto.reporterId,
    targetType: dto.targetType,
    targetId: dto.targetId,
    reason: dto.reason,
    details: dto.details,
    status: dto.status,
    reviewerId: dto.reviewerId,
    resolution: dto.resolution,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

class RestAdminService implements AdminService {
  async listUsers(params: AdminListParams = {}): Promise<AdminPage<AdminUser>> {
    try {
      const data = await httpGet<ApiAdminUsersPageResponse>(
        API_ENDPOINTS.admin.users,
        { params }
      );
      return {
        results: data.results.map(transformAdminUser),
        nextCursor: data.nextCursor,
        hasMore: Boolean(data.hasMore),
      };
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to list users"));
    }
  }

  async getUser(userId: string): Promise<AdminUser> {
    try {
      const dto = await httpGet<ApiAdminUserDto>(
        API_ENDPOINTS.admin.userById(userId)
      );
      return transformAdminUser(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to load user"));
    }
  }

  async suspendUser(userId: string, reason?: string | null): Promise<AdminUser> {
    try {
      const dto = await httpPatch<ApiAdminUserDto>(
        API_ENDPOINTS.admin.suspend(userId),
        reasonBody(reason)
      );
      return transformAdminUser(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to suspend user"));
    }
  }

  async unsuspendUser(userId: string, reason?: string | null): Promise<AdminUser> {
    try {
      const dto = await httpPatch<ApiAdminUserDto>(
        API_ENDPOINTS.admin.unsuspend(userId),
        reasonBody(reason)
      );
      return transformAdminUser(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to unsuspend user"));
    }
  }

  async deleteUser(userId: string, reason?: string | null): Promise<void> {
    try {
      await httpDelete(API_ENDPOINTS.admin.deleteUser(userId), {
        data: reasonBody(reason),
      });
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to delete user"));
    }
  }

  async restoreUser(userId: string, reason?: string | null): Promise<AdminUser> {
    try {
      const dto = await httpPost<ApiAdminUserDto>(
        API_ENDPOINTS.admin.restoreUser(userId),
        reasonBody(reason)
      );
      return transformAdminUser(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to restore user"));
    }
  }

  async logoutAll(userId: string, reason?: string | null): Promise<void> {
    try {
      await httpPost(API_ENDPOINTS.admin.logoutAll(userId), reasonBody(reason));
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to logout user sessions"));
    }
  }

  async listConversations(
    params: AdminListParams = {}
  ): Promise<AdminPage<AdminConversation>> {
    try {
      const data = await httpGet<ApiAdminConversationsPageResponse>(
        API_ENDPOINTS.admin.conversations,
        { params }
      );
      return {
        results: data.results.map(transformAdminConversation),
        nextCursor: data.nextCursor,
        hasMore: Boolean(data.hasMore),
      };
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to list conversations"));
    }
  }

  async listConversationMembers(conversationId: string): Promise<AdminMember[]> {
    try {
      const data = await httpGet<{ members?: ApiAdminMemberDto[] }>(
        API_ENDPOINTS.admin.conversationMembers(conversationId)
      );
      return (data.members ?? []).map((member) => ({
        userId: member.userId,
        name: member.name,
        email: member.email,
        avatar: member.avatarUrl ?? "",
        role: member.role,
        muted: member.muted,
        joinedAt: member.joinedAt,
        leftAt: member.leftAt,
        deletedAt: member.deletedAt,
      }));
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to list conversation members"));
    }
  }

  async deleteConversation(
    conversationId: string,
    reason?: string | null
  ): Promise<void> {
    try {
      await httpDelete(API_ENDPOINTS.admin.deleteConversation(conversationId), {
        data: reasonBody(reason),
      });
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to delete conversation"));
    }
  }

  async restoreConversation(
    conversationId: string,
    reason?: string | null
  ): Promise<AdminConversation> {
    try {
      const dto = await httpPost<ApiAdminConversationDto>(
        API_ENDPOINTS.admin.restoreConversation(conversationId),
        reasonBody(reason)
      );
      return transformAdminConversation(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to restore conversation"));
    }
  }

  async archiveConversation(
    conversationId: string,
    reason?: string | null
  ): Promise<AdminConversation> {
    try {
      const dto = await httpPatch<ApiAdminConversationDto>(
        API_ENDPOINTS.admin.archiveConversation(conversationId),
        reasonBody(reason)
      );
      return transformAdminConversation(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to archive conversation"));
    }
  }

  async listGroups(params: AdminListParams = {}): Promise<AdminPage<AdminGroup>> {
    try {
      const data = await httpGet<ApiAdminGroupsPageResponse>(
        API_ENDPOINTS.admin.groups,
        { params }
      );
      return {
        results: data.results.map(transformAdminGroup),
        nextCursor: data.nextCursor,
        hasMore: Boolean(data.hasMore),
      };
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to list groups"));
    }
  }

  async deleteGroup(groupId: string, reason?: string | null): Promise<void> {
    try {
      await httpDelete(API_ENDPOINTS.admin.deleteGroup(groupId), {
        data: reasonBody(reason),
      });
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to delete group"));
    }
  }

  async restoreGroup(groupId: string, reason?: string | null): Promise<AdminGroup> {
    try {
      const dto = await httpPost<ApiAdminGroupDto>(
        API_ENDPOINTS.admin.restoreGroup(groupId),
        reasonBody(reason)
      );
      return transformAdminGroup(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to restore group"));
    }
  }

  async transferGroupOwnership(
    groupId: string,
    newOwnerUserId: string,
    reason?: string | null
  ): Promise<AdminGroup> {
    try {
      const dto = await httpPost<ApiAdminGroupDto>(
        API_ENDPOINTS.admin.transferGroupOwnership(groupId),
        { newOwnerUserId, ...reasonBody(reason) }
      );
      return transformAdminGroup(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to transfer group ownership"));
    }
  }

  async removeGroupMember(
    groupId: string,
    userId: string,
    reason?: string | null
  ): Promise<void> {
    try {
      await httpDelete(API_ENDPOINTS.admin.removeGroupMember(groupId, userId), {
        data: reasonBody(reason),
      });
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to remove group member"));
    }
  }

  async changeGroupMemberRole(
    groupId: string,
    userId: string,
    role: "ADMIN" | "MEMBER" | "OWNER",
    reason?: string | null
  ): Promise<void> {
    try {
      await httpPatch(
        API_ENDPOINTS.admin.changeGroupMemberRole(groupId, userId),
        { role, ...reasonBody(reason) }
      );
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to change group member role"));
    }
  }

  async listMessages(
    params: AdminListParams = {}
  ): Promise<AdminPage<AdminMessage>> {
    try {
      const data = await httpGet<ApiAdminMessagesPageResponse>(
        API_ENDPOINTS.admin.messages,
        { params }
      );
      return {
        results: data.results.map(transformAdminMessage),
        nextCursor: data.nextCursor,
        hasMore: Boolean(data.hasMore),
      };
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to list messages"));
    }
  }

  async listMessageAudit(messageId: string): Promise<AdminAuditLog[]> {
    try {
      const data = await httpGet<{ results?: AdminAuditLog[] }>(
        API_ENDPOINTS.admin.messageAudit(messageId)
      );
      return data.results ?? [];
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to load message audit"));
    }
  }

  async deleteMessage(messageId: string, reason?: string | null): Promise<void> {
    try {
      await httpDelete(API_ENDPOINTS.admin.deleteMessage(messageId), {
        data: reasonBody(reason),
      });
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to delete message"));
    }
  }

  async restoreMessage(
    messageId: string,
    reason?: string | null
  ): Promise<AdminMessage> {
    try {
      const dto = await httpPost<ApiAdminMessageDto>(
        API_ENDPOINTS.admin.restoreMessage(messageId),
        reasonBody(reason)
      );
      return transformAdminMessage(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to restore message"));
    }
  }

  async listAudit(params: AdminListParams = {}): Promise<AdminPage<AdminAuditLog>> {
    try {
      const data = await httpGet<ApiAdminAuditPageResponse>(
        API_ENDPOINTS.admin.audit,
        { params }
      );
      return {
        results: data.results,
        nextCursor: data.nextCursor,
        hasMore: Boolean(data.hasMore),
      };
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to list audit logs"));
    }
  }

  async listReports(params: AdminListParams = {}): Promise<AdminPage<AdminReport>> {
    try {
      const data = await httpGet<ApiAdminReportsPageResponse>(
        API_ENDPOINTS.admin.reports,
        { params }
      );
      return {
        results: data.results.map(transformAdminReport),
        nextCursor: data.nextCursor,
        hasMore: Boolean(data.hasMore),
      };
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to list reports"));
    }
  }

  async createReport(params: AdminCreateReportParams): Promise<AdminReport> {
    try {
      const dto = await httpPost<ApiAdminReportDto>(
        API_ENDPOINTS.admin.createReport,
        params
      );
      return transformAdminReport(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to create report"));
    }
  }

  async reviewReport(reportId: string, reason?: string | null): Promise<AdminReport> {
    try {
      const dto = await httpPatch<ApiAdminReportDto>(
        API_ENDPOINTS.admin.reviewReport(reportId),
        reasonBody(reason)
      );
      return transformAdminReport(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to review report"));
    }
  }

  async resolveReport(
    reportId: string,
    resolution: string,
    reason?: string | null
  ): Promise<AdminReport> {
    try {
      const dto = await httpPatch<ApiAdminReportDto>(
        API_ENDPOINTS.admin.resolveReport(reportId),
        { resolution, ...reasonBody(reason) }
      );
      return transformAdminReport(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to resolve report"));
    }
  }

  async dismissReport(reportId: string, reason?: string | null): Promise<AdminReport> {
    try {
      const dto = await httpPatch<ApiAdminReportDto>(
        API_ENDPOINTS.admin.dismissReport(reportId),
        reasonBody(reason)
      );
      return transformAdminReport(dto);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to dismiss report"));
    }
  }
}

export const restAdminService = new RestAdminService();
