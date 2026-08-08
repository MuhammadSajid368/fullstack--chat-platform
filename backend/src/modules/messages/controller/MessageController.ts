import type { Request, Response } from "express";
import type { Logger } from "pino";
import { UnauthorizedError } from "@common/errors/index.js";
import { asyncHandler } from "@common/utils/asyncHandler.js";
import type { IMessageService } from "@modules/messages/interfaces/IMessageService.js";
import type {
  ListMessagesQuery,
  SendDirectBody,
  SendMessageBody,
} from "@modules/messages/validators/MessageValidators.js";

/**
 * Message HTTP adapter — HTTP only.
 */
export class MessageController {
  constructor(
    protected readonly messagesService: IMessageService,
    protected readonly logger: Logger
  ) {}

  list = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const { conversationId } = req.params as { conversationId: string };
    const query = req.query as unknown as ListMessagesQuery;

    this.log(req).info(
      { requestId: req.requestId, userId: user.id, conversationId },
      "Messages list"
    );

    const page = await this.messagesService.listMessages(
      user.id,
      conversationId,
      { cursor: query.cursor, limit: query.limit }
    );
    res.status(200).json(page);
  });

  send = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const { conversationId } = req.params as { conversationId: string };
    const body = req.body as SendMessageBody;

    const result = await this.messagesService.send(
      user.id,
      conversationId,
      {
        type: body.type,
        content: body.content,
        replyToMessageId: body.replyToMessageId,
        clientMessageId: body.clientMessageId,
        attachmentIds: body.attachmentIds,
        linkPreview: body.linkPreview,
        metadata: body.metadata ?? null,
      },
      this.clientContext(req)
    );

    res.status(result.created ? 201 : 200).json(result.message);
  });

  sendDirect = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const body = req.body as SendDirectBody;

    const result = await this.messagesService.sendDirect(
      user.id,
      {
        peerUserId: body.peerUserId,
        type: body.type,
        content: body.content,
        replyToMessageId: body.replyToMessageId,
        clientMessageId: body.clientMessageId,
        attachmentIds: body.attachmentIds,
        linkPreview: body.linkPreview,
        metadata: body.metadata ?? null,
      },
      this.clientContext(req)
    );

    res.status(result.created ? 201 : 200).json({
      conversationId: result.conversationId,
      message: result.message,
    });
  });

  retry = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const { messageId } = req.params as { messageId: string };
    const message = await this.messagesService.retry(
      user.id,
      messageId,
      this.clientContext(req)
    );
    res.status(200).json(message);
  });

  softDelete = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const { messageId } = req.params as { messageId: string };
    const message = await this.messagesService.softDelete(
      user.id,
      messageId,
      this.clientContext(req)
    );
    res.status(200).json(message);
  });

  star = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const { messageId } = req.params as { messageId: string };
    const message = await this.messagesService.star(
      user.id,
      messageId,
      this.clientContext(req)
    );
    res.status(200).json(message);
  });

  unstar = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const { messageId } = req.params as { messageId: string };
    const message = await this.messagesService.unstar(
      user.id,
      messageId,
      this.clientContext(req)
    );
    res.status(200).json(message);
  });

  pin = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const { messageId } = req.params as { messageId: string };
    const message = await this.messagesService.pin(
      user.id,
      messageId,
      this.clientContext(req)
    );
    res.status(200).json(message);
  });

  unpin = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const { messageId } = req.params as { messageId: string };
    const message = await this.messagesService.unpin(
      user.id,
      messageId,
      this.clientContext(req)
    );
    res.status(200).json(message);
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
