import type { Logger } from "pino";

/**
 * Tracks multi-device socket connections per user (in-process).
 * Cross-node presence counts live in Redis via PresenceService.
 */
export class ConnectionManager {
  private readonly socketsByUser = new Map<string, Set<string>>();
  private readonly userBySocket = new Map<string, string>();

  constructor(private readonly logger: Logger) {}

  add(userId: string, socketId: string): { deviceCount: number } {
    let set = this.socketsByUser.get(userId);
    if (!set) {
      set = new Set();
      this.socketsByUser.set(userId, set);
    }
    set.add(socketId);
    this.userBySocket.set(socketId, userId);
    this.logger.info(
      { userId, socketId, deviceCount: set.size },
      "Socket connected"
    );
    return { deviceCount: set.size };
  }

  remove(socketId: string): {
    userId: string | null;
    deviceCount: number;
    wentOffline: boolean;
  } {
    const userId = this.userBySocket.get(socketId) ?? null;
    this.userBySocket.delete(socketId);
    if (!userId) {
      return { userId: null, deviceCount: 0, wentOffline: false };
    }
    const set = this.socketsByUser.get(userId);
    if (!set) {
      return { userId, deviceCount: 0, wentOffline: true };
    }
    set.delete(socketId);
    const deviceCount = set.size;
    if (deviceCount === 0) {
      this.socketsByUser.delete(userId);
    }
    this.logger.info(
      { userId, socketId, deviceCount },
      "Socket disconnected"
    );
    return { userId, deviceCount, wentOffline: deviceCount === 0 };
  }

  getUserId(socketId: string): string | null {
    return this.userBySocket.get(socketId) ?? null;
  }

  getDeviceCount(userId: string): number {
    return this.socketsByUser.get(userId)?.size ?? 0;
  }

  /** Socket ids currently connected for this user (this process). */
  getSocketIds(userId: string): string[] {
    return [...(this.socketsByUser.get(userId) ?? [])];
  }

  clear(): void {
    this.socketsByUser.clear();
    this.userBySocket.clear();
  }
}
