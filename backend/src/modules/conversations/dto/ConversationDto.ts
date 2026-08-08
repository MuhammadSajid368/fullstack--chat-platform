/**
 * Conversation API DTOs aligned with frontend `ApiConversationDto` /
 * `ApiConversationsResponse`.
 */

export type ApiConversationType = "direct" | "group";

export type ApiGroupMemberDto = {
  userId: string;
  role: "owner" | "admin" | "member";
};

export type ConversationDto = {
  id: string;
  type: ApiConversationType;
  name: string;
  avatarUrl: string | null;
  memberIds: string[];
  pinned: boolean;
  muted: boolean;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  description: string | null;
  members: ApiGroupMemberDto[] | null;
  createdBy: string | null;
  adminIds: string[] | null;
  inviteCode: string | null;
};

export type ConversationUserDto = {
  id: string;
  name: string;
  avatarUrl: string | null;
  phone: string | null;
  about: string | null;
};

export type ConversationsListResponseDto = {
  conversations: ConversationDto[];
  users: ConversationUserDto[];
};

export type MuteConversationInput = {
  muted: boolean;
};

export type ConversationClientContext = {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};
