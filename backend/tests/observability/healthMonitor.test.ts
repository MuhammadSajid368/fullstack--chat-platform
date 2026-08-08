import { describe, expect, it } from "vitest";
import pino from "pino";
import { HealthMonitor } from "../../src/observability/health/HealthMonitor.js";

function silentLogger() {
  return pino({ level: "silent" });
}

describe("HealthMonitor", () => {
  it("liveness never touches dependencies", () => {
    const monitor = new HealthMonitor({
      version: "1.0.0",
      startupTimeoutMs: 10_000,
      logger: silentLogger(),
    });
    const liveness = monitor.getLiveness();
    expect(liveness.status).toBe("ok");
    expect(liveness.version).toBe("1.0.0");
    expect(typeof liveness.uptimeSeconds).toBe("number");
    expect(liveness.timestamp).toMatch(/T.*Z$/);
  });

  it("readiness aggregates ok when all critical checks pass", async () => {
    const monitor = new HealthMonitor({
      version: "1.0.0",
      startupTimeoutMs: 10_000,
      logger: silentLogger(),
    });

    monitor.registerCheck({
      name: "postgres",
      critical: true,
      includeIn: ["readiness"],
      check: async () => ({ name: "postgres", status: "ok", latencyMs: 3 }),
    });
    monitor.registerCheck({
      name: "redis",
      critical: true,
      includeIn: ["readiness"],
      check: async () => ({ name: "redis", status: "ok", latencyMs: 1 }),
    });

    const report = await monitor.getReadiness();
    expect(report.ready).toBe(true);
    expect(report.status).toBe("ok");
    expect(report.components).toHaveLength(2);
  });

  it("readiness is down when any critical check is down", async () => {
    const monitor = new HealthMonitor({
      version: "1.0.0",
      startupTimeoutMs: 10_000,
      logger: silentLogger(),
    });
    monitor.registerCheck({
      name: "postgres",
      critical: true,
      includeIn: ["readiness"],
      check: async () => ({
        name: "postgres",
        status: "down",
        detail: "connection refused",
      }),
    });
    monitor.registerCheck({
      name: "redis",
      critical: true,
      includeIn: ["readiness"],
      check: async () => ({ name: "redis", status: "ok" }),
    });

    const report = await monitor.getReadiness();
    expect(report.ready).toBe(false);
    expect(report.status).toBe("down");
  });

  it("non-critical down keeps readiness at degraded", async () => {
    const monitor = new HealthMonitor({
      version: "1.0.0",
      startupTimeoutMs: 10_000,
      logger: silentLogger(),
    });
    monitor.registerCheck({
      name: "postgres",
      critical: true,
      includeIn: ["readiness"],
      check: async () => ({ name: "postgres", status: "ok" }),
    });
    monitor.registerCheck({
      name: "bullmq_workers",
      critical: false,
      includeIn: ["readiness"],
      check: async () => ({
        name: "bullmq_workers",
        status: "down",
        detail: "workers stale",
      }),
    });

    const report = await monitor.getReadiness();
    expect(report.status).toBe("degraded");
    expect(report.ready).toBe(false);
  });

  it("startup returns degraded until markStartupComplete", async () => {
    const monitor = new HealthMonitor({
      version: "1.0.0",
      startupTimeoutMs: 60_000,
      logger: silentLogger(),
    });
    monitor.registerCheck({
      name: "postgres",
      critical: true,
      includeIn: ["startup", "readiness"],
      check: async () => ({ name: "postgres", status: "ok" }),
    });

    const before = await monitor.getStartup();
    expect(before.started).toBe(false);
    expect(before.status).toBe("degraded");

    monitor.markStartupComplete();
    const after = await monitor.getStartup();
    expect(after.started).toBe(true);
    expect(after.status).toBe("ok");
  });

  it("startup reports down after configured timeout", async () => {
    let now = 1_000_000;
    const monitor = new HealthMonitor({
      version: "1.0.0",
      startupTimeoutMs: 1_000,
      logger: silentLogger(),
      clock: () => now,
    });
    now += 5_000;
    const report = await monitor.getStartup();
    expect(report.started).toBe(false);
    expect(report.status).toBe("down");
  });

  it("check exceptions are converted to down components", async () => {
    const monitor = new HealthMonitor({
      version: "1.0.0",
      startupTimeoutMs: 10_000,
      logger: silentLogger(),
    });
    monitor.registerCheck({
      name: "flaky",
      critical: false,
      includeIn: ["readiness"],
      check: async () => {
        throw new Error("boom");
      },
    });
    const report = await monitor.getReadiness();
    expect(report.components[0]?.status).toBe("down");
    expect(report.components[0]?.detail).toContain("boom");
  });
});
