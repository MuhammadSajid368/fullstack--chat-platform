import type { Request, Response } from "express";
import type { Logger } from "pino";
import { UnauthorizedError } from "@common/errors/index.js";
import { asyncHandler } from "@common/utils/asyncHandler.js";
import type { IConversationService } from "@modules/conversations/interfaces/IConversationService.js";
import type {
  ConversationIdParams,
  MuteConversationBody,
} from "@modules/conversations/validators/ConversationValidators.js";

/**
 * Conversation HTTP adapter — Request/Response only.
 */
export class ConversationController {
  constructor(
    protected readonly conversationsService: IConversationService,
    protected readonly logger: Logger
  ) {}

  list = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);

    this.log(req).info(
      { requestId: req.requestId, userId: user.id },
      "Conversations list"
    );

    const result = await this.conversationsService.listInbox(user.id);
    res.status(200).json(result);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const { conversationId } = req.params as ConversationIdParams;

    const conversation = await this.conversationsService.getConversation(
      user.id,
      conversationId
    );

    res.status(200).json(conversation);
  });

  mute = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const { conversationId } = req.params as ConversationIdParams;
    const body = req.body as MuteConversationBody;

    this.log(req).info(
      {
        requestId: req.requestId,
        userId: user.id,
        conversationId,
        muted: body.muted,
      },
      "Conversation mute"
    );

    const conversation = await this.conversationsService.muteConversation(
      user.id,
      conversationId,
      { muted: body.muted },
      this.clientContext(req)
    );

    res.status(200).json(conversation);
  });

  markRead = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const { conversationId } = req.params as ConversationIdParams;

    this.log(req).info(
      { requestId: req.requestId, userId: user.id, conversationId },
      "Conversation mark read"
    );

    await this.conversationsService.markRead(
      user.id,
      conversationId,
      this.clientContext(req)
    );

    res.status(204).send();
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

  private log(req: Request): Logger {
    return req.log ?? this.logger;
  }
}
