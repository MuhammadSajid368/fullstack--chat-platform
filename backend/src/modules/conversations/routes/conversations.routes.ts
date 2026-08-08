import { Router, type RequestHandler } from "express";
import { validateRequest } from "@middleware/validate.js";
import type { ConversationController } from "@modules/conversations/controller/ConversationController.js";
import {
  conversationIdParamsSchema,
  muteConversationBodySchema,
} from "@modules/conversations/validators/ConversationValidators.js";

/**
 * Conversation routes — inbox, get, mute, mark-read.
 */
export function createConversationRoutes(
  controller: ConversationController,
  authenticate: RequestHandler
): Router {
  const router = Router();

  router.use(authenticate);

  router.get("/", controller.list);

  router.get(
    "/:conversationId",
    validateRequest(conversationIdParamsSchema, "params"),
    controller.getById
  );

  router.patch(
    "/:conversationId/mute",
    validateRequest(conversationIdParamsSchema, "params"),
    validateRequest(muteConversationBodySchema, "body"),
    controller.mute
  );

  router.post(
    "/:conversationId/read",
    validateRequest(conversationIdParamsSchema, "params"),
    controller.markRead
  );

  return router;
}
