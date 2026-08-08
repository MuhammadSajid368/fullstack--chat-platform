/**
 * Presence DTOs — public API / service contracts.
 * Controllers must never see Prisma or Redis records directly.
 */

export type PresenceStatus = "ONLINE" | "OFFLINE" | "AWAY" | "INVISIBLE";

export type PresencePrivacy = "EVERYONE" | "CONTACTS" | "NOBODY";

export type PresencePreferredStatus = "ONLINE" | "AWAY" | "INVISIBLE";

export type PresenceDeviceType = "phone" | "tablet" | "desktop" | "browser";

export type PresenceDeviceDto = {
  socketId: string;
  deviceType: PresenceDeviceType;
  connectedAt: string;
};

export type PresenceDto = {
  userId: string;
  status: PresenceStatus;
  lastSeenAt: string | null;
  privacy: PresencePrivacy;
  preferredStatus: PresencePreferredStatus;
  /** Present for self views only; omitted/null for others. */
  deviceCount: number | null;
  devices: PresenceDeviceDto[] | null;
};

export type PresenceStatusUpdateDto = {
  status: PresencePreferredStatus;
};

export type PresencePrivacyUpdateDto = {
  privacy: PresencePrivacy;
};

export type PresenceClientContext = {
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
};

export type DeviceConnectInput = {
  socketId: string;
  deviceType?: PresenceDeviceType;
};
