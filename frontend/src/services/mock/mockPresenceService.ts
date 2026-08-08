import type { PresenceService } from "../presenceService";
import type { PresenceState, PresenceStatus } from "../../types/chat";
import type { PresencePreferredStatus } from "../presenceService";
import { mockDataStore } from "./mockDataStore";

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

class MockPresenceService implements PresenceService {
  private preferredStatus: PresencePreferredStatus = "ONLINE";

  async getMyPresence() {
    await delay(100);
    const userId = Object.keys(mockDataStore.users)[0] ?? "current-user";
    return {
      userId,
      status: mockDataStore.presence[userId] ?? "online",
      preferredStatus: this.preferredStatus,
      lastSeenAt: new Date().toISOString(),
      privacy: "EVERYONE" as const,
    };
  }

  async getPresence(userId: string) {
    await delay(100);
    return {
      userId,
      status: mockDataStore.presence[userId] ?? "offline",
      preferredStatus: this.preferredStatus,
      lastSeenAt: new Date().toISOString(),
      privacy: "EVERYONE" as const,
    };
  }

  async getPresenceForUsers(userIds: string[]): Promise<PresenceState> {
    await delay(100);
    const state: PresenceState = {};
    for (const userId of userIds) {
      state[userId] = mockDataStore.presence[userId] ?? "offline";
    }
    return state;
  }

  async setStatus(status: "ONLINE" | "AWAY" | "INVISIBLE") {
    await delay(100);
    const userId = Object.keys(mockDataStore.users)[0] ?? "current-user";
    const mapped: PresenceStatus =
      status === "ONLINE"
        ? "online"
        : status === "AWAY"
          ? "away"
          : "invisible";
    this.preferredStatus = status;
    mockDataStore.presence[userId] = mapped;
    return {
      userId,
      status: mapped,
      preferredStatus: status,
      lastSeenAt: new Date().toISOString(),
      privacy: "EVERYONE" as const,
    };
  }

  async setPrivacy(privacy: "EVERYONE" | "CONTACTS" | "NOBODY") {
    await delay(100);
    const userId = Object.keys(mockDataStore.users)[0] ?? "current-user";
    return {
      userId,
      status: mockDataStore.presence[userId] ?? "online",
      preferredStatus: this.preferredStatus,
      lastSeenAt: new Date().toISOString(),
      privacy,
    };
  }
}

export const mockPresenceService = new MockPresenceService();
