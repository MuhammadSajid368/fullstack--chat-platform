import { Router, type RequestHandler } from "express";
import { validateRequest } from "@middleware/validate.js";
import type { PresenceController } from "@modules/presence/controller/PresenceController.js";
import {
  presenceUserIdParamsSchema,
  updatePresencePrivacyBodySchema,
  updatePresenceStatusBodySchema,
} from "@modules/presence/validators/PresenceValidators.js";

/**
 * Presence routes under `/presence`.
 *
 * GET  /              — current user's presence
 * GET  /:userId       — another user's presence (privacy-filtered)
 * POST /status        — set preferred status
 * POST /privacy       — set privacy
 */
export function createPresenceRoutes(
  controller: PresenceController,
  authenticate: RequestHandler
): Router {
  const router = Router();
  router.use(authenticate);

  router.get("/", controller.getMine);

  router.post(
    "/status",
    validateRequest(updatePresenceStatusBodySchema, "body"),
    controller.updateStatus
  );

  router.post(
    "/privacy",
    validateRequest(updatePresencePrivacyBodySchema, "body"),
    controller.updatePrivacy
  );

  router.get(
    "/:userId",
    validateRequest(presenceUserIdParamsSchema, "params"),
    controller.getByUserId
  );

  return router;
}
