import type {
  DeviceConnectInput,
  PresenceClientContext,
  PresenceDto,
  PresencePreferredStatus,
  PresencePrivacy,
} from "@modules/presence/dto/PresenceDto.js";

export type PresenceSnapshot = PresenceDto;

export interface IPresenceService {
  markOnline(
    userId: string,
    socketId: string,
    input?: DeviceConnectInput
  ): Promise<PresenceSnapshot>;

  markOffline(userId: string, socketId: string): Promise<PresenceSnapshot>;

  heartbeat(userId: string, socketId?: string): Promise<void>;

  getMyPresence(userId: string): Promise<PresenceSnapshot>;

  getPresenceForViewer(
    viewerId: string,
    targetUserId: string
  ): Promise<PresenceSnapshot>;

  setStatus(
    userId: string,
    status: PresencePreferredStatus,
    context?: PresenceClientContext
  ): Promise<PresenceSnapshot>;

  setPrivacy(
    userId: string,
    privacy: PresencePrivacy,
    context?: PresenceClientContext
  ): Promise<PresenceSnapshot>;

  /**
   * Authorize subscribe + return filtered snapshot for watcher.
   * Caller joins Socket.IO room after success.
   */
  subscribe(
    viewerId: string,
    targetUserId: string
  ): Promise<{ allowed: boolean; presence: PresenceSnapshot }>;

  startTyping(
    userId: string,
    conversationId: string,
    exceptSocketId?: string
  ): Promise<{ published: boolean }>;

  stopTyping(
    userId: string,
    conversationId: string,
    exceptSocketId?: string
  ): Promise<{ published: boolean }>;

  /** Membership check for typing (throws ForbiddenError). */
  assertConversationMember(
    userId: string,
    conversationId: string
  ): Promise<void>;

  getManyForViewer(
    viewerId: string,
    userIds: string[]
  ): Promise<Record<string, PresenceSnapshot>>;

  /** Repair Redis online/device gauges after TTL expiry / crash. */
  reconcileStalePresence(): Promise<{ removedOnline: number; deviceCount: number }>;
}
