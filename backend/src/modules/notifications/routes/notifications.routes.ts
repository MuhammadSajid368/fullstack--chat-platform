import { Router, type RequestHandler } from "express";
import { validateRequest } from "@middleware/validate.js";
import type { NotificationController } from "@modules/notifications/controller/NotificationController.js";
import {
  listNotificationsQuerySchema,
  notificationIdParamsSchema,
} from "@modules/notifications/validators/NotificationValidators.js";

/**
 * Notification routes under `/notifications`.
 */
export function createNotificationRoutes(
  controller: NotificationController,
  authenticate: RequestHandler
): Router {
  const router = Router();
  router.use(authenticate);

  router.get(
    "/",
    validateRequest(listNotificationsQuerySchema, "query"),
    controller.list
  );

  router.get("/unread-count", controller.unreadCount);

  router.patch("/read-all", controller.markAllRead);

  router.patch(
    "/:notificationId/read",
    validateRequest(notificationIdParamsSchema, "params"),
    controller.markRead
  );

  router.delete(
    "/:notificationId",
    validateRequest(notificationIdParamsSchema, "params"),
    controller.softDelete
  );

  return router;
}
