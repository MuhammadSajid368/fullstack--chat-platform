import type { Logger } from "pino";
import {
  ForbiddenError,
  NotFoundError,
} from "@common/errors/index.js";
import type {
  DeviceConnectInput,
  PresenceClientContext,
  PresenceDto,
  PresencePreferredStatus,
  PresencePrivacy,
  PresenceStatus,
} from "@modules/presence/dto/PresenceDto.js";
import type { IPresenceRepository } from "@modules/presence/interfaces/IPresenceRepository.js";
import type { IPresenceService } from "@modules/presence/interfaces/IPresenceService.js";
import { PresenceMapper } from "@modules/presence/mapper/PresenceMapper.js";
import type { PresenceMetrics } from "@observability/metrics/presenceMetrics.js";
import {
  conversationRoom,
  presenceRoom,
  RealtimeEvents,
  userRoom,
} from "@websocket/events.js";
import type { IEventPublisher } from "@websocket/EventPublisher.js";

const TYPING_TTL_MS = 5_000;

/**
 * Presence service — online state, lastSeen, typing, privacy, multi-device.
 * Redis is live SoT; Prisma stores lastSeen + prefs. Controllers stay thin.
 */
export class PresenceService implements IPresenceService {
  private readonly localTypingTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    protected readonly repository: IPresenceRepository,
    protected readonly events: IEventPublisher,
    protected readonly logger: Logger,
    protected readonly metrics: PresenceMetrics | null = null
  ) {}

  async markOnline(
    userId: string,
    socketId: string,
    input?: DeviceConnectInput
  ): Promise<PresenceDto> {
    const deviceType = input?.deviceType ?? "browser";
    const prefs = await this.repository.ensurePrefsCached(userId);
    const result = await this.repository.addDevice(
      userId,
      socketId,
      deviceType
    );
    const lastSeenAt = await this.repository.getLastSeen(userId);

    const snapshot = await this.selfSnapshot(userId, prefs);

    if (result.becameOnline && prefs.preferredStatus !== "INVISIBLE") {
      this.publishPresence(RealtimeEvents.PRESENCE_ONLINE, userId, {
        userId,
        status: PresenceMapper.visibleStatus(
          result.deviceCount,
          prefs.preferredStatus
        ),
        lastSeenAt: lastSeenAt?.toISOString() ?? null,
      });
      this.metrics?.recordPresenceChange("online");
    }

    await this.syncGauges();

    this.logger.info(
      { userId, socketId, deviceType, deviceCount: result.deviceCount },
      "Presence online"
    );

    return snapshot;
  }

  async markOffline(
    userId: string,
    socketId: string
  ): Promise<PresenceDto> {
    const prefs = await this.repository.ensurePrefsCached(userId);
    const result = await this.repository.removeDevice(userId, socketId);
    let lastSeenAt = await this.repository.getLastSeen(userId);

    if (result.becameOffline) {
      const now = new Date();
      await this.repository.setLastSeen(userId, now);
      lastSeenAt = now;

      if (prefs.preferredStatus !== "INVISIBLE") {
        this.publishPresence(RealtimeEvents.PRESENCE_OFFLINE, userId, {
          userId,
          status: "OFFLINE",
          lastSeenAt: now.toISOString(),
        });
        this.publishPresence(RealtimeEvents.PRESENCE_LAST_SEEN, userId, {
          userId,
          lastSeenAt: now.toISOString(),
        });
        this.metrics?.recordPresenceChange("offline");
      } else {
        // Invisible users still update lastSeen durably; no ONLINE/OFFLINE fan-out.
        this.metrics?.recordPresenceChange("offline");
      }
    }

    await this.syncGauges();

    this.logger.info(
      { userId, socketId, deviceCount: result.deviceCount },
      "Presence offline update"
    );

    return this.selfSnapshot(userId, prefs, lastSeenAt);
  }

  async heartbeat(userId: string, socketId?: string): Promise<void> {
    const beforeCount = await this.repository.getDeviceCount(userId);
    await this.repository.refreshTtl(userId, socketId);
    const afterCount = await this.repository.getDeviceCount(userId);

    // Redis TTL can expire while the socket is still connected; re-announce online.
    if (beforeCount <= 0 && afterCount > 0) {
      const prefs = await this.repository.ensurePrefsCached(userId);
      if (prefs.preferredStatus !== "INVISIBLE") {
        const lastSeenAt = await this.repository.getLastSeen(userId);
        this.publishPresence(RealtimeEvents.PRESENCE_ONLINE, userId, {
          userId,
          status: PresenceMapper.visibleStatus(
            afterCount,
            prefs.preferredStatus
          ),
          lastSeenAt: lastSeenAt?.toISOString() ?? null,
        });
        this.metrics?.recordPresenceChange("online");
      }
    }
  }

  async getMyPresence(userId: string): Promise<PresenceDto> {
    const prefs = await this.repository.ensurePrefsCached(userId);
    return this.selfSnapshot(userId, prefs);
  }

  async getPresenceForViewer(
    viewerId: string,
    targetUserId: string
  ): Promise<PresenceDto> {
    if (viewerId === targetUserId) {
      return this.getMyPresence(viewerId);
    }

    const exists = await this.repository.userExists(targetUserId);
    if (!exists) {
      throw new NotFoundError("User not found");
    }

    const prefs = await this.repository.ensurePrefsCached(targetUserId);
    const allowed = await this.canObserve(viewerId, targetUserId, prefs.privacy);
    const deviceCount = await this.repository.getDeviceCount(targetUserId);
    const lastSeenRaw = await this.repository.getLastSeen(targetUserId);

    if (!allowed) {
      return PresenceMapper.toViewerDto(
        targetUserId,
        "OFFLINE",
        null,
        prefs.privacy,
        prefs.preferredStatus
      );
    }

    const status = PresenceMapper.visibleStatus(
      deviceCount,
      prefs.preferredStatus
    );
    const lastSeenAt = this.filterLastSeen(
      lastSeenRaw,
      prefs.privacy,
      status
    );

    return PresenceMapper.toViewerDto(
      targetUserId,
      status,
      lastSeenAt,
      prefs.privacy,
      prefs.preferredStatus
    );
  }

  async setStatus(
    userId: string,
    status: PresencePreferredStatus,
    context?: PresenceClientContext
  ): Promise<PresenceDto> {
    const previous = await this.repository.ensurePrefsCached(userId);
    const prefs = await this.repository.updatePreferredStatus(userId, status);
    const deviceCount = await this.repository.getDeviceCount(userId);
    const lastSeenAt = await this.repository.getLastSeen(userId);

    if (deviceCount > 0) {
      await this.emitStatusTransition(
        userId,
        previous.preferredStatus,
        prefs.preferredStatus,
        deviceCount,
        lastSeenAt
      );
    }

    this.metrics?.recordPresenceChange("status");
    this.logger.info(
      { userId, status, requestId: context?.requestId },
      "Presence status updated"
    );

    return this.selfSnapshot(userId, prefs, lastSeenAt);
  }

  async setPrivacy(
    userId: string,
    privacy: PresencePrivacy,
    context?: PresenceClientContext
  ): Promise<PresenceDto> {
    const prefs = await this.repository.updatePrivacy(userId, privacy);
    const deviceCount = await this.repository.getDeviceCount(userId);
    const lastSeenAt = await this.repository.getLastSeen(userId);
    const visible = PresenceMapper.visibleStatus(
      deviceCount,
      prefs.preferredStatus
    );

    this.publishPresence(RealtimeEvents.PRESENCE_STATUS_CHANGED, userId, {
      userId,
      status: visible,
      privacy,
      lastSeenAt: lastSeenAt?.toISOString() ?? null,
    });

    this.metrics?.recordPresenceChange("privacy");
    this.logger.info(
      { userId, privacy, requestId: context?.requestId },
      "Presence privacy updated"
    );

    return this.selfSnapshot(userId, prefs, lastSeenAt);
  }

  async subscribe(
    viewerId: string,
    targetUserId: string
  ): Promise<{ allowed: boolean; presence: PresenceDto }> {
    const presence = await this.getPresenceForViewer(viewerId, targetUserId);
    const prefs = await this.repository.ensurePrefsCached(targetUserId);
    const allowed = await this.canObserve(
      viewerId,
      targetUserId,
      prefs.privacy
    );
    return { allowed, presence };
  }

  async startTyping(
    userId: string,
    conversationId: string,
    exceptSocketId?: string
  ): Promise<{ published: boolean }> {
    const result = await this.repository.startTyping(
      userId,
      conversationId,
      TYPING_TTL_MS
    );
    this.resetTypingTimer(userId, conversationId, exceptSocketId);

    if (result.duplicate) {
      this.logger.debug(
        { userId, conversationId },
        "typing.start ignored duplicate"
      );
      return { published: false };
    }

    this.events.publish({
      name: RealtimeEvents.TYPING_STARTED,
      rooms: [conversationRoom(conversationId)],
      payload: { conversationId, userId },
      exceptSocketId,
    });
    this.metrics?.recordTypingChange("start");
    await this.syncGauges();

    this.logger.debug({ userId, conversationId }, "typing.start");
    return { published: true };
  }

  async stopTyping(
    userId: string,
    conversationId: string,
    exceptSocketId?: string
  ): Promise<{ published: boolean }> {
    this.clearTypingTimer(userId, conversationId);
    const result = await this.repository.stopTyping(userId, conversationId);

    if (!result.stopped && !exceptSocketId) {
      return { published: false };
    }

    if (result.stopped || exceptSocketId) {
      this.events.publish({
        name: RealtimeEvents.TYPING_STOPPED,
        rooms: [conversationRoom(conversationId)],
        payload: { conversationId, userId },
        exceptSocketId,
      });
    }

    if (result.stopped) {
      this.metrics?.recordTypingChange("stop");
      await this.syncGauges();
    }

    this.logger.debug({ userId, conversationId }, "typing.stop");
    return { published: result.stopped };
  }

  async assertConversationMember(
    userId: string,
    conversationId: string
  ): Promise<void> {
    const ok = await this.repository.isActiveConversationMember(
      userId,
      conversationId
    );
    if (!ok) {
      throw new ForbiddenError("FORBIDDEN");
    }
  }

  async getManyForViewer(
    viewerId: string,
    userIds: string[]
  ): Promise<Record<string, PresenceDto>> {
    const unique = [...new Set(userIds.filter(Boolean))];
    const result: Record<string, PresenceDto> = {};
    await Promise.all(
      unique.map(async (id) => {
        try {
          result[id] = await this.getPresenceForViewer(viewerId, id);
        } catch {
          // Skip missing users in bulk lookups.
        }
      })
    );
    return result;
  }

  dispose(): void {
    for (const timer of this.localTypingTimers.values()) {
      clearTimeout(timer);
    }
    this.localTypingTimers.clear();
  }

  private async emitStatusTransition(
    userId: string,
    previous: PresencePreferredStatus,
    next: PresencePreferredStatus,
    deviceCount: number,
    lastSeenAt: Date | null
  ): Promise<void> {
    const lastSeenIso = lastSeenAt?.toISOString() ?? null;

    if (previous !== "INVISIBLE" && next === "INVISIBLE") {
      this.publishPresence(RealtimeEvents.PRESENCE_OFFLINE, userId, {
        userId,
        status: "OFFLINE",
        lastSeenAt: lastSeenIso,
      });
      return;
    }

    if (previous === "INVISIBLE" && next !== "INVISIBLE") {
      this.publishPresence(RealtimeEvents.PRESENCE_ONLINE, userId, {
        userId,
        status: PresenceMapper.visibleStatus(deviceCount, next),
        lastSeenAt: lastSeenIso,
      });
      return;
    }

    this.publishPresence(RealtimeEvents.PRESENCE_STATUS_CHANGED, userId, {
      userId,
      status: PresenceMapper.visibleStatus(deviceCount, next),
      lastSeenAt: lastSeenIso,
    });
  }

  private publishPresence(
    name: string,
    userId: string,
    payload: Record<string, unknown>
  ): void {
    this.events.publish({
      name,
      rooms: [presenceRoom(userId), userRoom(userId)],
      payload,
    });
  }

  private async canObserve(
    viewerId: string,
    targetUserId: string,
    privacy: PresencePrivacy
  ): Promise<boolean> {
    if (viewerId === targetUserId) {
      return true;
    }
    if (privacy === "NOBODY") {
      return false;
    }
    if (privacy === "EVERYONE") {
      return true;
    }
    return this.repository.areContacts(viewerId, targetUserId);
  }

  private filterLastSeen(
    lastSeenAt: Date | null,
    privacy: PresencePrivacy,
    visibleStatus: PresenceStatus
  ): Date | null {
    if (!lastSeenAt) {
      return null;
    }
    if (privacy === "NOBODY") {
      return null;
    }
    // When visibly online/away, lastSeen is less meaningful but still allowed by privacy.
    if (visibleStatus === "OFFLINE" || visibleStatus === "AWAY" || visibleStatus === "ONLINE") {
      return lastSeenAt;
    }
    return lastSeenAt;
  }

  private async selfSnapshot(
    userId: string,
    prefs: {
      privacy: PresencePrivacy;
      preferredStatus: PresencePreferredStatus;
    },
    lastSeenAt?: Date | null
  ): Promise<PresenceDto> {
    const deviceCount = await this.repository.getDeviceCount(userId);
    const devices = await this.repository.listDevices(userId);
    const seen =
      lastSeenAt !== undefined
        ? lastSeenAt
        : await this.repository.getLastSeen(userId);

    return PresenceMapper.toSelfDto(
      userId,
      { deviceCount, lastSeenAt: seen, online: deviceCount > 0 },
      prefs,
      devices.map((d) => PresenceMapper.toDeviceDto(d))
    );
  }

  private resetTypingTimer(
    userId: string,
    conversationId: string,
    exceptSocketId?: string
  ): void {
    this.clearTypingTimer(userId, conversationId);
    const key = `${conversationId}:${userId}`;
    const timer = setTimeout(() => {
      void this.stopTyping(userId, conversationId, exceptSocketId);
    }, TYPING_TTL_MS);
    this.localTypingTimers.set(key, timer);
  }

  private clearTypingTimer(userId: string, conversationId: string): void {
    const key = `${conversationId}:${userId}`;
    const existing = this.localTypingTimers.get(key);
    if (existing) {
      clearTimeout(existing);
      this.localTypingTimers.delete(key);
    }
  }

  private async syncGauges(): Promise<void> {
    if (!this.metrics) {
      return;
    }
    try {
      const [online, devices, typing] = await Promise.all([
        this.repository.getOnlineUserCount(),
        this.repository.getActiveDeviceCount(),
        this.repository.getTypingUserCount(),
      ]);
      this.metrics.setOnlineUsers(online);
      this.metrics.setActiveDevices(devices);
      this.metrics.setTypingUsers(typing);
    } catch (err) {
      this.logger.debug({ err }, "Presence gauge sync failed");
    }
  }

  async reconcileStalePresence(): Promise<{
    removedOnline: number;
    deviceCount: number;
  }> {
    const result = await this.repository.reconcilePresenceGauges();
    await this.syncGauges();
    this.logger.info(result, "Presence gauges reconciled");
    return result;
  }
}
