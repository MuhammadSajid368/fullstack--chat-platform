import type { AuditAction, AttachmentStatus, VirusScanStatus } from "@prisma/client";
import type { ApiUploadType } from "@modules/uploads/dto/UploadDto.js";

export type AttachmentRecord = {
  id: string;
  conversationId: string | null;
  messageId: string | null;
  uploaderId: string;
  status: AttachmentStatus | string;
  virusScanStatus: VirusScanStatus | string;
  storageKey: string;
  bucket: string | null;
  mimeType: string;
  fileName: string;
  byteSize: bigint;
  checksum: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  thumbnailKey: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** Derived from opaque storageKey prefix — not a DB column. */
  uploadType: ApiUploadType | null;
};

export type CreateAuditLogInput = {
  actorId?: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};

export type CreateAttachmentData = {
  uploaderId: string;
  uploadType: ApiUploadType;
  mimeType: string;
  fileName: string;
  byteSize: bigint;
  checksum: string | null;
  conversationId: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  storageKey: string;
};

export type CompleteAttachmentData = {
  checksum: string | null;
  byteSize: bigint;
  width: number | null;
  height: number | null;
  durationMs: number | null;
};

export interface IUploadRepository {
  findActiveUploader(userId: string): Promise<{ id: string } | null>;

  findAttachmentById(attachmentId: string): Promise<AttachmentRecord | null>;

  /** True when user is an active (non-left) member of the conversation. */
  isActiveConversationMember(
    userId: string,
    conversationId: string
  ): Promise<boolean>;

  createPending(input: {
    data: CreateAttachmentData;
    audit: CreateAuditLogInput;
  }): Promise<AttachmentRecord>;

  completeUpload(input: {
    attachmentId: string;
    uploaderId: string;
    data: CompleteAttachmentData;
    audit: CreateAuditLogInput;
  }): Promise<AttachmentRecord | null>;

  failUpload(input: {
    attachmentId: string;
    uploaderId: string;
    blocked: boolean;
    audit: CreateAuditLogInput;
  }): Promise<AttachmentRecord | null>;

  softDeleteUpload(input: {
    attachmentId: string;
    uploaderId: string;
    audit: CreateAuditLogInput;
  }): Promise<AttachmentRecord | null>;
}
