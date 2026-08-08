import { Router, type RequestHandler } from "express";
import { validateRequest } from "@middleware/validate.js";
import type { SearchController } from "@modules/search/controller/SearchController.js";
import {
  searchDirectoryQuerySchema,
  searchMessagesQuerySchema,
} from "@modules/search/validators/SearchValidators.js";

/**
 * Search routes under `/search`.
 */
export function createSearchRoutes(
  controller: SearchController,
  authenticate: RequestHandler
): Router {
  const router = Router();
  router.use(authenticate);

  router.get(
    "/messages",
    validateRequest(searchMessagesQuerySchema, "query"),
    controller.searchMessages
  );
  router.get(
    "/users",
    validateRequest(searchDirectoryQuerySchema, "query"),
    controller.searchUsers
  );
  router.get(
    "/groups",
    validateRequest(searchDirectoryQuerySchema, "query"),
    controller.searchGroups
  );
  router.get(
    "/conversations",
    validateRequest(searchDirectoryQuerySchema, "query"),
    controller.searchConversations
  );

  return router;
}
