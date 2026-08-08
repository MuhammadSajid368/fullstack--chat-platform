import type { AuthUser } from "../../types/auth";
import type {
  Conversation,
  GroupMember,
  LinkPreview,
  Message,
  MessageAttachment,
  MessageStatus,
  MessageType,
  PaginatedMessages,
  PresenceState,
  PresenceStatus,
  User,
} from "../../types/chat";
import type {
  ApiAttachmentDto,
  ApiAuthUserDto,
  ApiConversationDto,
  ApiGroupMemberDto,
  ApiLinkPreviewDto,
  ApiMessageDto,
  ApiMessagesPageResponse,
  ApiPresenceDto,
  ApiPresenceStatus,
  ApiUserDto,
} from "./apiTypes";
import { sanitizeHttpUrl } from "../../utils/safeHttpUrl";

export function normalizeTimestamp(value: string | number | null | undefined): string {
  if (value == null || value === "") {
    return new Date(0).toISOString();
  }
  if (typeof value === "number") {
    const ms = value < 1_000_000_000_000 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(0).toISOString();
  }
  return parsed.toISOString();
}

function pickAvatar(avatarUrl?: string | null, avatar?: string | null): string {
  return avatarUrl ?? avatar ?? "";
}

export function transformAuthUser(dto: ApiAuthUserDto): AuthUser {
  return {
    id: dto.id,
    email: dto.email,
    name: dto.name,
    avatar: pickAvatar(dto.avatarUrl, dto.avatar),
    globalRole: dto.globalRole,
  };
}

export function transformUser(dto: ApiUserDto): User {
  return {
    id: dto.id,
    name: dto.name,
    avatar: pickAvatar(dto.avatarUrl, dto.avatar),
    phone: dto.phone ?? undefined,
    about: dto.about ?? undefined,
  };
}

export function transformUsers(dtos: ApiUserDto[] | undefined): Record<string, User> {
  const users: Record<string, User> = {};
  for (const dto of dtos ?? []) {
    users[dto.id] = transformUser(dto);
  }
  return users;
}

function transformMember(dto: ApiGroupMemberDto): GroupMember {
  return {
    userId: dto.userId,
    role: dto.role,
  };
}

function transformLinkPreview(
  dto: ApiLinkPreviewDto | null | undefined
): LinkPreview | undefined {
  if (!dto) {
    return undefined;
  }
  const url = sanitizeHttpUrl(dto.url);
  const imageUrl = sanitizeHttpUrl(dto.imageUrl);
  if (!url || !imageUrl) {
    return undefined;
  }
  return {
    title: String(dto.title ?? "").slice(0, 200),
    url,
    imageUrl,
  };
}

function transformAttachment(dto: ApiAttachmentDto): MessageAttachment {
  return {
    id: dto.id,
    mimeType: dto.mimeType,
    fileName: dto.fileName,
    byteSize: dto.byteSize,
    width: dto.width,
    height: dto.height,
    durationMs: dto.durationMs,
    status: dto.status,
  };
}

export function transformConversation(dto: ApiConversationDto): Conversation {
  return {
    id: dto.id,
    type: dto.type,
    name: dto.name,
    avatar: pickAvatar(dto.avatarUrl, dto.avatar),
    memberIds: dto.memberIds ?? [],
    pinned: Boolean(dto.pinned),
    muted: Boolean(dto.muted),
    lastMessagePreview: dto.lastMessagePreview ?? "",
    lastMessageAt: normalizeTimestamp(dto.lastMessageAt),
    description: dto.description ?? undefined,
    members: dto.members?.map(transformMember),
    createdBy: dto.createdBy ?? undefined,
    adminIds: dto.adminIds ?? undefined,
    inviteCode: dto.inviteCode ?? undefined,
  };
}

export function transformConversations(
  dtos: ApiConversationDto[]
): Conversation[] {
  return dtos.map(transformConversation);
}

export function extractUnreadCounts(
  dtos: ApiConversationDto[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const dto of dtos) {
    counts[dto.id] = dto.unreadCount ?? 0;
  }
  return counts;
}

const VALID_MESSAGE_TYPES: MessageType[] = [
  "text",
  "image",
  "document",
  "link",
  "reply",
  "voice",
  "video",
  "sticker",
  "contact",
  "location",
  "system",
];

const VALID_STATUSES: MessageStatus[] = [
  "sending",
  "sent",
  "delivered",
  "read",
  "failed",
];

function normalizeMessageType(raw: string | undefined): MessageType {
  if (!raw) {
    return "text";
  }
  const normalized = raw.toLowerCase() as MessageType;
  if (VALID_MESSAGE_TYPES.includes(normalized)) {
    return normalized;
  }
  if (raw === "reply") {
    return "reply";
  }
  return "text";
}

export function transformPresenceStatus(
  status: ApiPresenceStatus | string | undefined
): PresenceStatus {
  const normalized = (status ?? "offline").toLowerCase();
  if (
    normalized === "online" ||
    normalized === "offline" ||
    normalized === "away" ||
    normalized === "invisible"
  ) {
    return normalized;
  }
  return "offline";
}

export function transformPresenceDto(dto: ApiPresenceDto): PresenceStatus {
  return transformPresenceStatus(dto.status);
}

export function transformPresenceMap(
  dtos: ApiPresenceDto[]
): PresenceState {
  const state: PresenceState = {};
  for (const dto of dtos) {
    state[dto.userId] = transformPresenceDto(dto);
  }
  return state;
}

export function transformMessage(dto: ApiMessageDto): Message {
  const type = normalizeMessageType(
    typeof dto.type === "string" ? dto.type : undefined
  );
  const status =
    dto.status && VALID_STATUSES.includes(dto.status) ? dto.status : "sent";

  const metadata = dto.metadata ?? undefined;
  const lat =
    dto.lat ??
    (typeof metadata?.lat === "number" ? metadata.lat : undefined);
  const lng =
    dto.lng ??
    (typeof metadata?.lng === "number" ? metadata.lng : undefined);
  const contactName =
    dto.contactName ??
    (typeof metadata?.contactName === "string"
      ? metadata.contactName
      : undefined);
  const contactPhone =
    dto.contactPhone ??
    (typeof metadata?.contactPhone === "string"
      ? metadata.contactPhone
      : undefined);
  const durationMs =
    dto.durationMs ??
    (typeof metadata?.durationMs === "number"
      ? metadata.durationMs
      : undefined);
  const mimeType =
    dto.mimeType ??
    (typeof metadata?.mimeType === "string" ? metadata.mimeType : undefined);

  return {
    id: dto.id,
    conversationId: dto.conversationId,
    senderId: dto.senderId,
    type,
    content: dto.deleted ? "" : dto.content,
    createdAt: normalizeTimestamp(dto.createdAt),
    status,
    starred: Boolean(dto.starred),
    pinned: Boolean(dto.pinned),
    deleted: Boolean(dto.deleted),
    replyToMessageId: dto.replyToMessageId ?? undefined,
    imageUrl: dto.imageUrl ?? undefined,
    documentName: dto.documentName ?? undefined,
    linkPreview: transformLinkPreview(dto.linkPreview),
    clientMessageId: dto.clientMessageId ?? undefined,
    metadata: metadata ?? undefined,
    attachmentIds: dto.attachmentIds ?? undefined,
    attachments: dto.attachments?.map(transformAttachment),
    lat,
    lng,
    contactName,
    contactPhone,
    durationMs,
    mimeType,
  };
}

export function transformMessagesPage(
  response: ApiMessagesPageResponse
): PaginatedMessages {
  return {
    messages: response.messages.map(transformMessage),
    nextCursor: response.nextCursor,
    hasMore: Boolean(response.hasMore),
  };
}

/** Merge pages without duplicates; keep ascending createdAt order. */
export function mergeMessagesById(
  existing: Message[],
  incoming: Message[]
): Message[] {
  const map = new Map<string, Message>();
  for (const message of existing) {
    map.set(message.id, message);
  }
  for (const message of incoming) {
    map.set(message.id, message);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );
}
