import { describe, expect, it, vi } from "vitest";
import pino from "pino";
import { PresenceService } from "../../src/modules/presence/service/PresenceService.js";
import { PresenceRepository } from "../../src/modules/presence/repository/PresenceRepository.js";
import { EventPublisher } from "../../src/websocket/EventPublisher.js";
import { RealtimeEvents } from "../../src/websocket/events.js";
import { createFakeRedis } from "../websocket/fakeRedis.js";
import { MetricsFacade } from "../../src/observability/metrics/index.js";

describe("Presence concurrency & recovery", () => {
  function setup() {
    const prisma = {
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
    const events = new EventPublisher();
    const emit = vi.fn();
    events.bind(emit);
    const redis = createFakeRedis();
    const metrics = new MetricsFacade();
    const repo = new PresenceRepository(prisma as never, redis);
    const service = new PresenceService(
      repo,
      events,
      pino({ level: "silent" }),
      metrics.presence
    );
    return { service, emit, metrics, repo };
  }

  it("handles concurrent device connect/disconnect races", async () => {
    const { service } = setup();
    const sockets = Array.from({ length: 20 }, (_, i) => `s${i}`);
    await Promise.all(
      sockets.map((id) =>
        service.markOnline("u1", id, { socketId: id, deviceType: "browser" })
      )
    );
    const mid = await service.getMyPresence("u1");
    expect(mid.deviceCount).toBe(20);

    await Promise.all(sockets.map((id) => service.markOffline("u1", id)));
    const end = await service.getMyPresence("u1");
    expect(end.status).toBe("OFFLINE");
    expect(end.deviceCount).toBe(0);
  });

  it("reconnect after full disconnect re-broadcasts online once", async () => {
    const { service, emit } = setup();
    await service.markOnline("u1", "s1", { socketId: "s1", deviceType: "phone" });
    await service.markOffline("u1", "s1");
    emit.mockClear();
    await service.markOnline("u1", "s2", { socketId: "s2", deviceType: "phone" });
    expect(
      emit.mock.calls.filter((c) => c[0]?.name === RealtimeEvents.PRESENCE_ONLINE)
    ).toHaveLength(1);
  });

  it("updates presence metrics gauges", async () => {
    const { service, metrics } = setup();
    await service.markOnline("u1", "s1", { socketId: "s1", deviceType: "tablet" });
    await service.startTyping("u1", "c1", "s1");
    const rendered = await metrics.render();
    expect(rendered).toContain("chat_backend_presence_online_users");
    expect(rendered).toContain("chat_backend_presence_active_devices");
    expect(rendered).toContain("chat_backend_presence_typing_users");
    expect(rendered).toContain("chat_backend_presence_changes_total");
    service.dispose();
    metrics.dispose();
  });
});
