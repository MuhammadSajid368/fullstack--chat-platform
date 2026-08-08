import { Router, type RequestHandler } from "express";
import { validateRequest } from "@middleware/validate.js";
import type { UserController } from "@modules/users/controller/UserController.js";
import {
  listUsersQuerySchema,
  searchUsersQuerySchema,
  updateMyProfileBodySchema,
  userIdParamsSchema,
} from "@modules/users/validators/UserValidators.js";

/**
 * User routes — authenticated profile list/search/update.
 * `/search` and `/me` are registered before `/:id`.
 */
export function createUserRoutes(
  controller: UserController,
  authenticate: RequestHandler
): Router {
  const router = Router();

  router.use(authenticate);

  router.get(
    "/",
    validateRequest(listUsersQuerySchema, "query"),
    controller.list
  );

  router.get(
    "/search",
    validateRequest(searchUsersQuerySchema, "query"),
    controller.search
  );

  router.patch(
    "/me",
    validateRequest(updateMyProfileBodySchema, "body"),
    controller.updateMe
  );

  router.get(
    "/:id",
    validateRequest(userIdParamsSchema, "params"),
    controller.getById
  );

  return router;
}
