import type {
  PresenceDeviceType,
  PresencePreferredStatus,
  PresencePrivacy,
} from "@modules/presence/dto/PresenceDto.js";

export type PresencePrefsRecord = {
  privacy: PresencePrivacy;
  preferredStatus: PresencePreferredStatus;
};

export type PresenceLiveState = {
  deviceCount: number;
  lastSeenAt: Date | null;
  online: boolean;
};

export type PresenceDeviceRecord = {
  socketId: string;
  deviceType: PresenceDeviceType;
  connectedAt: string;
};

export type AddDeviceResult = {
  deviceCount: number;
  added: boolean;
  becameOnline: boolean;
};

export type RemoveDeviceResult = {
  deviceCount: number;
  removed: boolean;
  becameOffline: boolean;
};

export type TypingStartResult = {
  started: boolean;
  duplicate: boolean;
};

export type TypingStopResult = {
  stopped: boolean;
};

/**
 * Presence repository — Redis for live devices/typing; Prisma for durable prefs + lastSeen.
 */
export interface IPresenceRepository {
  addDevice(
    userId: string,
    socketId: string,
    deviceType: PresenceDeviceType
  ): Promise<AddDeviceResult>;

  removeDevice(userId: string, socketId: string): Promise<RemoveDeviceResult>;

  refreshTtl(userId: string, socketId?: string): Promise<void>;

  getDeviceCount(userId: string): Promise<number>;

  listDevices(userId: string): Promise<PresenceDeviceRecord[]>;

  setLastSeen(userId: string, at: Date): Promise<void>;

  getLastSeen(userId: string): Promise<Date | null>;

  getPrefs(userId: string): Promise<PresencePrefsRecord | null>;

  /**
   * Persist preferred status (Prisma) then mirror to Redis.
   * Documented in TRANSACTIONS.md §1.
   */
  updatePreferredStatus(
    userId: string,
    status: PresencePreferredStatus
  ): Promise<PresencePrefsRecord>;

  /**
   * Persist privacy (Prisma) then mirror to Redis.
   * Documented in TRANSACTIONS.md §2.
   */
  updatePrivacy(
    userId: string,
    privacy: PresencePrivacy
  ): Promise<PresencePrefsRecord>;

  ensurePrefsCached(userId: string): Promise<PresencePrefsRecord>;

  areContacts(viewerId: string, targetUserId: string): Promise<boolean>;

  userExists(userId: string): Promise<boolean>;

  isActiveConversationMember(
    userId: string,
    conversationId: string
  ): Promise<boolean>;

  startTyping(
    userId: string,
    conversationId: string,
    ttlMs: number
  ): Promise<TypingStartResult>;

  stopTyping(
    userId: string,
    conversationId: string
  ): Promise<TypingStopResult>;

  isTyping(userId: string, conversationId: string): Promise<boolean>;

  /** Global online-user cardinality (users with ≥1 device). O(1) via counter. */
  getOnlineUserCount(): Promise<number>;

  getActiveDeviceCount(): Promise<number>;

  adjustTypingGauge(delta: number): Promise<number>;

  getTypingUserCount(): Promise<number>;

  /** Remove online-set members with zero live devices; repair device gauge. */
  reconcilePresenceGauges(): Promise<{ removedOnline: number; deviceCount: number }>;
}
