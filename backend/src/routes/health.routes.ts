import { Router } from "express";
import { asyncHandler } from "@common/utils/asyncHandler.js";
import type { AppConfig } from "@config/index.js";
import { createOpsTokenAuth } from "@middleware/opsTokenAuth.js";
import type { IHealthService } from "@shared/interfaces/IHealthService.js";
import type { QueueHealthProvider } from "@jobs/index.js";

/**
 * Canonical operational probes — mounted once at the app root (not under /api).
 *
 * GET /health         → liveness (public, no DB / Redis)
 * GET /ready          → readiness (public, Postgres + Redis)
 * GET /health/queues  → BullMQ depth (requires METRICS_TOKEN when configured)
 */
export function createHealthRoutes(
  healthService: IHealthService,
  queueHealth?: QueueHealthProvider,
  config?: AppConfig
): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.status(200).json(healthService.getLiveness());
  });

  router.get(
    "/ready",
    asyncHandler(async (_req, res) => {
      const report = await healthService.getReadiness();
      res.status(report.ready ? 200 : 503).json(report);
    })
  );

  const queuesAuth = config
    ? createOpsTokenAuth(config)
    : ((_req, _res, next) => next()) as ReturnType<typeof createOpsTokenAuth>;

  router.get(
    "/health/queues",
    queuesAuth,
    asyncHandler(async (_req, res) => {
      const report = (await queueHealth?.getHealth()) ?? {
        status: "degraded" as const,
        redis: "ok" as const,
        workersHealthy: false,
        dlqCount: 0,
        queues: {},
        heartbeats: {},
        generatedAt: new Date().toISOString(),
        detail: "jobs_disabled",
      };
      const statusCode = report.status === "down" ? 503 : 200;
      res.status(statusCode).json(report);
    })
  );

  return router;
}
