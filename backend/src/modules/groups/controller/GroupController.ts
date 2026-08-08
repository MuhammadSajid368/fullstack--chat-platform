import type { Request, Response } from "express";
import type { Logger } from "pino";
import { UnauthorizedError } from "@common/errors/index.js";
import { asyncHandler } from "@common/utils/asyncHandler.js";
import type { IGroupService } from "@modules/groups/interfaces/IGroupService.js";
import type {
  AddMembersBody,
  ChangeMemberRoleBody,
  CreateGroupBody,
  GroupIdParams,
  GroupMemberParams,
  TransferOwnershipBody,
  UpdateGroupBody,
} from "@modules/groups/validators/GroupValidators.js";

/**
 * Group HTTP adapter — HTTP only.
 */
export class GroupController {
  constructor(
    protected readonly groupsService: IGroupService,
    protected readonly logger: Logger
  ) {}

  create = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const body = req.body as CreateGroupBody;

    this.log(req).info(
      { requestId: req.requestId, userId: user.id },
      "Group create"
    );

    const group = await this.groupsService.createGroup(
      user.id,
      {
        name: body.name,
        description: body.description,
        avatarUrl: body.avatarUrl ?? null,
        memberUserIds: body.memberUserIds,
      },
      this.clientContext(req)
    );

    res.status(201).json(group);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const { groupId } = req.params as GroupIdParams;
    const group = await this.groupsService.getGroup(user.id, groupId);
    res.status(200).json(group);
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const { groupId } = req.params as GroupIdParams;
    const body = req.body as UpdateGroupBody;

    const group = await this.groupsService.updateGroup(
      user.id,
      groupId,
      {
        name: body.name,
        description: body.description,
        avatarUrl: body.avatarUrl,
      },
      this.clientContext(req)
    );

    res.status(200).json(group);
  });

  remove = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const { groupId } = req.params as GroupIdParams;

    await this.groupsService.deleteGroup(
      user.id,
      groupId,
      this.clientContext(req)
    );

    res.status(204).send();
  });

  addMembers = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const { groupId } = req.params as GroupIdParams;
    const body = req.body as AddMembersBody;

    const group = await this.groupsService.addMembers(
      user.id,
      groupId,
      { memberUserIds: body.memberUserIds },
      this.clientContext(req)
    );

    res.status(200).json(group);
  });

  removeMember = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const { groupId, userId } = req.params as GroupMemberParams;

    const group = await this.groupsService.removeMember(
      user.id,
      groupId,
      userId,
      this.clientContext(req)
    );

    res.status(200).json(group);
  });

  changeMemberRole = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const { groupId, userId } = req.params as GroupMemberParams;
    const body = req.body as ChangeMemberRoleBody;

    const group = await this.groupsService.changeMemberRole(
      user.id,
      groupId,
      userId,
      { role: body.role },
      this.clientContext(req)
    );

    res.status(200).json(group);
  });

  leave = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const { groupId } = req.params as GroupIdParams;

    await this.groupsService.leaveGroup(
      user.id,
      groupId,
      this.clientContext(req)
    );

    res.status(204).send();
  });

  transferOwnership = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const { groupId } = req.params as GroupIdParams;
    const body = req.body as TransferOwnershipBody;

    const group = await this.groupsService.transferOwnership(
      user.id,
      groupId,
      {
        newOwnerUserId: body.newOwnerUserId ?? body.toUserId!,
      },
      this.clientContext(req)
    );

    res.status(200).json(group);
  });

  private requireUser(req: Request) {
    if (!req.user) {
      throw new UnauthorizedError("Authentication required");
    }
    return req.user;
  }

  private clientContext(req: Request) {
    return {
      ipAddress: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
      requestId: req.requestId,
    };
  }

  private log(req: Request): Logger {
    return req.log ?? this.logger;
  }
}
