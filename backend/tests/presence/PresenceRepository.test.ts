import { describe, expect, it, beforeEach, vi } from "vitest";
import { PresenceRepository } from "../../src/modules/presence/repository/PresenceRepository.js";
import { createFakeRedis } from "../websocket/fakeRedis.js";

describe("PresenceRepository", () => {
  let prisma: {
    user: {
      update: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
    conversationMember: { findFirst: ReturnType<typeof vi.fn> };
  };
  let repo: PresenceRepository;

  beforeEach(() => {
    prisma = {
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
    repo = new PresenceRepository(prisma as never, createFakeRedis());
  });

  it("addDevice is O(1) and tracks multi-device counts", async () => {
    const a = await repo.addDevice("u1", "s1", "phone");
    expect(a.becameOnline).toBe(true);
    expect(a.deviceCount).toBe(1);

    const b = await repo.addDevice("u1", "s2", "tablet");
    expect(b.becameOnline).toBe(false);
    expect(b.deviceCount).toBe(2);
    expect(await repo.getOnlineUserCount()).toBe(1);
    expect(await repo.getActiveDeviceCount()).toBe(2);
  });

  it("removeDevice goes offline only on last device", async () => {
    await repo.addDevice("u1", "s1", "phone");
    await repo.addDevice("u1", "s2", "desktop");
    const first = await repo.removeDevice("u1", "s1");
    expect(first.becameOffline).toBe(false);
    expect(first.deviceCount).toBe(1);

    const last = await repo.removeDevice("u1", "s2");
    expect(last.becameOffline).toBe(true);
    expect(last.deviceCount).toBe(0);
    expect(await repo.getOnlineUserCount()).toBe(0);
  });

  it("duplicate remove is safe", async () => {
    await repo.addDevice("u1", "s1", "browser");
    await repo.removeDevice("u1", "s1");
    const again = await repo.removeDevice("u1", "s1");
    expect(again.removed).toBe(false);
    expect(again.becameOffline).toBe(false);
  });

  it("typing NX ignores duplicates and stop decrements gauge", async () => {
    const first = await repo.startTyping("u1", "c1", 5_000);
    expect(first.started).toBe(true);
    const dup = await repo.startTyping("u1", "c1", 5_000);
    expect(dup.duplicate).toBe(true);
    expect(await repo.getTypingUserCount()).toBe(1);

    const stopped = await repo.stopTyping("u1", "c1");
    expect(stopped.stopped).toBe(true);
    expect(await repo.getTypingUserCount()).toBe(0);
  });

  it("setLastSeen writes Prisma then caches", async () => {
    const at = new Date("2026-07-15T12:00:00.000Z");
    await repo.setLastSeen("u1", at);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: { lastSeenAt: at },
      })
    );
    expect(await repo.getLastSeen("u1")).toEqual(at);
  });

  it("areContacts uses DIRECT membership query", async () => {
    expect(await repo.areContacts("u1", "u2")).toBe(true);
    prisma.conversationMember.findFirst.mockResolvedValueOnce(null);
    expect(await repo.areContacts("u1", "u3")).toBe(false);
  });

  it("pipelines listDevices without N+1 round-trips per field", async () => {
    await repo.addDevice("u1", "s1", "phone");
    await repo.addDevice("u1", "s2", "desktop");
    const devices = await repo.listDevices("u1");
    expect(devices).toHaveLength(2);
    expect(devices.map((d) => d.deviceType).sort()).toEqual([
      "desktop",
      "phone",
    ]);
  });
});
