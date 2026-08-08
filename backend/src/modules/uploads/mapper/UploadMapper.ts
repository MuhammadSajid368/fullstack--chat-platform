import type {
  AttachmentStatus,
  VirusScanStatus,
} from "@prisma/client";
import type {
  ApiUploadStatus,
  ApiUploadType,
  AttachmentSafeDto,
} from "@modules/uploads/dto/UploadDto.js";
import type { AttachmentRecord } from "@modules/uploads/interfaces/IUploadRepository.js";

function inferType(mimeType: string, metadataType?: string | null): ApiUploadType {
  if (
    metadataType === "image" ||
    metadataType === "document" ||
    metadataType === "voice" ||
    metadataType === "video" ||
    metadataType === "sticker"
  ) {
    return metadataType;
  }
  const mime = mimeType.toLowerCase();
  if (mime.startsWith("image/")) {
    return "image";
  }
  if (mime.startsWith("audio/")) {
    return "voice";
  }
  if (mime.startsWith("video/")) {
    return "video";
  }
  return "document";
}

function mapStatus(
  status: AttachmentStatus | string,
  virusScanStatus: VirusScanStatus | string,
  deletedAt: Date | null
): ApiUploadStatus {
  if (deletedAt != null || status === "DELETED") {
    return "deleted";
  }
  if (status === "READY") {
    return "ready";
  }
  if (status === "FAILED") {
    if (virusScanStatus === "INFECTED") {
      return "blocked";
    }
    return "failed";
  }
  // PENDING covers pending + client-side uploading phase (no UPLOADING enum in frozen schema).
  return "pending";
}

/**
 * Maps attachment persistence → safe API DTO.
 */
export class UploadMapper {
  static toSafeDto(row: AttachmentRecord): AttachmentSafeDto {
    return {
      id: row.id,
      type: inferType(row.mimeType, row.uploadType),
      status: mapStatus(row.status, row.virusScanStatus, row.deletedAt),
      mimeType: row.mimeType,
      fileName: row.fileName,
      byteSize: row.byteSize.toString(),
      width: row.width,
      height: row.height,
      durationMs: row.durationMs,
      checksum: row.checksum,
      conversationId: row.conversationId,
      messageId: row.messageId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
