import type { Request, Response } from "express";
import type { Logger } from "pino";
import { UnauthorizedError } from "@common/errors/index.js";
import { asyncHandler } from "@common/utils/asyncHandler.js";
import type { IUploadService } from "@modules/uploads/interfaces/IUploadService.js";
import type {
  AttachmentIdParams,
  CompleteUploadBody,
  CreateUploadBody,
  FailUploadBody,
} from "@modules/uploads/validators/UploadValidators.js";

/**
 * Upload HTTP adapter — HTTP only.
 */
export class UploadController {
  constructor(
    protected readonly uploadsService: IUploadService,
    protected readonly logger: Logger
  ) {}

  create = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const body = req.body as CreateUploadBody;

    this.log(req).info(
      { requestId: req.requestId, userId: user.id, type: body.type },
      "Upload create"
    );

    const attachment = await this.uploadsService.create(
      user.id,
      {
        type: body.type,
        mimeType: body.mimeType,
        fileName: body.fileName,
        byteSize: body.byteSize,
        checksum: body.checksum,
        conversationId: body.conversationId,
        width: body.width,
        height: body.height,
        durationMs: body.durationMs,
      },
      this.clientContext(req)
    );

    res.status(201).json(attachment);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const { attachmentId } = req.params as AttachmentIdParams;
    const attachment = await this.uploadsService.getById(user.id, attachmentId);
    res.status(200).json(attachment);
  });

  complete = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const { attachmentId } = req.params as AttachmentIdParams;
    const body = req.body as CompleteUploadBody;

    const attachment = await this.uploadsService.complete(
      user.id,
      attachmentId,
      {
        checksum: body.checksum,
        byteSize: body.byteSize,
        width: body.width,
        height: body.height,
        durationMs: body.durationMs,
      },
      this.clientContext(req)
    );

    res.status(200).json(attachment);
  });

  fail = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const { attachmentId } = req.params as AttachmentIdParams;
    const body = (req.body ?? {}) as FailUploadBody;

    const attachment = await this.uploadsService.fail(
      user.id,
      attachmentId,
      { reason: body.reason },
      this.clientContext(req)
    );

    res.status(200).json(attachment);
  });

  softDelete = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const { attachmentId } = req.params as AttachmentIdParams;

    const attachment = await this.uploadsService.softDelete(
      user.id,
      attachmentId,
      this.clientContext(req)
    );

    res.status(200).json(attachment);
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
