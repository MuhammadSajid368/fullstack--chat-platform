import { describe, expect, it, vi, beforeEach } from "vitest";
import pino from "pino";
import { PresenceService } from "../../src/modules/presence/service/PresenceService.js";
import { PresenceRepository } from "../../src/modules/presence/repository/PresenceRepository.js";
import { EventPublisher } from "../../src/websocket/EventPublisher.js";
import { RealtimeEvents } from "../../src/websocket/events.js";
import { createFakeRedis } from "./fakeRedis.js";

function createPrismaMock() {
  return {
    user: {
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        presencePrivacy: data.presencePrivacy ?? "EVERYONE",
        presencePreferredStatus: data.presencePreferredStatus ?? "ONLINE",
        lastSeenAt: data.lastSeenAt ?? null,
      })),
      findUnique: vi.fn().mockResolvedValue({
        lastSeenAt: null,
        presencePrivacy: "EVERYONE",
        presencePreferredStatus: "ONLINE",
      }),
      findFirst: vi.fn().mockResolvedValue({ id: "u1" }),
    },
    conversationMember: {
      findFirst: vi.fn().mockResolvedValue({ id: "cm1" }),
    },
  };
}

describe("PresenceService", () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let events: EventPublisher;
  let emit: ReturnType<typeof vi.fn>;
  let service: PresenceService;

  beforeEach(() => {
    prisma = createPrismaMock();
    events = new EventPublisher();
    emit = vi.fn();
    events.bind(emit);
    const redis = createFakeRedis();
    const repo = new PresenceRepository(prisma as never, redis);
    service = new PresenceService(repo, events, pino({ level: "silent" }));
  });

  it("marks online and publishes presence.online on first device", async () => {
    const snap = await service.markOnline("u1", "s1", {
      socketId: "s1",
      deviceType: "phone",
    });
    expect(snap.status).toBe("ONLINE");
    expect(snap.deviceCount).toBe(1);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ name: RealtimeEvents.PRESENCE_ONLINE })
    );
  });

  it("supports multiple devices without re-broadcasting online", async () => {
    await service.markOnline("u1", "s1", { socketId: "s1", deviceType: "phone" });
    emit.mockClear();
    const snap = await service.markOnline("u1", "s2", {
      socketId: "s2",
      deviceType: "desktop",
    });
    expect(snap.deviceCount).toBe(2);
    expect(emit).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: RealtimeEvents.PRESENCE_ONLINE })
    );
  });

  it("publishes offline + lastSeen when last device disconnects", async () => {
    await service.markOnline("u1", "s1", { socketId: "s1", deviceType: "browser" });
    await service.markOnline("u1", "s2", { socketId: "s2", deviceType: "tablet" });
    emit.mockClear();

    await service.markOffline("u1", "s1");
    expect(emit).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: RealtimeEvents.PRESENCE_OFFLINE })
    );

    const snap = await service.markOffline("u1", "s2");
    expect(snap.status).toBe("OFFLINE");
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ name: RealtimeEvents.PRESENCE_OFFLINE })
    );
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ name: RealtimeEvents.PRESENCE_LAST_SEEN })
    );
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it("never broadcasts ONLINE when preferred status is INVISIBLE", async () => {
    prisma.user.findUnique.mockResolvedValue({
      lastSeenAt: null,
      presencePrivacy: "EVERYONE",
      presencePreferredStatus: "INVISIBLE",
    });
    await service.markOnline("u1", "s1", { socketId: "s1", deviceType: "phone" });
    expect(emit).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: RealtimeEvents.PRESENCE_ONLINE })
    );
    const mine = await service.getMyPresence("u1");
    expect(mine.status).toBe("INVISIBLE");
  });

  it("idempotent duplicate disconnect does not re-broadcast offline", async () => {
    await service.markOnline("u1", "s1", { socketId: "s1", deviceType: "browser" });
    await service.markOffline("u1", "s1");
    emit.mockClear();
    await service.markOffline("u1", "s1");
    expect(emit).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: RealtimeEvents.PRESENCE_OFFLINE })
    );
  });

  it("respects NOBODY privacy for viewers", async () => {
    prisma.user.findUnique.mockResolvedValue({
      lastSeenAt: new Date("2026-01-01T00:00:00.000Z"),
      presencePrivacy: "NOBODY",
      presencePreferredStatus: "ONLINE",
    });
    await service.markOnline("u1", "s1", { socketId: "s1", deviceType: "phone" });
    const dto = await service.getPresenceForViewer("u2", "u1");
    expect(dto.status).toBe("OFFLINE");
    expect(dto.lastSeenAt).toBeNull();
  });

  it("ignores duplicate typing.start and auto-stops after timeout", async () => {
    vi.useFakeTimers();
    await service.startTyping("u1", "c1", "sock_1");
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RealtimeEvents.TYPING_STARTED,
        exceptSocketId: "sock_1",
      })
    );
    emit.mockClear();
    const dup = await service.startTyping("u1", "c1", "sock_1");
    expect(dup.published).toBe(false);
    expect(emit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5_000);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ name: RealtimeEvents.TYPING_STOPPED })
    );
    service.dispose();
    vi.useRealTimers();
  });

  it("status transition INVISIBLE suppresses then restores ONLINE", async () => {
    await service.markOnline("u1", "s1", { socketId: "s1", deviceType: "desktop" });
    emit.mockClear();
    await service.setStatus("u1", "INVISIBLE");
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ name: RealtimeEvents.PRESENCE_OFFLINE })
    );
    emit.mockClear();
    await service.setStatus("u1", "ONLINE");
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ name: RealtimeEvents.PRESENCE_ONLINE })
    );
  });
});
