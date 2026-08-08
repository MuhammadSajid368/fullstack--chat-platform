import type { MessageStatus, MessageType, Prisma } from "@prisma/client";
import { sanitizeHttpUrl } from "@common/utils/safeHttpUrl.js";
import type {
  ApiMessageStatus,
  ApiMessageType,
  AttachmentDto,
  LinkPreviewDto,
  MessageDto,
} from "@modules/messages/dto/MessageDto.js";
import type {
  AttachmentRecord,
  MessageRecord,
} from "@modules/messages/interfaces/IMessageRepository.js";

const TYPE_TO_API: Record<MessageType, ApiMessageType> = {
  TEXT: "text",
  IMAGE: "image",
  DOCUMENT: "document",
  VOICE: "voice",
  VIDEO: "video",
  LINK: "link",
  LOCATION: "location",
  CONTACT: "contact",
  STICKER: "sticker",
  SYSTEM: "system",
};

const STATUS_TO_API: Record<MessageStatus, ApiMessageStatus> = {
  SENDING: "sending",
  SENT: "sent",
  DELIVERED: "delivered",
  READ: "read",
  FAILED: "failed",
};

const API_TO_TYPE: Record<ApiMessageType, MessageType> = {
  text: "TEXT",
  image: "IMAGE",
  document: "DOCUMENT",
  voice: "VOICE",
  video: "VIDEO",
  link: "LINK",
  location: "LOCATION",
  contact: "CONTACT",
  sticker: "STICKER",
  system: "SYSTEM",
};

export class MessageMapper {
  static toPrismaType(type: ApiMessageType): MessageType {
    return API_TO_TYPE[type];
  }

  static toAttachmentDto(row: AttachmentRecord): AttachmentDto {
    return {
      id: row.id,
      mimeType: row.mimeType,
      fileName: row.fileName,
      byteSize: row.byteSize.toString(),
      width: row.width,
      height: row.height,
      durationMs: row.durationMs,
      status: row.status,
    };
  }

  static toMessageDto(input: {
    message: MessageRecord;
    starred: boolean;
    pinned: boolean;
    attachments: AttachmentRecord[];
  }): MessageDto {
    const { message, starred, pinned, attachments } = input;
    const activeAttachments = attachments.filter((a) => a.deletedAt == null);

    const image = activeAttachments.find((a) =>
      a.mimeType.startsWith("image/")
    );
    const document = activeAttachments.find(
      (a) =>
        !a.mimeType.startsWith("image/") &&
        !a.mimeType.startsWith("audio/") &&
        !a.mimeType.startsWith("video/")
    );

    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      type: TYPE_TO_API[message.type],
      content: message.deletedAt ? "" : message.content,
      createdAt: message.createdAt.toISOString(),
      status: STATUS_TO_API[message.status],
      starred,
      pinned,
      deleted: message.deletedAt != null,
      replyToMessageId: message.replyToMessageId,
      imageUrl: image ? `attachment:${image.id}` : null,
      documentName: document?.fileName ?? null,
      linkPreview: parseLinkPreview(message.linkPreview),
      clientMessageId: message.clientMessageId,
      attachments: activeAttachments.map((a) => MessageMapper.toAttachmentDto(a)),
      metadata: parseMetadata(message.metadata),
    };
  }
}

function parseLinkPreview(value: Prisma.JsonValue | null): LinkPreviewDto | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const obj = value as Record<string, unknown>;
  if (
    typeof obj.title !== "string" ||
    typeof obj.url !== "string" ||
    typeof obj.imageUrl !== "string"
  ) {
    return null;
  }
  const url = sanitizeHttpUrl(obj.url);
  const imageUrl = sanitizeHttpUrl(obj.imageUrl);
  if (!url || !imageUrl) {
    return null;
  }
  return {
    title: obj.title.slice(0, 200),
    url,
    imageUrl,
  };
}

function parseMetadata(
  value: Prisma.JsonValue | null
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}
