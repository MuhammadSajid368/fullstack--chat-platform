import type { Request, Response } from "express";
import type { Logger } from "pino";
import { ForbiddenError, UnauthorizedError } from "@common/errors/index.js";
import { asyncHandler } from "@common/utils/asyncHandler.js";
import type { AdminActor } from "@modules/admin/dto/AdminDto.js";
import type { IAdminService } from "@modules/admin/interfaces/IAdminService.js";
import type {
  AdminChangeMemberRoleBody,
  AdminCreateReportBody,
  AdminDismissReportBody,
  AdminGroupMemberParams,
  AdminListAuditQuery,
  AdminListConversationsQuery,
  AdminListGroupsQuery,
  AdminListMessagesQuery,
  AdminListReportsQuery,
  AdminListUsersQuery,
  AdminResolveReportBody,
  AdminSuspendBody,
  AdminTransferOwnershipBody,
} from "@modules/admin/validators/AdminValidators.js";

/**
 * Admin HTTP adapter — no Prisma / business rules.
 */
export class AdminController {
  constructor(
    protected readonly adminService: IAdminService,
    protected readonly logger: Logger
  ) {}

  listUsers = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const query = req.query as unknown as AdminListUsersQuery;
    const page = await this.adminService.listUsers(actor, {
      q: query.q,
      includeDeleted: query.includeDeleted,
      cursor: query.cursor,
      limit: query.limit,
    });
    res.status(200).json(page);
  });

  getUser = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const dto = await this.adminService.getUser(actor, String(req.params.id));
    res.status(200).json(dto);
  });

  suspendUser = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const body = (req.body ?? {}) as AdminSuspendBody;
    const dto = await this.adminService.suspendUser(
      actor,
      String(req.params.id),
      { reason: body.reason },
      this.clientContext(req)
    );
    res.status(200).json(dto);
  });

  unsuspendUser = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const body = (req.body ?? {}) as AdminSuspendBody;
    const dto = await this.adminService.unsuspendUser(
      actor,
      String(req.params.id),
      { reason: body.reason },
      this.clientContext(req)
    );
    res.status(200).json(dto);
  });

  softDeleteUser = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const body = (req.body ?? {}) as AdminSuspendBody;
    const dto = await this.adminService.softDeleteUser(
      actor,
      String(req.params.id),
      { reason: body.reason },
      this.clientContext(req)
    );
    res.status(200).json(dto);
  });

  restoreUser = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const body = (req.body ?? {}) as AdminSuspendBody;
    const dto = await this.adminService.restoreUser(
      actor,
      String(req.params.id),
      { reason: body.reason },
      this.clientContext(req)
    );
    res.status(200).json(dto);
  });

  forceLogoutAll = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const body = (req.body ?? {}) as AdminSuspendBody;
    const dto = await this.adminService.forceLogoutAll(
      actor,
      String(req.params.id),
      { reason: body.reason },
      this.clientContext(req)
    );
    res.status(200).json(dto);
  });

  listConversations = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const query = req.query as unknown as AdminListConversationsQuery;
    const page = await this.adminService.listConversations(actor, {
      q: query.q,
      type: query.type,
      includeDeleted: query.includeDeleted,
      cursor: query.cursor,
      limit: query.limit,
    });
    res.status(200).json(page);
  });

  softDeleteConversation = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const body = (req.body ?? {}) as AdminSuspendBody;
    const dto = await this.adminService.softDeleteConversation(
      actor,
      String(req.params.id),
      { reason: body.reason },
      this.clientContext(req)
    );
    res.status(200).json(dto);
  });

  restoreConversation = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const body = (req.body ?? {}) as AdminSuspendBody;
    const dto = await this.adminService.restoreConversation(
      actor,
      String(req.params.id),
      { reason: body.reason },
      this.clientContext(req)
    );
    res.status(200).json(dto);
  });

  archiveConversation = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const body = (req.body ?? {}) as AdminSuspendBody;
    const dto = await this.adminService.archiveConversation(
      actor,
      String(req.params.id),
      { reason: body.reason },
      this.clientContext(req)
    );
    res.status(200).json(dto);
  });

  listConversationMembers = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const members = await this.adminService.listConversationMembers(
      actor,
      String(req.params.id)
    );
    res.status(200).json({ results: members });
  });

  listGroups = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const query = req.query as unknown as AdminListGroupsQuery;
    const page = await this.adminService.listGroups(actor, {
      q: query.q,
      includeDeleted: query.includeDeleted,
      cursor: query.cursor,
      limit: query.limit,
    });
    res.status(200).json(page);
  });

  softDeleteGroup = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const body = (req.body ?? {}) as AdminSuspendBody;
    const dto = await this.adminService.softDeleteGroup(
      actor,
      String(req.params.id),
      { reason: body.reason },
      this.clientContext(req)
    );
    res.status(200).json(dto);
  });

  restoreGroup = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const body = (req.body ?? {}) as AdminSuspendBody;
    const dto = await this.adminService.restoreGroup(
      actor,
      String(req.params.id),
      { reason: body.reason },
      this.clientContext(req)
    );
    res.status(200).json(dto);
  });

  transferGroupOwnership = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const body = req.body as AdminTransferOwnershipBody;
    const dto = await this.adminService.transferGroupOwnership(
      actor,
      String(req.params.id),
      body.newOwnerId,
      { reason: body.reason },
      this.clientContext(req)
    );
    res.status(200).json(dto);
  });

  removeGroupMember = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const params = req.params as unknown as AdminGroupMemberParams;
    const body = (req.body ?? {}) as AdminSuspendBody;
    const dto = await this.adminService.removeGroupMember(
      actor,
      params.id,
      params.userId,
      { reason: body.reason },
      this.clientContext(req)
    );
    res.status(200).json(dto);
  });

  changeGroupMemberRole = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const params = req.params as unknown as AdminGroupMemberParams;
    const body = req.body as AdminChangeMemberRoleBody;
    const dto = await this.adminService.changeGroupMemberRole(
      actor,
      params.id,
      params.userId,
      body.role,
      { reason: body.reason },
      this.clientContext(req)
    );
    res.status(200).json(dto);
  });

  listMessages = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const query = req.query as unknown as AdminListMessagesQuery;
    const page = await this.adminService.listMessages(actor, {
      q: query.q,
      conversationId: query.conversationId,
      senderId: query.senderId,
      includeDeleted: query.includeDeleted,
      cursor: query.cursor,
      limit: query.limit,
    });
    res.status(200).json(page);
  });

  softDeleteMessage = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const body = (req.body ?? {}) as AdminSuspendBody;
    const dto = await this.adminService.softDeleteMessage(
      actor,
      String(req.params.id),
      { reason: body.reason },
      this.clientContext(req)
    );
    res.status(200).json(dto);
  });

  restoreMessage = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const body = (req.body ?? {}) as AdminSuspendBody;
    const dto = await this.adminService.restoreMessage(
      actor,
      String(req.params.id),
      { reason: body.reason },
      this.clientContext(req)
    );
    res.status(200).json(dto);
  });

  listMessageAudit = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const page = await this.adminService.listMessageAudit(
      actor,
      String(req.params.id)
    );
    res.status(200).json(page);
  });

  listAudit = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const query = req.query as unknown as AdminListAuditQuery;
    const page = await this.adminService.listAudit(actor, {
      actorId: query.actorId,
      entityType: query.entityType,
      entityId: query.entityId,
      action: query.action,
      cursor: query.cursor,
      limit: query.limit,
    });
    res.status(200).json(page);
  });

  createReport = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const body = req.body as AdminCreateReportBody;
    const dto = await this.adminService.createReport(
      actor,
      {
        targetType: body.targetType,
        targetId: body.targetId,
        reason: body.reason,
        details: body.details,
      },
      this.clientContext(req)
    );
    res.status(201).json(dto);
  });

  listReports = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const query = req.query as unknown as AdminListReportsQuery;
    const page = await this.adminService.listReports(actor, {
      status: query.status,
      cursor: query.cursor,
      limit: query.limit,
    });
    res.status(200).json(page);
  });

  reviewReport = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const body = (req.body ?? {}) as AdminSuspendBody;
    const dto = await this.adminService.reviewReport(
      actor,
      String(req.params.id),
      { reason: body.reason },
      this.clientContext(req)
    );
    res.status(200).json(dto);
  });

  resolveReport = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const body = req.body as AdminResolveReportBody;
    const dto = await this.adminService.resolveReport(
      actor,
      String(req.params.id),
      { resolution: body.resolution, reason: body.reason },
      this.clientContext(req)
    );
    res.status(200).json(dto);
  });

  dismissReport = asyncHandler(async (req: Request, res: Response) => {
    const actor = this.requireAdmin(req);
    const body = (req.body ?? {}) as AdminDismissReportBody;
    const dto = await this.adminService.dismissReport(
      actor,
      String(req.params.id),
      { resolution: body.resolution, reason: body.reason },
      this.clientContext(req)
    );
    res.status(200).json(dto);
  });

  private requireAdmin(req: Request): AdminActor {
    if (!req.user) {
      throw new UnauthorizedError("Authentication required");
    }
    if (!req.admin) {
      throw new ForbiddenError("Admin access required");
    }
    return req.admin;
  }

  private clientContext(req: Request) {
    return {
      ipAddress: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
      requestId: req.requestId,
    };
  }
}
