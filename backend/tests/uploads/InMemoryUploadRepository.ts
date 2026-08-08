import { randomUUID } from "node:crypto";
import type {
  AttachmentRecord,
  CompleteAttachmentData,
  CreateAttachmentData,
  CreateAuditLogInput,
  IUploadRepository,
} from "../../src/modules/uploads/interfaces/IUploadRepository.js";
import {
  buildStorageKey,
  parseUploadTypeFromStorageKey,
} from "../../src/modules/uploads/repository/UploadRepository.js";

/**
 * In-memory upload repository for unit / HTTP / concurrency tests.
 */
export class InMemoryUploadRepository implements IUploadRepository {
  attachments = new Map<string, AttachmentRecord>();
  users = new Map<string, { id: string; deletedAt: Date | null }>();
  /** conversationId -> Set of active member userIds */
  memberships = new Map<string, Set<string>>();
  auditLogs: CreateAuditLogInput[] = [];
  private locks = new Map<string, Promise<void>>();

  seedUser(user: { id: string; deletedAt: Date | null }): void {
    this.users.set(user.id, { ...user });
  }

  seedMembership(conversationId: string, userId: string): void {
    let set = this.memberships.get(conversationId);
    if (!set) {
      set = new Set();
      this.memberships.set(conversationId, set);
    }
    set.add(userId);
  }

  seedAttachment(row: AttachmentRecord): void {
    this.attachments.set(row.id, { ...row });
  }

  async findActiveUploader(userId: string): Promise<{ id: string } | null> {
    const user = this.users.get(userId);
    if (!user || user.deletedAt != null) {
      return null;
    }
    return { id: user.id };
  }

  async findAttachmentById(
    attachmentId: string
  ): Promise<AttachmentRecord | null> {
    const row = this.attachments.get(attachmentId);
    return row ? { ...row } : null;
  }

  async isActiveConversationMember(
    userId: string,
    conversationId: string
  ): Promise<boolean> {
    return this.memberships.get(conversationId)?.has(userId) === true;
  }

  async createPending(input: {
    data: CreateAttachmentData;
    audit: CreateAuditLogInput;
  }): Promise<AttachmentRecord> {
    const now = new Date();
    const row: AttachmentRecord = {
      id: `att_${randomUUID()}`,
      conversationId: input.data.conversationId,
      messageId: null,
      uploaderId: input.data.uploaderId,
      status: "PENDING",
      virusScanStatus: "PENDING",
      storageKey: input.data.storageKey || buildStorageKey(input.data.uploadType),
      bucket: null,
      mimeType: input.data.mimeType,
      fileName: input.data.fileName,
      byteSize: input.data.byteSize,
      checksum: input.data.checksum,
      width: input.data.width,
      height: input.data.height,
      durationMs: input.data.durationMs,
      thumbnailKey: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
      uploadType: input.data.uploadType,
    };
    this.attachments.set(row.id, row);
    this.auditLogs.push({ ...input.audit, entityId: row.id });
    return { ...row };
  }

  async completeUpload(input: {
    attachmentId: string;
    uploaderId: string;
    data: CompleteAttachmentData;
    audit: CreateAuditLogInput;
  }): Promise<AttachmentRecord | null> {
    return this.withLock(input.attachmentId, () => {
      const row = this.attachments.get(input.attachmentId);
      if (
        !row ||
        row.uploaderId !== input.uploaderId ||
        row.status !== "PENDING" ||
        row.deletedAt != null ||
        row.messageId != null
      ) {
        return null;
      }
      row.status = "READY";
      row.virusScanStatus = "SKIPPED";
      row.checksum = input.data.checksum;
      row.byteSize = input.data.byteSize;
      row.width = input.data.width;
      row.height = input.data.height;
      row.durationMs = input.data.durationMs;
      row.updatedAt = new Date();
      row.uploadType = parseUploadTypeFromStorageKey(row.storageKey);
      this.auditLogs.push({ ...input.audit });
      return { ...row };
    });
  }

  async failUpload(input: {
    attachmentId: string;
    uploaderId: string;
    blocked: boolean;
    audit: CreateAuditLogInput;
  }): Promise<AttachmentRecord | null> {
    return this.withLock(input.attachmentId, () => {
      const row = this.attachments.get(input.attachmentId);
      if (
        !row ||
        row.uploaderId !== input.uploaderId ||
        row.status !== "PENDING" ||
        row.deletedAt != null ||
        row.messageId != null
      ) {
        return null;
      }
      row.status = "FAILED";
      row.virusScanStatus = input.blocked ? "INFECTED" : "ERROR";
      row.updatedAt = new Date();
      this.auditLogs.push({ ...input.audit });
      return { ...row };
    });
  }

  async softDeleteUpload(input: {
    attachmentId: string;
    uploaderId: string;
    audit: CreateAuditLogInput;
  }): Promise<AttachmentRecord | null> {
    return this.withLock(input.attachmentId, () => {
      const row = this.attachments.get(input.attachmentId);
      if (
        !row ||
        row.uploaderId !== input.uploaderId ||
        row.deletedAt != null ||
        row.messageId != null
      ) {
        return null;
      }
      row.deletedAt = new Date();
      row.status = "DELETED";
      row.updatedAt = new Date();
      this.auditLogs.push({ ...input.audit });
      return { ...row };
    });
  }

  private async withLock<T>(
    key: string,
    fn: () => Promise<T> | T
  ): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(
      key,
      prev.then(() => gate)
    );
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}
