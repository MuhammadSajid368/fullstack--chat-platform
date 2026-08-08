import type { PresenceState, PresenceStatus } from "../types/chat";

export type PresencePrivacy = "EVERYONE" | "CONTACTS" | "NOBODY";
export type PresencePreferredStatus = "ONLINE" | "AWAY" | "INVISIBLE";

export interface PresenceInfo {
  userId: string;
  /** Effective visibility (online/away/offline/invisible). */
  status: PresenceStatus;
  /** User-chosen status shown in Settings (Online / Away / Invisible). */
  preferredStatus?: PresencePreferredStatus;
  lastSeenAt?: string | null;
  privacy?: PresencePrivacy;
}

export interface PresenceService {
  getMyPresence(): Promise<PresenceInfo>;
  getPresence(userId: string): Promise<PresenceInfo>;
  getPresenceForUsers(userIds: string[]): Promise<PresenceState>;
  setStatus(status: "ONLINE" | "AWAY" | "INVISIBLE"): Promise<PresenceInfo>;
  setPrivacy(privacy: PresencePrivacy): Promise<PresenceInfo>;
}
