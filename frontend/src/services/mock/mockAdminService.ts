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

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const users: AdminUser[] = [];
const reports: AdminReport[] = [];

class MockAdminService implements AdminService {
  async listUsers(_params: AdminListParams = {}): Promise<AdminPage<AdminUser>> {
    await delay(200);
    return { results: users.map((user) => ({ ...user })), nextCursor: null, hasMore: false };
  }

  async getUser(userId: string): Promise<AdminUser> {
    await delay(100);
    const user = users.find((item) => item.id === userId);
    if (!user) {
      throw new Error("User not found");
    }
    return { ...user };
  }

  async suspendUser(userId: string): Promise<AdminUser> {
    await delay(100);
    const user = await this.getUser(userId);
    return { ...user, suspendedAt: new Date().toISOString() };
  }

  async unsuspendUser(userId: string): Promise<AdminUser> {
    await delay(100);
    const user = await this.getUser(userId);
    return { ...user, suspendedAt: null };
  }

  async deleteUser(userId: string): Promise<void> {
    await delay(100);
    const index = users.findIndex((item) => item.id === userId);
    if (index === -1) {
      throw new Error("User not found");
    }
    users.splice(index, 1);
  }

  async restoreUser(userId: string): Promise<AdminUser> {
    await delay(100);
    return this.getUser(userId);
  }

  async logoutAll(_userId: string): Promise<void> {
    await delay(100);
  }

  async listConversations(): Promise<AdminPage<AdminConversation>> {
    await delay(200);
    return { results: [], nextCursor: null, hasMore: false };
  }

  async listConversationMembers(_conversationId: string): Promise<AdminMember[]> {
    await delay(100);
    return [];
  }

  async deleteConversation(_conversationId: string): Promise<void> {
    await delay(100);
  }

  async restoreConversation(_conversationId: string): Promise<AdminConversation> {
    await delay(100);
    throw new Error("Not implemented in mock");
  }

  async archiveConversation(_conversationId: string): Promise<AdminConversation> {
    await delay(100);
    throw new Error("Not implemented in mock");
  }

  async listGroups(): Promise<AdminPage<AdminGroup>> {
    await delay(200);
    return { results: [], nextCursor: null, hasMore: false };
  }

  async deleteGroup(_groupId: string): Promise<void> {
    await delay(100);
  }

  async restoreGroup(_groupId: string): Promise<AdminGroup> {
    await delay(100);
    throw new Error("Not implemented in mock");
  }

  async transferGroupOwnership(
    _groupId: string,
    _newOwnerUserId: string
  ): Promise<AdminGroup> {
    await delay(100);
    throw new Error("Not implemented in mock");
  }

  async removeGroupMember(_groupId: string, _userId: string): Promise<void> {
    await delay(100);
  }

  async changeGroupMemberRole(
    _groupId: string,
    _userId: string,
    _role: "ADMIN" | "MEMBER" | "OWNER"
  ): Promise<void> {
    await delay(100);
  }

  async listMessages(): Promise<AdminPage<AdminMessage>> {
    await delay(200);
    return { results: [], nextCursor: null, hasMore: false };
  }

  async listMessageAudit(_messageId: string): Promise<AdminAuditLog[]> {
    await delay(100);
    return [];
  }

  async deleteMessage(_messageId: string): Promise<void> {
    await delay(100);
  }

  async restoreMessage(_messageId: string): Promise<AdminMessage> {
    await delay(100);
    throw new Error("Not implemented in mock");
  }

  async listAudit(): Promise<AdminPage<AdminAuditLog>> {
    await delay(200);
    return { results: [], nextCursor: null, hasMore: false };
  }

  async listReports(): Promise<AdminPage<AdminReport>> {
    await delay(200);
    return {
      results: reports.map((report) => ({ ...report })),
      nextCursor: null,
      hasMore: false,
    };
  }

  async createReport(params: AdminCreateReportParams): Promise<AdminReport> {
    await delay(100);
    const report: AdminReport = {
      id: `report-${Date.now()}`,
      reporterId: "current-user",
      targetType: params.targetType,
      targetId: params.targetId,
      reason: params.reason,
      details: params.details,
      status: "OPEN",
      createdAt: new Date().toISOString(),
    };
    reports.push(report);
    return { ...report };
  }

  async reviewReport(reportId: string): Promise<AdminReport> {
    await delay(100);
    const report = reports.find((item) => item.id === reportId);
    if (!report) {
      throw new Error("Report not found");
    }
    report.status = "UNDER_REVIEW";
    return { ...report };
  }

  async resolveReport(reportId: string, resolution: string): Promise<AdminReport> {
    await delay(100);
    const report = reports.find((item) => item.id === reportId);
    if (!report) {
      throw new Error("Report not found");
    }
    report.status = "RESOLVED";
    report.resolution = resolution;
    return { ...report };
  }

  async dismissReport(reportId: string): Promise<AdminReport> {
    await delay(100);
    const report = reports.find((item) => item.id === reportId);
    if (!report) {
      throw new Error("Report not found");
    }
    report.status = "DISMISSED";
    return { ...report };
  }
}

export const mockAdminService = new MockAdminService();
