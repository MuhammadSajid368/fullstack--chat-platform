import { Router, type RequestHandler } from "express";
import { validateRequest } from "@middleware/validate.js";
import type { MessageController } from "@modules/messages/controller/MessageController.js";
import {
  conversationIdParamsSchema,
  listMessagesQuerySchema,
  messageIdParamsSchema,
  sendDirectBodySchema,
  sendMessageBodySchema,
} from "@modules/messages/validators/MessageValidators.js";

/**
 * Nested under `/conversations` — list + send messages.
 */
export function createConversationMessageRoutes(
  controller: MessageController,
  authenticate: RequestHandler
): Router {
  const router = Router({ mergeParams: true });
  router.use(authenticate);

  router.get(
    "/:conversationId/messages",
    validateRequest(conversationIdParamsSchema, "params"),
    validateRequest(listMessagesQuerySchema, "query"),
    controller.list
  );

  router.post(
    "/:conversationId/messages",
    validateRequest(conversationIdParamsSchema, "params"),
    validateRequest(sendMessageBodySchema, "body"),
    controller.send
  );

  return router;
}

/**
 * Message action routes under `/messages`.
 * Includes lazy DIRECT send for Messages-owned conversation creation.
 */
export function createMessageRoutes(
  controller: MessageController,
  authenticate: RequestHandler
): Router {
  const router = Router();
  router.use(authenticate);

  router.post(
    "/direct",
    validateRequest(sendDirectBodySchema, "body"),
    controller.sendDirect
  );

  router.post(
    "/:messageId/retry",
    validateRequest(messageIdParamsSchema, "params"),
    controller.retry
  );

  router.delete(
    "/:messageId",
    validateRequest(messageIdParamsSchema, "params"),
    controller.softDelete
  );

  router.post(
    "/:messageId/star",
    validateRequest(messageIdParamsSchema, "params"),
    controller.star
  );

  router.delete(
    "/:messageId/star",
    validateRequest(messageIdParamsSchema, "params"),
    controller.unstar
  );

  router.post(
    "/:messageId/pin",
    validateRequest(messageIdParamsSchema, "params"),
    controller.pin
  );

  router.delete(
    "/:messageId/pin",
    validateRequest(messageIdParamsSchema, "params"),
    controller.unpin
  );

  return router;
}
