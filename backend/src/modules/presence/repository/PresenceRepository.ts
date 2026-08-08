import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import type {
  PresenceDeviceType,
  PresencePreferredStatus,
  PresencePrivacy,
} from "@modules/presence/dto/PresenceDto.js";
import type {
  AddDeviceResult,
  IPresenceRepository,
  PresenceDeviceRecord,
  PresencePrefsRecord,
  RemoveDeviceResult,
  TypingStartResult,
  TypingStopResult,
} from "@modules/presence/interfaces/IPresenceRepository.js";

/** Live device set / user-hash TTL — refreshed by heartbeats. */
const LIVE_TTL_SEC = 120;
const LAST_SEEN_CACHE_TTL_SEC = 86_400;
const PREFS_CACHE_TTL_SEC = 86_400;

const ONLINE_USERS_KEY = "presence:online:users";
const ACTIVE_DEVICES_KEY = "presence:devices:total";
const TYPING_USERS_KEY = "presence:typing:total";

/**
 * Presence repository — Redis live state + Prisma durable prefs/lastSeen.
 * Hot paths address keys by id (O(1)). Periodic reconcile may SCAN typing keys.
 */
export class PresenceRepository implements IPresenceRepository {
  constructor(
    protected readonly prisma: PrismaClient,
    protected readonly redis: Redis
  ) {}

  async addDevice(
    userId: string,
    socketId: string,
    deviceType: PresenceDeviceType
  ): Promise<AddDeviceResult> {
    const devicesKey = this.devicesKey(userId);
    const deviceMetaKey = this.deviceMetaKey(socketId);
    const userKey = this.userKey(userId);
    const connectedAt = new Date().toISOString();

    const pipeline = this.redis.pipeline();
    pipeline.sadd(devicesKey, socketId);
    pipeline.expire(devicesKey, LIVE_TTL_SEC);
    pipeline.hset(
      deviceMetaKey,
      "userId",
      userId,
      "deviceType",
      deviceType,
      "connectedAt",
      connectedAt
    );
    pipeline.expire(deviceMetaKey, LIVE_TTL_SEC);
    pipeline.hset(userKey, "updatedAt", connectedAt);
    pipeline.expire(userKey, LIVE_TTL_SEC);
    const results = await pipeline.exec();

    const added = Number(results?.[0]?.[1] ?? 0) > 0;
    const deviceCount = await this.redis.scard(devicesKey);

    let becameOnline = false;
    if (added && deviceCount === 1) {
      await this.redis.sadd(ONLINE_USERS_KEY, userId);
      becameOnline = true;
    }
    if (added) {
      await this.redis.incr(ACTIVE_DEVICES_KEY);
    }
    await this.redis.hset(userKey, "deviceCount", String(deviceCount));

    return { deviceCount, added, becameOnline };
  }

  async removeDevice(
    userId: string,
    socketId: string
  ): Promise<RemoveDeviceResult> {
    const devicesKey = this.devicesKey(userId);
    const deviceMetaKey = this.deviceMetaKey(socketId);
    const userKey = this.userKey(userId);

    const removed = (await this.redis.srem(devicesKey, socketId)) > 0;
    await this.redis.del(deviceMetaKey);

    const deviceCount = await this.redis.scard(devicesKey);
    let becameOffline = false;

    if (removed) {
      const next = await this.redis.decr(ACTIVE_DEVICES_KEY);
      if (next < 0) {
        await this.redis.set(ACTIVE_DEVICES_KEY, "0");
      }
    }

    if (deviceCount === 0) {
      const pipe = this.redis.pipeline();
      pipe.del(devicesKey);
      pipe.srem(ONLINE_USERS_KEY, userId);
      pipe.hset(userKey, "deviceCount", "0");
      pipe.expire(userKey, LAST_SEEN_CACHE_TTL_SEC);
      await pipe.exec();
      becameOffline = removed;
    } else {
      await this.redis
        .pipeline()
        .hset(userKey, "deviceCount", String(deviceCount))
        .expire(devicesKey, LIVE_TTL_SEC)
        .expire(userKey, LIVE_TTL_SEC)
        .exec();
    }

    return { deviceCount, removed, becameOffline };
  }

  async refreshTtl(userId: string, socketId?: string): Promise<void> {
    const devicesKey = this.devicesKey(userId);
    let count = await this.redis.scard(devicesKey);

    // Socket may still be alive after Redis TTL expiry — re-bind the device.
    if (count <= 0 && socketId) {
      await this.addDevice(userId, socketId, "browser");
      count = await this.redis.scard(devicesKey);
    }

    if (count <= 0) {
      return;
    }

    const pipe = this.redis.pipeline();
    pipe.expire(devicesKey, LIVE_TTL_SEC);
    pipe.expire(this.userKey(userId), LIVE_TTL_SEC);
    if (socketId) {
      pipe.expire(this.deviceMetaKey(socketId), LIVE_TTL_SEC);
    }
    await pipe.exec();
  }

  async getDeviceCount(userId: string): Promise<number> {
    return this.redis.scard(this.devicesKey(userId));
  }

  async listDevices(userId: string): Promise<PresenceDeviceRecord[]> {
    const socketIds = await this.redis.smembers(this.devicesKey(userId));
    if (socketIds.length === 0) {
      return [];
    }

    const pipe = this.redis.pipeline();
    for (const id of socketIds) {
      pipe.hgetall(this.deviceMetaKey(id));
    }
    const rows = await pipe.exec();

    const devices: PresenceDeviceRecord[] = [];
    for (let i = 0; i < socketIds.length; i += 1) {
      const socketId = socketIds[i]!;
      const hash = (rows?.[i]?.[1] ?? {}) as Record<string, string>;
      const deviceType = this.parseDeviceType(hash.deviceType);
      devices.push({
        socketId,
        deviceType,
        connectedAt: hash.connectedAt ?? new Date(0).toISOString(),
      });
    }
    return devices;
  }

  /**
   * Transaction: last seen update (TRANSACTIONS.md §3).
   * Prisma durable write, then Redis cache mirror.
   */
  async setLastSeen(userId: string, at: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastSeenAt: at },
    });

    const iso = at.toISOString();
    await this.redis
      .pipeline()
      .hset(this.userKey(userId), "lastSeenAt", iso)
      .set(this.lastSeenKey(userId), iso, "EX", LAST_SEEN_CACHE_TTL_SEC)
      .expire(this.userKey(userId), LAST_SEEN_CACHE_TTL_SEC)
      .exec();
  }

  async getLastSeen(userId: string): Promise<Date | null> {
    const cached =
      (await this.redis.hget(this.userKey(userId), "lastSeenAt")) ??
      (await this.redis.get(this.lastSeenKey(userId)));
    if (cached) {
      return new Date(cached);
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { lastSeenAt: true },
    });
    if (user?.lastSeenAt) {
      const iso = user.lastSeenAt.toISOString();
      await this.redis
        .pipeline()
        .hset(this.userKey(userId), "lastSeenAt", iso)
        .set(this.lastSeenKey(userId), iso, "EX", LAST_SEEN_CACHE_TTL_SEC)
        .exec();
    }
    return user?.lastSeenAt ?? null;
  }

  async getPrefs(userId: string): Promise<PresencePrefsRecord | null> {
    const [privacy, preferredStatus] = await this.redis.hmget(
      this.userKey(userId),
      "privacy",
      "preferredStatus"
    );
    if (privacy && preferredStatus) {
      return {
        privacy: this.parsePrivacy(privacy),
        preferredStatus: this.parsePreferred(preferredStatus),
      };
    }
    return this.loadPrefsFromDb(userId);
  }

  /**
   * Transaction: status change (TRANSACTIONS.md §1).
   */
  async updatePreferredStatus(
    userId: string,
    status: PresencePreferredStatus
  ): Promise<PresencePrefsRecord> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { presencePreferredStatus: status },
      select: {
        presencePrivacy: true,
        presencePreferredStatus: true,
      },
    });
    const prefs: PresencePrefsRecord = {
      privacy: updated.presencePrivacy,
      preferredStatus: updated.presencePreferredStatus,
    };
    await this.cachePrefs(userId, prefs);
    return prefs;
  }

  /**
   * Transaction: privacy update (TRANSACTIONS.md §2).
   */
  async updatePrivacy(
    userId: string,
    privacy: PresencePrivacy
  ): Promise<PresencePrefsRecord> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { presencePrivacy: privacy },
      select: {
        presencePrivacy: true,
        presencePreferredStatus: true,
      },
    });
    const prefs: PresencePrefsRecord = {
      privacy: updated.presencePrivacy,
      preferredStatus: updated.presencePreferredStatus,
    };
    await this.cachePrefs(userId, prefs);
    return prefs;
  }

  async ensurePrefsCached(userId: string): Promise<PresencePrefsRecord> {
    const existing = await this.getPrefs(userId);
    if (existing) {
      return existing;
    }
    const defaults: PresencePrefsRecord = {
      privacy: "EVERYONE",
      preferredStatus: "ONLINE",
    };
    await this.cachePrefs(userId, defaults);
    return defaults;
  }

  async areContacts(viewerId: string, targetUserId: string): Promise<boolean> {
    if (viewerId === targetUserId) {
      return true;
    }
    const row = await this.prisma.conversationMember.findFirst({
      where: {
        userId: viewerId,
        leftAt: null,
        deletedAt: null,
        conversation: {
          type: "DIRECT",
          deletedAt: null,
          members: {
            some: {
              userId: targetUserId,
              leftAt: null,
              deletedAt: null,
            },
          },
        },
      },
      select: { id: true },
    });
    return Boolean(row);
  }

  async userExists(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true },
    });
    return Boolean(user);
  }

  async isActiveConversationMember(
    userId: string,
    conversationId: string
  ): Promise<boolean> {
    const row = await this.prisma.conversationMember.findFirst({
      where: {
        userId,
        conversationId,
        leftAt: null,
        deletedAt: null,
        conversation: {
          deletedAt: null,
          status: "ACTIVE",
        },
      },
      select: { id: true },
    });
    return Boolean(row);
  }

  async startTyping(
    userId: string,
    conversationId: string,
    ttlMs: number
  ): Promise<TypingStartResult> {
    const key = this.typingKey(conversationId, userId);
    const result = await this.redis.set(key, "1", "PX", ttlMs, "NX");
    if (result === "OK") {
      await this.redis.incr(TYPING_USERS_KEY);
      return { started: true, duplicate: false };
    }
    // Refresh TTL on duplicate; do not rebroadcast.
    await this.redis.pexpire(key, ttlMs);
    return { started: false, duplicate: true };
  }

  async stopTyping(
    userId: string,
    conversationId: string
  ): Promise<TypingStopResult> {
    const key = this.typingKey(conversationId, userId);
    const deleted = await this.redis.del(key);
    if (deleted > 0) {
      const next = await this.redis.decr(TYPING_USERS_KEY);
      if (next < 0) {
        await this.redis.set(TYPING_USERS_KEY, "0");
      }
      return { stopped: true };
    }
    return { stopped: false };
  }

  async isTyping(userId: string, conversationId: string): Promise<boolean> {
    return (await this.redis.exists(this.typingKey(conversationId, userId))) === 1;
  }

  async getOnlineUserCount(): Promise<number> {
    return this.redis.scard(ONLINE_USERS_KEY);
  }

  async getActiveDeviceCount(): Promise<number> {
    const raw = await this.redis.get(ACTIVE_DEVICES_KEY);
    return Math.max(0, Number(raw ?? 0));
  }

  async adjustTypingGauge(delta: number): Promise<number> {
    if (delta >= 0) {
      return this.redis.incrby(TYPING_USERS_KEY, delta);
    }
    const next = await this.redis.decrby(TYPING_USERS_KEY, Math.abs(delta));
    if (next < 0) {
      await this.redis.set(TYPING_USERS_KEY, "0");
      return 0;
    }
    return next;
  }

  async getTypingUserCount(): Promise<number> {
    const raw = await this.redis.get(TYPING_USERS_KEY);
    return Math.max(0, Number(raw ?? 0));
  }

  async reconcilePresenceGauges(): Promise<{
    removedOnline: number;
    deviceCount: number;
  }> {
    const members = await this.redis.smembers(ONLINE_USERS_KEY);
    let removedOnline = 0;
    let deviceCount = 0;
    for (const userId of members) {
      const count = await this.redis.scard(this.devicesKey(userId));
      if (count <= 0) {
        await this.redis.srem(ONLINE_USERS_KEY, userId);
        removedOnline += 1;
      } else {
        deviceCount += count;
      }
    }
    await this.redis.set(ACTIVE_DEVICES_KEY, String(deviceCount));

    // Repair typing gauge drift from TTL expiry (keys gone, counter not DECR'd).
    let typingCount = 0;
    let cursor = "0";
    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        "MATCH",
        "typing:*",
        "COUNT",
        200
      );
      cursor = next;
      typingCount += keys.length;
    } while (cursor !== "0");
    await this.redis.set(TYPING_USERS_KEY, String(typingCount));

    return { removedOnline, deviceCount };
  }

  private async loadPrefsFromDb(
    userId: string
  ): Promise<PresencePrefsRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        presencePrivacy: true,
        presencePreferredStatus: true,
      },
    });
    if (!user) {
      return null;
    }
    const prefs: PresencePrefsRecord = {
      privacy: user.presencePrivacy,
      preferredStatus: user.presencePreferredStatus,
    };
    await this.cachePrefs(userId, prefs);
    return prefs;
  }

  private async cachePrefs(
    userId: string,
    prefs: PresencePrefsRecord
  ): Promise<void> {
    await this.redis
      .pipeline()
      .hset(
        this.userKey(userId),
        "privacy",
        prefs.privacy,
        "preferredStatus",
        prefs.preferredStatus
      )
      .expire(this.userKey(userId), PREFS_CACHE_TTL_SEC)
      .exec();
  }

  private parsePrivacy(value: string): PresencePrivacy {
    if (value === "CONTACTS" || value === "NOBODY" || value === "EVERYONE") {
      return value;
    }
    return "EVERYONE";
  }

  private parsePreferred(value: string): PresencePreferredStatus {
    if (value === "AWAY" || value === "INVISIBLE" || value === "ONLINE") {
      return value;
    }
    return "ONLINE";
  }

  private parseDeviceType(value: string | undefined): PresenceDeviceType {
    if (
      value === "phone" ||
      value === "tablet" ||
      value === "desktop" ||
      value === "browser"
    ) {
      return value;
    }
    return "browser";
  }

  private userKey(userId: string): string {
    return `presence:user:${userId}`;
  }

  private devicesKey(userId: string): string {
    return `presence:devices:${userId}`;
  }

  private deviceMetaKey(socketId: string): string {
    return `presence:device:${socketId}`;
  }

  private lastSeenKey(userId: string): string {
    return `presence:lastseen:${userId}`;
  }

  private typingKey(conversationId: string, userId: string): string {
    return `typing:${conversationId}:${userId}`;
  }
}
