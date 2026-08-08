import type { Request, Response } from "express";
import type { Logger } from "pino";
import { UnauthorizedError } from "@common/errors/index.js";
import { asyncHandler } from "@common/utils/asyncHandler.js";
import type { IPresenceService } from "@modules/presence/interfaces/IPresenceService.js";
import type {
  PresenceUserIdParams,
  UpdatePresencePrivacyBody,
  UpdatePresenceStatusBody,
} from "@modules/presence/validators/PresenceValidators.js";

/**
 * Presence HTTP adapter — no Prisma / business rules.
 */
export class PresenceController {
  constructor(
    protected readonly presenceService: IPresenceService,
    protected readonly logger: Logger
  ) {}

  getMine = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const dto = await this.presenceService.getMyPresence(user.id);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(dto);
  });

  getByUserId = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const { userId } = req.params as PresenceUserIdParams;
    const dto = await this.presenceService.getPresenceForViewer(
      user.id,
      userId
    );
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(dto);
  });

  updateStatus = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const body = req.body as UpdatePresenceStatusBody;
    const dto = await this.presenceService.setStatus(
      user.id,
      body.status,
      this.clientContext(req)
    );
    res.status(200).json(dto);
  });

  updatePrivacy = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const body = req.body as UpdatePresencePrivacyBody;
    const dto = await this.presenceService.setPrivacy(
      user.id,
      body.privacy,
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
