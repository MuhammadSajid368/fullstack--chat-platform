/**
 * API DTOs — separate from frontend domain types in src/types/*.
 * Transformed via src/services/api/transformers.ts.
 */

export type ApiConversationType = "direct" | "group";
export type ApiMessageType =
  | "text"
  | "image"
  | "document"
  | "link"
  | "reply"
  | "voice"
  | "video"
  | "sticker"
  | "contact"
  | "location"
  | "system";
export type ApiMessageStatus =
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed";
export type ApiMemberRole = "owner" | "admin" | "member";
export type ApiGlobalRole = "USER" | "ADMIN" | "SUPER_ADMIN";

export interface ApiUserDto {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string | null;
  avatar?: string | null;
  phone?: string | null;
  about?: string | null;
}

export interface ApiAuthUserDto {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  avatar?: string | null;
  globalRole?: ApiGlobalRole;
}

export interface ApiLoginRequest {
  email: string;
  password: string;
}

export interface ApiRegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface ApiLoginResponse {
  user: ApiAuthUserDto;
}

export interface ApiMeResponse {
  user: ApiAuthUserDto;
}

export interface ApiRefreshResponse {
  user: ApiAuthUserDto;
}

export interface ApiGroupMemberDto {
  userId: string;
  role: ApiMemberRole;
}

export interface ApiLinkPreviewDto {
  title: string;
  url: string;
  imageUrl: string;
}

export interface ApiAttachmentDto {
  id: string;
  mimeType: string;
  fileName: string;
  byteSize: string;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  status?: string;
}

export interface ApiConversationDto {
  id: string;
  type: ApiConversationType;
  name: string;
  avatarUrl?: string | null;
  avatar?: string | null;
  memberIds: string[];
  pinned?: boolean;
  muted?: boolean;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | number | null;
  unreadCount?: number;
  description?: string | null;
  members?: ApiGroupMemberDto[] | null;
  createdBy?: string | null;
  adminIds?: string[] | null;
  inviteCode?: string | null;
}

export interface ApiConversationsResponse {
  conversations: ApiConversationDto[];
  users?: ApiUserDto[];
}

export interface ApiMessageDto {
  id: string;
  conversationId: string;
  senderId: string;
  type: ApiMessageType | string;
  content: string;
  createdAt: string | number;
  status?: ApiMessageStatus;
  starred?: boolean;
  pinned?: boolean;
  deleted?: boolean;
  replyToMessageId?: string | null;
  imageUrl?: string | null;
  documentName?: string | null;
  linkPreview?: ApiLinkPreviewDto | null;
  clientMessageId?: string | null;
  metadata?: Record<string, unknown> | null;
  attachmentIds?: string[] | null;
  attachments?: ApiAttachmentDto[] | null;
  lat?: number | null;
  lng?: number | null;
  contactName?: string | null;
  contactPhone?: string | null;
  durationMs?: number | null;
  mimeType?: string | null;
}

export interface ApiMessagesPageResponse {
  messages: ApiMessageDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ApiSendMessageRequest {
  type?: ApiMessageType;
  content?: string;
  replyToMessageId?: string | null;
  clientMessageId?: string;
  attachmentIds?: string[];
  metadata?: Record<string, unknown> | null;
  linkPreview?: ApiLinkPreviewDto | null;
}

export interface ApiSendDirectMessageRequest extends ApiSendMessageRequest {
  peerUserId: string;
}

export interface ApiSendMessageResult {
  message: ApiMessageDto;
  created: boolean;
  conversationId: string;
}

export interface ApiCreateGroupRequest {
  name: string;
  description?: string;
  memberUserIds: string[];
}

export interface ApiUpdateGroupRequest {
  name?: string;
  description?: string | null;
  avatarUrl?: string | null;
}

export interface ApiAddMembersRequest {
  memberUserIds: string[];
}

export interface ApiChangeMemberRoleRequest {
  role: "admin" | "member";
}

export interface ApiTransferOwnershipRequest {
  toUserId?: string;
  newOwnerUserId?: string;
}

export interface ApiMuteRequest {
  muted: boolean;
}

export type ApiPresenceStatus =
  | "ONLINE"
  | "OFFLINE"
  | "AWAY"
  | "INVISIBLE"
  | "online"
  | "offline"
  | "away"
  | "invisible";

export type ApiPresencePrivacy = "EVERYONE" | "CONTACTS" | "NOBODY";

export type ApiPresencePreferredStatus = "ONLINE" | "AWAY" | "INVISIBLE";

export interface ApiPresenceDto {
  userId: string;
  status: ApiPresenceStatus;
  lastSeenAt?: string | null;
  privacy?: ApiPresencePrivacy;
  preferredStatus?: ApiPresencePreferredStatus;
  deviceCount?: number | null;
}

export interface ApiPresenceStatusRequest {
  status: ApiPresencePreferredStatus | "online" | "away" | "invisible";
}

export interface ApiPresencePrivacyRequest {
  privacy: ApiPresencePrivacy;
}

export type ApiNotificationType =
  | "message"
  | "mention"
  | "group_invite"
  | "group_update"
  | "system";

export type ApiNotificationStatus = "unread" | "read" | "dismissed";

export interface ApiNotificationDto {
  id: string;
  type: ApiNotificationType;
  status: ApiNotificationStatus;
  title: string;
  body: string;
  conversationId?: string | null;
  messageId?: string | null;
  payload?: Record<string, unknown> | null;
  readAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface ApiNotificationsPageResponse {
  notifications: ApiNotificationDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ApiUnreadCountResponse {
  count: number;
}

export interface ApiSearchMessageHitDto {
  id: string;
  conversationId: string;
  senderId: string;
  type: string;
  content: string;
  snippet: string;
  createdAt: string;
  rank?: number | null;
}

export interface ApiSearchMessagesPageResponse {
  results: ApiSearchMessageHitDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ApiSearchUserHitDto {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  about?: string | null;
  rank?: number | null;
}

export interface ApiSearchUsersPageResponse {
  results: ApiSearchUserHitDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ApiSearchGroupHitDto {
  id: string;
  name: string;
  avatarUrl?: string | null;
  description?: string | null;
  memberCount: number;
  rank?: number | null;
}

export interface ApiSearchGroupsPageResponse {
  results: ApiSearchGroupHitDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ApiSearchConversationHitDto {
  id: string;
  type: ApiConversationType;
  name: string;
  avatarUrl?: string | null;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
  rank?: number | null;
}

export interface ApiSearchConversationsPageResponse {
  results: ApiSearchConversationHitDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

export type ApiUploadType = "image" | "document" | "voice" | "video" | "sticker";

export type ApiUploadStatus =
  | "pending"
  | "ready"
  | "failed"
  | "blocked"
  | "deleted";

export interface ApiUploadDto {
  id: string;
  type: ApiUploadType;
  status: ApiUploadStatus;
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

export interface ApiCreateUploadRequest {
  type: ApiUploadType;
  mimeType: string;
  fileName: string;
  byteSize: number;
  checksum?: string | null;
  conversationId?: string | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
}

export interface ApiCompleteUploadRequest {
  checksum?: string | null;
  byteSize?: number;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
}

export interface ApiFailUploadRequest {
  reason?: string | null;
}

export interface ApiAdminUserDto {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  phone?: string | null;
  about?: string | null;
  globalRole: ApiGlobalRole;
  suspendedAt?: string | null;
  lastSeenAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface ApiAdminUsersPageResponse {
  results: ApiAdminUserDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ApiAdminConversationDto {
  id: string;
  type: ApiConversationType;
  status: string;
  name?: string | null;
  avatarUrl?: string | null;
  description?: string | null;
  memberCount: number;
  lastMessageAt?: string | null;
  createdAt: string;
  deletedAt?: string | null;
}

export interface ApiAdminConversationsPageResponse {
  results: ApiAdminConversationDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ApiAdminMemberDto {
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role: "OWNER" | "ADMIN" | "MEMBER";
  muted: boolean;
  joinedAt: string;
  leftAt?: string | null;
  deletedAt?: string | null;
}

export interface ApiAdminGroupDto {
  id: string;
  name?: string | null;
  avatarUrl?: string | null;
  description?: string | null;
  status: string;
  memberCount: number;
  ownerId?: string | null;
  createdAt: string;
  deletedAt?: string | null;
}

export interface ApiAdminGroupsPageResponse {
  results: ApiAdminGroupDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ApiAdminMessageDto {
  id: string;
  conversationId: string;
  senderId: string;
  type: string;
  content: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface ApiAdminMessagesPageResponse {
  results: ApiAdminMessageDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ApiAdminAuditLogDto {
  id: string;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
}

export interface ApiAdminAuditPageResponse {
  results: ApiAdminAuditLogDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

export type ApiAdminReportStatus =
  | "OPEN"
  | "UNDER_REVIEW"
  | "RESOLVED"
  | "DISMISSED";

export type ApiAdminReportTargetType =
  | "USER"
  | "MESSAGE"
  | "CONVERSATION"
  | "GROUP";

export interface ApiAdminReportDto {
  id: string;
  reporterId: string;
  targetType: ApiAdminReportTargetType;
  targetId: string;
  reason: string;
  details?: string | null;
  status: ApiAdminReportStatus;
  reviewerId?: string | null;
  resolution?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface ApiAdminReportsPageResponse {
  results: ApiAdminReportDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ApiAdminCreateReportRequest {
  targetType: ApiAdminReportTargetType;
  targetId: string;
  reason: string;
  details?: string | null;
}

export interface ApiAdminResolveReportRequest {
  resolution: string;
}

export interface ApiAdminDismissReportRequest {
  reason?: string | null;
}

export interface ApiAdminSuspendRequest {
  reason?: string | null;
}

export interface ApiAdminTransferOwnershipRequest {
  newOwnerUserId: string;
}

export interface ApiAdminChangeMemberRoleRequest {
  role: "ADMIN" | "MEMBER" | "OWNER";
}

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    fieldErrors?: Record<string, string>;
    retryable?: boolean;
  };
  message?: string;
  code?: string;
}
