import express from "express";
import request from "supertest";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { HealthMonitor } from "../../src/observability/health/HealthMonitor.js";
import { createObservabilityHealthRoutes } from "../../src/observability/middleware/healthRoutes.js";

function buildApp(monitor: HealthMonitor) {
  const app = express();
  app.use(createObservabilityHealthRoutes(monitor));
  return app;
}

function silent() {
  return pino({ level: "silent" });
}

describe("health endpoints", () => {
  it("GET /health/live returns 200 with liveness payload", async () => {
    const monitor = new HealthMonitor({
      version: "2.0.0",
      startupTimeoutMs: 60_000,
      logger: silent(),
    });
    const res = await request(buildApp(monitor)).get("/health/live");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.version).toBe("2.0.0");
    expect(typeof res.body.uptimeSeconds).toBe("number");
  });

  it("GET /health/ready returns 200 when all critical checks pass", async () => {
    const monitor = new HealthMonitor({
      version: "1.0.0",
      startupTimeoutMs: 60_000,
      logger: silent(),
    });
    monitor.registerCheck({
      name: "postgres",
      critical: true,
      includeIn: ["readiness"],
      check: async () => ({ name: "postgres", status: "ok", latencyMs: 4 }),
    });
    monitor.registerCheck({
      name: "redis",
      critical: true,
      includeIn: ["readiness"],
      check: async () => ({ name: "redis", status: "ok", latencyMs: 1 }),
    });

    const res = await request(buildApp(monitor)).get("/health/ready");
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.status).toBe("ok");
    expect(res.body.components).toHaveLength(2);
  });

  it("GET /health/ready returns 503 when a critical check is down", async () => {
    const monitor = new HealthMonitor({
      version: "1.0.0",
      startupTimeoutMs: 60_000,
      logger: silent(),
    });
    monitor.registerCheck({
      name: "postgres",
      critical: true,
      includeIn: ["readiness"],
      check: async () => ({
        name: "postgres",
        status: "down",
        detail: "no route to host",
      }),
    });
    const res = await request(buildApp(monitor)).get("/health/ready");
    expect(res.status).toBe(503);
    expect(res.body.ready).toBe(false);
  });

  it("GET /health/startup returns 503 during boot and 200 after ready", async () => {
    const monitor = new HealthMonitor({
      version: "1.0.0",
      startupTimeoutMs: 60_000,
      logger: silent(),
    });
    monitor.registerCheck({
      name: "postgres",
      critical: true,
      includeIn: ["startup", "readiness"],
      check: async () => ({ name: "postgres", status: "ok" }),
    });
    const app = buildApp(monitor);

    const boot = await request(app).get("/health/startup");
    expect(boot.status).toBe(503);
    expect(boot.body.started).toBe(false);

    monitor.markStartupComplete();
    const ready = await request(app).get("/health/startup");
    expect(ready.status).toBe(200);
    expect(ready.body.started).toBe(true);
  });
});
