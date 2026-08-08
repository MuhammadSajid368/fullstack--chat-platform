import { Router, type RequestHandler } from "express";
import { validateRequest } from "@middleware/validate.js";
import type { UploadController } from "@modules/uploads/controller/UploadController.js";
import {
  attachmentIdParamsSchema,
  completeUploadBodySchema,
  createUploadBodySchema,
  failUploadBodySchema,
} from "@modules/uploads/validators/UploadValidators.js";

/**
 * Upload routes under `/uploads`.
 */
export function createUploadRoutes(
  controller: UploadController,
  authenticate: RequestHandler
): Router {
  const router = Router();
  router.use(authenticate);

  router.post(
    "/",
    validateRequest(createUploadBodySchema, "body"),
    controller.create
  );

  router.get(
    "/:attachmentId",
    validateRequest(attachmentIdParamsSchema, "params"),
    controller.getById
  );

  router.delete(
    "/:attachmentId",
    validateRequest(attachmentIdParamsSchema, "params"),
    controller.softDelete
  );

  router.post(
    "/:attachmentId/complete",
    validateRequest(attachmentIdParamsSchema, "params"),
    validateRequest(completeUploadBodySchema, "body"),
    controller.complete
  );

  router.post(
    "/:attachmentId/fail",
    validateRequest(attachmentIdParamsSchema, "params"),
    validateRequest(failUploadBodySchema, "body"),
    controller.fail
  );

  return router;
}
