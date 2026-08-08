import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import pino from "pino";
import { TypingTracker } from "../../src/websocket/TypingTracker.js";
import { PresenceService } from "../../src/modules/presence/service/PresenceService.js";
import { PresenceRepository } from "../../src/modules/presence/repository/PresenceRepository.js";
import { EventPublisher } from "../../src/websocket/EventPublisher.js";
import { RealtimeEvents } from "../../src/websocket/events.js";
import { createFakeRedis } from "./fakeRedis.js";

describe("TypingTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function createPresence() {
    const prisma = {
      user: {
        update: vi.fn().mockResolvedValue({
          presencePrivacy: "EVERYONE",
          presencePreferredStatus: "ONLINE",
        }),
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
    const publisher = new EventPublisher();
    const emit = vi.fn();
    publisher.bind(emit);
    const redis = createFakeRedis();
    const repo = new PresenceRepository(prisma as never, redis);
    const presence = new PresenceService(
      repo,
      publisher,
      pino({ level: "silent" })
    );
    return { presence, emit, redis, publisher };
  }

  it("publishes start and auto-stops after TTL", async () => {
    const { presence, emit, redis } = createPresence();
    const tracker = new TypingTracker(
      redis,
      presence,
      pino({ level: "silent" }),
      5_000
    );

    await tracker.start("u1", "c1", "sock_1");
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RealtimeEvents.TYPING_STARTED,
        exceptSocketId: "sock_1",
      })
    );

    await vi.advanceTimersByTimeAsync(5_000);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RealtimeEvents.TYPING_STOPPED,
      })
    );

    tracker.dispose();
  });

  it("stop publishes typing.stopped", async () => {
    const { presence, emit, redis } = createPresence();
    const tracker = new TypingTracker(
      redis,
      presence,
      pino({ level: "silent" }),
      5_000
    );

    await tracker.start("u1", "c1");
    emit.mockClear();
    await tracker.stop("u1", "c1", "sock_1");
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: RealtimeEvents.TYPING_STOPPED,
        exceptSocketId: "sock_1",
      })
    );
    tracker.dispose();
  });
});
