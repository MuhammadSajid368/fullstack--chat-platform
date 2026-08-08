import { Router, type RequestHandler } from "express";
import { validateRequest } from "@middleware/validate.js";
import type { AdminController } from "@modules/admin/controller/AdminController.js";
import {
  adminChangeMemberRoleBodySchema,
  adminConversationIdParamsSchema,
  adminCreateReportBodySchema,
  adminDismissReportBodySchema,
  adminGroupIdParamsSchema,
  adminGroupMemberParamsSchema,
  adminListAuditQuerySchema,
  adminListConversationsQuerySchema,
  adminListGroupsQuerySchema,
  adminListMessagesQuerySchema,
  adminListReportsQuerySchema,
  adminListUsersQuerySchema,
  adminMessageIdParamsSchema,
  adminReportIdParamsSchema,
  adminResolveReportBodySchema,
  adminSuspendBodySchema,
  adminTransferOwnershipBodySchema,
  adminUserIdParamsSchema,
} from "@modules/admin/validators/AdminValidators.js";

/**
 * Admin & Moderation routes under `/admin`.
 */
export function createAdminRoutes(
  controller: AdminController,
  authenticate: RequestHandler,
  requireAdmin: RequestHandler
): Router {
  const router = Router();
  router.use(authenticate, requireAdmin);

  // Users
  router.get(
    "/users",
    validateRequest(adminListUsersQuerySchema, "query"),
    controller.listUsers
  );
  router.get(
    "/users/:id",
    validateRequest(adminUserIdParamsSchema, "params"),
    controller.getUser
  );
  router.patch(
    "/users/:id/suspend",
    validateRequest(adminUserIdParamsSchema, "params"),
    validateRequest(adminSuspendBodySchema, "body"),
    controller.suspendUser
  );
  router.patch(
    "/users/:id/unsuspend",
    validateRequest(adminUserIdParamsSchema, "params"),
    validateRequest(adminSuspendBodySchema, "body"),
    controller.unsuspendUser
  );
  router.delete(
    "/users/:id",
    validateRequest(adminUserIdParamsSchema, "params"),
    validateRequest(adminSuspendBodySchema, "body"),
    controller.softDeleteUser
  );
  router.post(
    "/users/:id/restore",
    validateRequest(adminUserIdParamsSchema, "params"),
    validateRequest(adminSuspendBodySchema, "body"),
    controller.restoreUser
  );
  router.post(
    "/users/:id/logout-all",
    validateRequest(adminUserIdParamsSchema, "params"),
    validateRequest(adminSuspendBodySchema, "body"),
    controller.forceLogoutAll
  );

  // Conversations
  router.get(
    "/conversations",
    validateRequest(adminListConversationsQuerySchema, "query"),
    controller.listConversations
  );
  router.get(
    "/conversations/:id/members",
    validateRequest(adminConversationIdParamsSchema, "params"),
    controller.listConversationMembers
  );
  router.delete(
    "/conversations/:id",
    validateRequest(adminConversationIdParamsSchema, "params"),
    validateRequest(adminSuspendBodySchema, "body"),
    controller.softDeleteConversation
  );
  router.post(
    "/conversations/:id/restore",
    validateRequest(adminConversationIdParamsSchema, "params"),
    validateRequest(adminSuspendBodySchema, "body"),
    controller.restoreConversation
  );
  router.patch(
    "/conversations/:id/archive",
    validateRequest(adminConversationIdParamsSchema, "params"),
    validateRequest(adminSuspendBodySchema, "body"),
    controller.archiveConversation
  );

  // Groups
  router.get(
    "/groups",
    validateRequest(adminListGroupsQuerySchema, "query"),
    controller.listGroups
  );
  router.delete(
    "/groups/:id",
    validateRequest(adminGroupIdParamsSchema, "params"),
    validateRequest(adminSuspendBodySchema, "body"),
    controller.softDeleteGroup
  );
  router.post(
    "/groups/:id/restore",
    validateRequest(adminGroupIdParamsSchema, "params"),
    validateRequest(adminSuspendBodySchema, "body"),
    controller.restoreGroup
  );
  router.post(
    "/groups/:id/transfer-ownership",
    validateRequest(adminGroupIdParamsSchema, "params"),
    validateRequest(adminTransferOwnershipBodySchema, "body"),
    controller.transferGroupOwnership
  );
  router.delete(
    "/groups/:id/members/:userId",
    validateRequest(adminGroupMemberParamsSchema, "params"),
    validateRequest(adminSuspendBodySchema, "body"),
    controller.removeGroupMember
  );
  router.patch(
    "/groups/:id/members/:userId/role",
    validateRequest(adminGroupMemberParamsSchema, "params"),
    validateRequest(adminChangeMemberRoleBodySchema, "body"),
    controller.changeGroupMemberRole
  );

  // Messages
  router.get(
    "/messages",
    validateRequest(adminListMessagesQuerySchema, "query"),
    controller.listMessages
  );
  router.get(
    "/messages/:id/audit",
    validateRequest(adminMessageIdParamsSchema, "params"),
    controller.listMessageAudit
  );
  router.delete(
    "/messages/:id",
    validateRequest(adminMessageIdParamsSchema, "params"),
    validateRequest(adminSuspendBodySchema, "body"),
    controller.softDeleteMessage
  );
  router.post(
    "/messages/:id/restore",
    validateRequest(adminMessageIdParamsSchema, "params"),
    validateRequest(adminSuspendBodySchema, "body"),
    controller.restoreMessage
  );

  // Audit
  router.get(
    "/audit",
    validateRequest(adminListAuditQuerySchema, "query"),
    controller.listAudit
  );

  // Reports
  router.get(
    "/reports",
    validateRequest(adminListReportsQuerySchema, "query"),
    controller.listReports
  );
  router.post(
    "/reports",
    validateRequest(adminCreateReportBodySchema, "body"),
    controller.createReport
  );
  router.patch(
    "/reports/:id/review",
    validateRequest(adminReportIdParamsSchema, "params"),
    validateRequest(adminSuspendBodySchema, "body"),
    controller.reviewReport
  );
  router.patch(
    "/reports/:id/resolve",
    validateRequest(adminReportIdParamsSchema, "params"),
    validateRequest(adminResolveReportBodySchema, "body"),
    controller.resolveReport
  );
  router.patch(
    "/reports/:id/dismiss",
    validateRequest(adminReportIdParamsSchema, "params"),
    validateRequest(adminDismissReportBodySchema, "body"),
    controller.dismissReport
  );

  return router;
}
