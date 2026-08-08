export type UploadType = "image" | "document" | "voice" | "video" | "sticker";

export type UploadStatus =
  | "pending"
  | "ready"
  | "failed"
  | "blocked"
  | "deleted";

export interface Upload {
  id: string;
  type: UploadType;
  status: UploadStatus;
  mimeType: string;
  fileName: string;
  byteSize: string;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  checksum?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateUploadParams {
  type: UploadType;
  mimeType: string;
  fileName: string;
  byteSize: number;
  checksum?: string | null;
  conversationId?: string | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
}

export interface CompleteUploadParams {
  checksum?: string | null;
  byteSize?: number;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
}

export interface FailUploadParams {
  reason?: string | null;
}

export interface UploadService {
  createUpload(params: CreateUploadParams): Promise<Upload>;
  getUpload(attachmentId: string): Promise<Upload>;
  completeUpload(
    attachmentId: string,
    params?: CompleteUploadParams
  ): Promise<Upload>;
  failUpload(attachmentId: string, params?: FailUploadParams): Promise<Upload>;
  deleteUpload(attachmentId: string): Promise<void>;
}
