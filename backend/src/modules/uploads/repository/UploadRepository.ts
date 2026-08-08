import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { AuditAction } from "@prisma/client";
import type { ApiUploadType } from "@modules/uploads/dto/UploadDto.js";
import type {
  AttachmentRecord,
  CompleteAttachmentData,
  CreateAttachmentData,
  CreateAuditLogInput,
  IUploadRepository,
} from "@modules/uploads/interfaces/IUploadRepository.js";

const attachmentSelect = {
  id: true,
  conversationId: true,
  messageId: true,
  uploaderId: true,
  status: true,
  virusScanStatus: true,
  storageKey: true,
  bucket: true,
  mimeType: true,
  fileName: true,
  byteSize: true,
  checksum: true,
  width: true,
  height: true,
  durationMs: true,
  thumbnailKey: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FutureAttachmentSelect;

function toJson(
  value: Record<string, unknown> | undefined
): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value as Prisma.InputJsonValue;
}

const TYPE_PREFIX = /^uploads\/(image|document|voice|video|sticker)\//;

export function buildStorageKey(type: ApiUploadType): string {
  return `uploads/${type}/${randomUUID()}`;
}

export function parseUploadTypeFromStorageKey(
  storageKey: string
): ApiUploadType | null {
  const match = storageKey.match(TYPE_PREFIX);
  if (!match) {
    return null;
  }
  return match[1] as ApiUploadType;
}

function mapAttachment(
  row: Prisma.FutureAttachmentGetPayload<{ select: typeof attachmentSelect }>
): AttachmentRecord {
  return {
    ...row,
    status: String(row.status),
    virusScanStatus: String(row.virusScanStatus),
    uploadType: parseUploadTypeFromStorageKey(row.storageKey),
  };
}

/**
 * Upload repository — Prisma only.
 */
export class UploadRepository implements IUploadRepository {
  constructor(protected readonly prisma: PrismaClient) {}

  async findActiveUploader(userId: string): Promise<{ id: string } | null> {
    return this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true },
    });
  }

  async findAttachmentById(
    attachmentId: string
  ): Promise<AttachmentRecord | null> {
    const row = await this.prisma.futureAttachment.findUnique({
      where: { id: attachmentId },
      select: attachmentSelect,
    });
    return row ? mapAttachment(row) : null;
  }

  async isActiveConversationMember(
    userId: string,
    conversationId: string
  ): Promise<boolean> {
    const member = await this.prisma.conversationMember.findFirst({
      where: {
        conversationId,
        userId,
        leftAt: null,
        deletedAt: null,
        conversation: { deletedAt: null },
      },
      select: { id: true },
    });
    return member != null;
  }

  async createPending(input: {
    data: CreateAttachmentData;
    audit: CreateAuditLogInput;
  }): Promise<AttachmentRecord> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.futureAttachment.create({
        data: {
          uploaderId: input.data.uploaderId,
          conversationId: input.data.conversationId,
          mimeType: input.data.mimeType,
          fileName: input.data.fileName,
          byteSize: input.data.byteSize,
          checksum: input.data.checksum,
          width: input.data.width,
          height: input.data.height,
          durationMs: input.data.durationMs,
          storageKey: input.data.storageKey,
          status: "PENDING",
          virusScanStatus: "PENDING",
        },
        select: attachmentSelect,
      });

      await tx.auditLog.create({
        data: {
          actorId: input.audit.actorId,
          action: AuditAction.ATTACHMENT_CREATE,
          entityType: input.audit.entityType,
          entityId: created.id,
          metadata: toJson(input.audit.metadata),
          ipAddress: input.audit.ipAddress,
          userAgent: input.audit.userAgent,
        },
      });

      return mapAttachment(created);
    });
  }

  async completeUpload(input: {
    attachmentId: string;
    uploaderId: string;
    data: CompleteAttachmentData;
    audit: CreateAuditLogInput;
  }): Promise<AttachmentRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.futureAttachment.findFirst({
        where: {
          id: input.attachmentId,
          uploaderId: input.uploaderId,
          status: "PENDING",
          deletedAt: null,
          messageId: null,
        },
        select: { id: true },
      });
      if (!existing) {
        return null;
      }

      const updated = await tx.futureAttachment.update({
        where: { id: input.attachmentId },
        data: {
          status: "READY",
          // No virus worker yet — SKIPPED allows Messages binding.
          virusScanStatus: "SKIPPED",
          checksum: input.data.checksum,
          byteSize: input.data.byteSize,
          width: input.data.width,
          height: input.data.height,
          durationMs: input.data.durationMs,
        },
        select: attachmentSelect,
      });

      await tx.auditLog.create({
        data: {
          actorId: input.audit.actorId,
          action: AuditAction.OTHER,
          entityType: input.audit.entityType,
          entityId: input.attachmentId,
          metadata: toJson({
            ...input.audit.metadata,
            uploadAction: "complete",
          }),
          ipAddress: input.audit.ipAddress,
          userAgent: input.audit.userAgent,
        },
      });

      return mapAttachment(updated);
    });
  }

  async failUpload(input: {
    attachmentId: string;
    uploaderId: string;
    blocked: boolean;
    audit: CreateAuditLogInput;
  }): Promise<AttachmentRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.futureAttachment.findFirst({
        where: {
          id: input.attachmentId,
          uploaderId: input.uploaderId,
          status: "PENDING",
          deletedAt: null,
          messageId: null,
        },
        select: { id: true },
      });
      if (!existing) {
        return null;
      }

      const updated = await tx.futureAttachment.update({
        where: { id: input.attachmentId },
        data: {
          status: "FAILED",
          virusScanStatus: input.blocked ? "INFECTED" : "ERROR",
        },
        select: attachmentSelect,
      });

      await tx.auditLog.create({
        data: {
          actorId: input.audit.actorId,
          action: AuditAction.OTHER,
          entityType: input.audit.entityType,
          entityId: input.attachmentId,
          metadata: toJson({
            ...input.audit.metadata,
            uploadAction: input.blocked ? "blocked" : "fail",
          }),
          ipAddress: input.audit.ipAddress,
          userAgent: input.audit.userAgent,
        },
      });

      return mapAttachment(updated);
    });
  }

  async softDeleteUpload(input: {
    attachmentId: string;
    uploaderId: string;
    audit: CreateAuditLogInput;
  }): Promise<AttachmentRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.futureAttachment.findFirst({
        where: {
          id: input.attachmentId,
          uploaderId: input.uploaderId,
          deletedAt: null,
          messageId: null,
        },
        select: attachmentSelect,
      });
      if (!existing) {
        return null;
      }

      const now = new Date();
      const updated = await tx.futureAttachment.update({
        where: { id: input.attachmentId },
        data: {
          deletedAt: now,
          status: "DELETED",
        },
        select: attachmentSelect,
      });

      await tx.auditLog.create({
        data: {
          actorId: input.audit.actorId,
          action: AuditAction.OTHER,
          entityType: input.audit.entityType,
          entityId: input.attachmentId,
          metadata: toJson({
            ...input.audit.metadata,
            uploadAction: "delete",
          }),
          ipAddress: input.audit.ipAddress,
          userAgent: input.audit.userAgent,
        },
      });

      return mapAttachment(updated);
    });
  }
}
