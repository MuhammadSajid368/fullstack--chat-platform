import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { MetricsFacade } from "../../src/observability/metrics/index.js";
import { createMetricsRouter } from "../../src/observability/middleware/metricsRoute.js";
import { createMonitoringMiddleware } from "../../src/observability/middleware/monitoringMiddleware.js";

const disposables: MetricsFacade[] = [];

function build(routePath = "/metrics") {
  const metrics = new MetricsFacade();
  disposables.push(metrics);
  metrics.enableDefaultCollectors();

  const app = express();
  app.use(createMetricsRouter(metrics, routePath));
  app.use(createMonitoringMiddleware({ metrics }));

  app.get("/api/ping", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.get("/api/boom", (_req, res) => {
    res.status(500).json({ err: "oops" });
  });

  return { app, metrics };
}

afterEach(() => {
  while (disposables.length > 0) {
    disposables.pop()?.dispose();
  }
});

describe("metrics endpoint", () => {
  it("responds with prometheus content type", async () => {
    const { app, metrics } = build();
    const res = await request(app).get("/metrics");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.text.length).toBeGreaterThan(0);
    expect(metrics).toBeDefined();
  });

  it("records http request metrics and errors after regular traffic", async () => {
    const { app } = build();

    await request(app).get("/api/ping").expect(200);
    await request(app).get("/api/ping").expect(200);
    await request(app).get("/api/boom").expect(500);

    const metricsRes = await request(app).get("/metrics").expect(200);
    expect(metricsRes.text).toContain("chat_backend_http_requests_total");
    expect(metricsRes.text).toMatch(/status_code="200"/);
    expect(metricsRes.text).toContain("chat_backend_http_request_errors_total");
    expect(metricsRes.text).toMatch(/status_code="500"/);
  });

  it("supports a customised route path", async () => {
    const { app } = build("/internal/metrics");
    const ok = await request(app).get("/internal/metrics");
    expect(ok.status).toBe(200);

    const missing = await request(app).get("/metrics");
    expect(missing.status).toBe(404);
  });
});
