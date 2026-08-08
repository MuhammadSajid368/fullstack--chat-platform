import { describe, expect, it, vi } from "vitest";
import { HealthService } from "../src/shared/services/HealthService.js";
import type { AppConfig } from "../src/config/index.js";

const config = {
  version: "0.1.0",
} as AppConfig;

describe("HealthService", () => {
  it("getLiveness never touches prisma or redis", () => {
    const prisma = {
      $queryRaw: vi.fn(),
    };
    const redis = {
      ping: vi.fn(),
    };

    const service = new HealthService(
      config,
      prisma as never,
      redis as never
    );

    const report = service.getLiveness();

    expect(report.status).toBe("ok");
    expect(report.version).toBe("0.1.0");
    expect(typeof report.uptimeSeconds).toBe("number");
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(redis.ping).not.toHaveBeenCalled();
  });

  it("getReadiness checks postgres and redis", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
    };
    const redis = {
      ping: vi.fn().mockResolvedValue("PONG"),
    };

    const service = new HealthService(
      config,
      prisma as never,
      redis as never
    );

    const report = await service.getReadiness();

    expect(report.ready).toBe(true);
    expect(report.status).toBe("ok");
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(redis.ping).toHaveBeenCalledOnce();
  });

  it("getReadiness marks down when postgres fails", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockRejectedValue(new Error("db down")),
    };
    const redis = {
      ping: vi.fn().mockResolvedValue("PONG"),
    };

    const service = new HealthService(
      config,
      prisma as never,
      redis as never
    );

    const report = await service.getReadiness();
    expect(report.ready).toBe(false);
    expect(report.status).toBe("down");
  });
});
