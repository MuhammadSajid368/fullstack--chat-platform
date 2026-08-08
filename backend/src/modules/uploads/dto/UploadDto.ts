/**
 * Upload API DTOs — safe attachment metadata only (no storage keys / buckets).
 */

export type ApiUploadType =
  | "image"
  | "document"
  | "voice"
  | "video"
  | "sticker";

/**
 * API lifecycle status. Maps onto frozen Prisma AttachmentStatus:
 * - pending   → PENDING (covers pending + client uploading phase)
 * - ready     → READY
 * - failed    → FAILED (non-infected)
 * - blocked   → FAILED + virusScanStatus INFECTED
 * - deleted   → DELETED / soft-deleted
 */
export type ApiUploadStatus =
  | "pending"
  | "ready"
  | "failed"
  | "blocked"
  | "deleted";

export type AttachmentSafeDto = {
  id: string;
  type: ApiUploadType;
  status: ApiUploadStatus;
  mimeType: string;
  fileName: string;
  byteSize: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  checksum: string | null;
  conversationId: string | null;
  messageId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateUploadInput = {
  type: ApiUploadType;
  mimeType: string;
  fileName: string;
  byteSize: number;
  checksum?: string | null;
  conversationId?: string | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
};

export type CompleteUploadInput = {
  checksum?: string | null;
  byteSize?: number;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
};

export type FailUploadInput = {
  reason?: string | null;
};

export type UploadClientContext = {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};
