import type { Request, Response } from "express";
import type { Logger } from "pino";
import { UnauthorizedError } from "@common/errors/index.js";
import { asyncHandler } from "@common/utils/asyncHandler.js";
import type { INotificationService } from "@modules/notifications/interfaces/INotificationService.js";
import type {
  ListNotificationsQuery,
  NotificationIdParams,
} from "@modules/notifications/validators/NotificationValidators.js";

/**
 * Notification HTTP adapter — no Prisma / business rules.
 */
export class NotificationController {
  constructor(
    protected readonly notificationsService: INotificationService,
    protected readonly logger: Logger
  ) {}

  list = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const query = req.query as unknown as ListNotificationsQuery;
    const page = await this.notificationsService.list(user.id, {
      cursor: query.cursor,
      limit: query.limit,
    });
    res.status(200).json(page);
  });

  unreadCount = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const result = await this.notificationsService.unreadCount(user.id);
    res.status(200).json(result);
  });

  markRead = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const { notificationId } = req.params as NotificationIdParams;
    const dto = await this.notificationsService.markRead(
      user.id,
      notificationId,
      this.clientContext(req)
    );
    res.status(200).json(dto);
  });

  markAllRead = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const result = await this.notificationsService.markAllRead(
      user.id,
      this.clientContext(req)
    );
    res.status(200).json(result);
  });

  softDelete = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const { notificationId } = req.params as NotificationIdParams;
    const dto = await this.notificationsService.softDelete(
      user.id,
      notificationId,
      this.clientContext(req)
    );
    res.status(200).json(dto);
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
}
