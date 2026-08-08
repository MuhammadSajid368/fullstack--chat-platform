import { Router, type Router as ExpressRouter } from "express";
import { asyncHandler } from "@common/utils/asyncHandler.js";
import type { HealthMonitor } from "@observability/health/HealthMonitor.js";

/**
 * Health endpoint suite.
 *
 * - `GET /health`         — Composite health (equivalent to /health/ready today).
 * - `GET /health/live`    — Liveness only (process up). Never touches deps.
 * - `GET /health/ready`   — Readiness (Postgres, Redis, workers, gateway).
 * - `GET /health/startup` — Startup probe used by orchestrators during boot.
 *
 * Legacy `/health` and `/ready` continue to be served by the existing router
 * for backward compatibility with the frontend contract.
 */
export function createObservabilityHealthRoutes(
  monitor: HealthMonitor
): ExpressRouter {
  const router = Router();

  router.get("/health/live", (_req, res) => {
    res.status(200).json(monitor.getLiveness());
  });

  router.get(
    "/health/ready",
    asyncHandler(async (_req, res) => {
      const report = await monitor.getReadiness();
      res.status(report.ready ? 200 : 503).json(report);
    })
  );

  router.get(
    "/health/startup",
    asyncHandler(async (_req, res) => {
      const report = await monitor.getStartup();
      res.status(report.started ? 200 : 503).json(report);
    })
  );

  return router;
}
