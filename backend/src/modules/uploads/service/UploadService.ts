import { AuditAction } from "@prisma/client";
import type { Logger } from "pino";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@common/errors/index.js";
import type {
  ApiUploadType,
  AttachmentSafeDto,
  CompleteUploadInput,
  CreateUploadInput,
  FailUploadInput,
  UploadClientContext,
} from "@modules/uploads/dto/UploadDto.js";
import type {
  AttachmentRecord,
  IUploadRepository,
} from "@modules/uploads/interfaces/IUploadRepository.js";
import type { IUploadService } from "@modules/uploads/interfaces/IUploadService.js";
import { UploadMapper } from "@modules/uploads/mapper/UploadMapper.js";
import { buildStorageKey } from "@modules/uploads/repository/UploadRepository.js";
import {
  MAX_DOCUMENT_BYTES,
  MAX_IMAGE_BYTES,
  MAX_STICKER_BYTES,
  MAX_VIDEO_BYTES,
  MAX_VOICE_BYTES,
} from "@modules/uploads/validators/UploadValidators.js";
import { RealtimeEvents, userRoom } from "@websocket/events.js";
import {
  NoOpEventPublisher,
  type IEventPublisher,
} from "@websocket/EventPublisher.js";

/**
 * Upload service — authz, validation, state transitions.
 * Does not touch messages, conversations unread, or object storage.
 */
export class UploadService implements IUploadService {
  constructor(
    protected readonly repository: IUploadRepository,
    protected readonly logger: Logger,
    protected readonly events: IEventPublisher = new NoOpEventPublisher()
  ) {}

  async create(
    userId: string,
    input: CreateUploadInput,
    context: UploadClientContext
  ): Promise<AttachmentSafeDto> {
    await this.requireActiveUser(userId);
    this.assertCreatePayload(input);

    if (input.conversationId) {
      const isMember = await this.repository.isActiveConversationMember(
        userId,
        input.conversationId
      );
      if (!isMember) {
        throw new ForbiddenError("Not a conversation member");
      }
    }

    const created = await this.repository.createPending({
      data: {
        uploaderId: userId,
        uploadType: input.type,
        mimeType: input.mimeType.toLowerCase(),
        fileName: input.fileName.trim(),
        byteSize: BigInt(input.byteSize),
        checksum: input.checksum ?? null,
        conversationId: input.conversationId ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        durationMs: input.durationMs ?? null,
        storageKey: buildStorageKey(input.type),
      },
      audit: {
        actorId: userId,
        action: AuditAction.ATTACHMENT_CREATE,
        entityType: "Attachment",
        metadata: {
          requestId: context.requestId,
          type: input.type,
          mimeType: input.mimeType,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    this.logger.info(
      {
        requestId: context.requestId,
        userId,
        attachmentId: created.id,
        type: input.type,
      },
      "Upload created"
    );

    return UploadMapper.toSafeDto(created);
  }

  async getById(
    userId: string,
    attachmentId: string
  ): Promise<AttachmentSafeDto> {
    await this.requireActiveUser(userId);
    const attachment = await this.requireOwnedAttachment(userId, attachmentId);
    return UploadMapper.toSafeDto(attachment);
  }

  async complete(
    userId: string,
    attachmentId: string,
    input: CompleteUploadInput,
    context: UploadClientContext
  ): Promise<AttachmentSafeDto> {
    await this.requireActiveUser(userId);
    const attachment = await this.requireOwnedAttachment(userId, attachmentId);
    this.assertTransition(attachment, "complete");

    const type = attachment.uploadType ?? "document";
    const next = this.mergeCompleteFields(attachment, input);
    this.assertCompletePayload(type, next);

    const updated = await this.repository.completeUpload({
      attachmentId,
      uploaderId: userId,
      data: {
        checksum: next.checksum,
        byteSize: next.byteSize,
        width: next.width,
        height: next.height,
        durationMs: next.durationMs,
      },
      audit: {
        actorId: userId,
        action: AuditAction.OTHER,
        entityType: "Attachment",
        entityId: attachmentId,
        metadata: { requestId: context.requestId },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    if (!updated) {
      throw new ConflictError("Upload cannot be completed in its current state");
    }

    const dto = UploadMapper.toSafeDto(updated);
    this.events.publish({
      name: RealtimeEvents.UPLOAD_COMPLETED,
      rooms: [userRoom(userId)],
      payload: {
        attachmentId,
        attachment: dto,
      },
    });
    return dto;
  }

  async fail(
    userId: string,
    attachmentId: string,
    input: FailUploadInput,
    context: UploadClientContext
  ): Promise<AttachmentSafeDto> {
    await this.requireActiveUser(userId);
    const attachment = await this.requireOwnedAttachment(userId, attachmentId);
    this.assertTransition(attachment, "fail");

    const reason = (input.reason ?? "").toLowerCase();
    const blocked =
      reason.includes("virus") ||
      reason.includes("malware") ||
      reason.includes("infected") ||
      reason.includes("blocked");

    const updated = await this.repository.failUpload({
      attachmentId,
      uploaderId: userId,
      blocked,
      audit: {
        actorId: userId,
        action: AuditAction.OTHER,
        entityType: "Attachment",
        entityId: attachmentId,
        metadata: {
          requestId: context.requestId,
          // Do not persist raw reason text that may contain PII/paths.
          blocked,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    if (!updated) {
      throw new ConflictError("Upload cannot be failed in its current state");
    }

    const dto = UploadMapper.toSafeDto(updated);
    this.events.publish({
      name: RealtimeEvents.UPLOAD_FAILED,
      rooms: [userRoom(userId)],
      payload: {
        attachmentId,
        attachment: dto,
        blocked,
      },
    });
    return dto;
  }

  async softDelete(
    userId: string,
    attachmentId: string,
    context: UploadClientContext
  ): Promise<AttachmentSafeDto> {
    await this.requireActiveUser(userId);
    const attachment = await this.requireOwnedAttachment(userId, attachmentId);

    if (attachment.messageId != null) {
      throw new ConflictError("Cannot delete an attachment bound to a message");
    }
    if (attachment.deletedAt != null || attachment.status === "DELETED") {
      throw new NotFoundError("Attachment not found");
    }

    const updated = await this.repository.softDeleteUpload({
      attachmentId,
      uploaderId: userId,
      audit: {
        actorId: userId,
        action: AuditAction.OTHER,
        entityType: "Attachment",
        entityId: attachmentId,
        metadata: { requestId: context.requestId },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    if (!updated) {
      throw new ConflictError("Attachment cannot be deleted in its current state");
    }

    return UploadMapper.toSafeDto(updated);
  }

  private assertCreatePayload(input: CreateUploadInput): void {
    const max = this.maxBytesForType(input.type);
    if (input.byteSize > max) {
      throw new ValidationError("File size exceeds limit", {
        byteSize: `Maximum ${max} bytes for ${input.type}`,
      });
    }
  }

  private mergeCompleteFields(
    attachment: AttachmentRecord,
    input: CompleteUploadInput
  ) {
    return {
      checksum: input.checksum !== undefined ? input.checksum : attachment.checksum,
      byteSize:
        input.byteSize !== undefined
          ? BigInt(input.byteSize)
          : attachment.byteSize,
      width: input.width !== undefined ? input.width : attachment.width,
      height: input.height !== undefined ? input.height : attachment.height,
      durationMs:
        input.durationMs !== undefined ? input.durationMs : attachment.durationMs,
    };
  }

  private assertCompletePayload(
    type: ApiUploadType,
    data: {
      checksum: string | null;
      byteSize: bigint;
      width: number | null;
      height: number | null;
      durationMs: number | null;
    }
  ): void {
    if (data.byteSize <= 0n) {
      throw new ValidationError("Completed upload requires positive byteSize", {
        byteSize: "Required",
      });
    }
    if (!data.checksum || data.checksum.trim().length < 8) {
      throw new ValidationError(
        "Completed upload requires a content checksum",
        { checksum: "Required (min 8 chars)" }
      );
    }
    const max = this.maxBytesForType(type);
    if (data.byteSize > BigInt(max)) {
      throw new ValidationError("File size exceeds limit", {
        byteSize: `Maximum ${max} bytes`,
      });
    }

    if (type === "image" || type === "sticker" || type === "video") {
      if (!data.width || !data.height) {
        throw new ValidationError("Dimensions are required", {
          width: "Required on complete",
          height: "Required on complete",
        });
      }
    }
    if (type === "voice" || type === "video") {
      if (!data.durationMs || data.durationMs < 1) {
        throw new ValidationError("Duration is required", {
          durationMs: "Required on complete",
        });
      }
    }
  }

  private assertTransition(
    attachment: AttachmentRecord,
    action: "complete" | "fail"
  ): void {
    if (attachment.deletedAt != null || attachment.status === "DELETED") {
      throw new NotFoundError("Attachment not found");
    }
    if (attachment.messageId != null) {
      throw new ConflictError("Attachment is already bound to a message");
    }
    if (attachment.status !== "PENDING") {
      throw new ConflictError(
        `Cannot ${action} upload from status ${attachment.status}`
      );
    }
  }

  private maxBytesForType(type: ApiUploadType): number {
    switch (type) {
      case "sticker":
        return MAX_STICKER_BYTES;
      case "image":
        return MAX_IMAGE_BYTES;
      case "document":
        return MAX_DOCUMENT_BYTES;
      case "voice":
        return MAX_VOICE_BYTES;
      case "video":
        return MAX_VIDEO_BYTES;
      default:
        return MAX_DOCUMENT_BYTES;
    }
  }

  private async requireActiveUser(userId: string): Promise<void> {
    const user = await this.repository.findActiveUploader(userId);
    if (!user) {
      throw new ForbiddenError("User is not active");
    }
  }

  private async requireOwnedAttachment(
    userId: string,
    attachmentId: string
  ): Promise<AttachmentRecord> {
    const attachment = await this.repository.findAttachmentById(attachmentId);
    if (!attachment || attachment.deletedAt != null) {
      throw new NotFoundError("Attachment not found");
    }
    if (attachment.uploaderId !== userId) {
      // Avoid leaking existence to non-owners.
      throw new NotFoundError("Attachment not found");
    }
    return attachment;
  }
}
