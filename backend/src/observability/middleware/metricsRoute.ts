import { Router, type Router as ExpressRouter } from "express";
import { asyncHandler } from "@common/utils/asyncHandler.js";
import type { MetricsFacade } from "@observability/metrics/index.js";

/**
 * Mounts `GET <route>` returning Prometheus scrape output.
 * When `metricsToken` is set, requires Bearer or X-Metrics-Token.
 * Production boots require METRICS_TOKEN (see loadConfig).
 */
export function createMetricsRouter(
  metrics: MetricsFacade,
  routePath = "/metrics",
  metricsToken: string | null = null
): ExpressRouter {
  const router = Router();

  router.get(
    routePath,
    asyncHandler(async (req, res) => {
      if (metricsToken) {
        const header = req.get("authorization") ?? "";
        const bearer = header.toLowerCase().startsWith("bearer ")
          ? header.slice(7).trim()
          : "";
        const alt = req.get("x-metrics-token")?.trim() ?? "";
        if (bearer !== metricsToken && alt !== metricsToken) {
          res.status(401).json({
            error: {
              code: "UNAUTHORIZED",
              message: "Metrics scrape token required",
              retryable: false,
            },
          });
          return;
        }
      }
      res.setHeader("Content-Type", metrics.contentType());
      const body = await metrics.render();
      res.status(200).send(body);
    })
  );

  return router;
}
