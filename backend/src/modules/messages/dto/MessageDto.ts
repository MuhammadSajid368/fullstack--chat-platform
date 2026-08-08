/**
 * Message API DTOs — Phase M1 (FE-compatible + extensible).
 */

export type ApiMessageType =
  | "text"
  | "image"
  | "document"
  | "voice"
  | "video"
  | "link"
  | "location"
  | "contact"
  | "sticker"
  | "system";

export type ApiMessageStatus =
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export type AttachmentDto = {
  id: string;
  mimeType: string;
  fileName: string;
  byteSize: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  status: string;
};

export type LinkPreviewDto = {
  title: string;
  url: string;
  imageUrl: string;
};

export type MessageDto = {
  id: string;
  conversationId: string;
  senderId: string;
  type: ApiMessageType;
  content: string;
  createdAt: string;
  status: ApiMessageStatus;
  starred: boolean;
  pinned: boolean;
  deleted: boolean;
  replyToMessageId: string | null;
  imageUrl: string | null;
  documentName: string | null;
  linkPreview: LinkPreviewDto | null;
  clientMessageId: string | null;
  attachments: AttachmentDto[];
  metadata: Record<string, unknown> | null;
};

export type MessagesPageDto = {
  messages: MessageDto[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type SendMessageInput = {
  type?: ApiMessageType;
  content?: string;
  replyToMessageId?: string | null;
  clientMessageId: string;
  attachmentIds?: string[];
  linkPreview?: LinkPreviewDto | null;
  metadata?: Record<string, unknown> | null;
};

export type SendDirectInput = SendMessageInput & {
  peerUserId: string;
};

export type SendMessageResult = {
  message: MessageDto;
  created: boolean;
  conversationId: string;
};

export type MessageClientContext = {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};
