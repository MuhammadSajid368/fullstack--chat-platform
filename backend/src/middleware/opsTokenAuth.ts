import type { RequestHandler } from "express";
import type { AppConfig } from "@config/index.js";

/**
 * Protects operational depth endpoints (queue health, metrics) with the
 * shared METRICS_TOKEN via Bearer or X-Metrics-Token.
 *
 * - Production: token is always required (enforced at config boot).
 * - Non-production: open when token is unset (local DX).
 */
export function createOpsTokenAuth(config: AppConfig): RequestHandler {
  return (req, res, next) => {
    const token = config.observability.metricsToken;
    if (!token) {
      if (config.isProduction) {
        res.status(503).json({
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Operational endpoint unavailable",
            retryable: false,
          },
        });
        return;
      }
      next();
      return;
    }

    const header = req.get("authorization") ?? "";
    const bearer = header.toLowerCase().startsWith("bearer ")
      ? header.slice(7).trim()
      : "";
    const alt = req.get("x-metrics-token")?.trim() ?? "";
    if (bearer !== token && alt !== token) {
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Operational token required",
          retryable: false,
        },
      });
      return;
    }
    next();
  };
}
