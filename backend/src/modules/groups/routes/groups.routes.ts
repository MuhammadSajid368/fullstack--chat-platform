import { Router, type RequestHandler } from "express";
import { validateRequest } from "@middleware/validate.js";
import type { GroupController } from "@modules/groups/controller/GroupController.js";
import {
  addMembersBodySchema,
  changeMemberRoleBodySchema,
  createGroupBodySchema,
  groupIdParamsSchema,
  groupMemberParamsSchema,
  transferOwnershipBodySchema,
  updateGroupBodySchema,
} from "@modules/groups/validators/GroupValidators.js";

/**
 * Group routes under `/groups`.
 */
export function createGroupRoutes(
  controller: GroupController,
  authenticate: RequestHandler
): Router {
  const router = Router();
  router.use(authenticate);

  router.post(
    "/",
    validateRequest(createGroupBodySchema, "body"),
    controller.create
  );

  router.get(
    "/:groupId",
    validateRequest(groupIdParamsSchema, "params"),
    controller.getById
  );

  router.patch(
    "/:groupId",
    validateRequest(groupIdParamsSchema, "params"),
    validateRequest(updateGroupBodySchema, "body"),
    controller.update
  );

  router.delete(
    "/:groupId",
    validateRequest(groupIdParamsSchema, "params"),
    controller.remove
  );

  router.post(
    "/:groupId/members",
    validateRequest(groupIdParamsSchema, "params"),
    validateRequest(addMembersBodySchema, "body"),
    controller.addMembers
  );

  router.delete(
    "/:groupId/members/:userId",
    validateRequest(groupMemberParamsSchema, "params"),
    controller.removeMember
  );

  router.patch(
    "/:groupId/members/:userId/role",
    validateRequest(groupMemberParamsSchema, "params"),
    validateRequest(changeMemberRoleBodySchema, "body"),
    controller.changeMemberRole
  );

  router.post(
    "/:groupId/leave",
    validateRequest(groupIdParamsSchema, "params"),
    controller.leave
  );

  router.post(
    "/:groupId/transfer-ownership",
    validateRequest(groupIdParamsSchema, "params"),
    validateRequest(transferOwnershipBodySchema, "body"),
    controller.transferOwnership
  );

  return router;
}
