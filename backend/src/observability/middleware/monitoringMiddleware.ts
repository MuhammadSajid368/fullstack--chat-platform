import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { MetricsFacade } from "@observability/metrics/index.js";
import type { AuthMetrics } from "@observability/metrics/authMetrics.js";
import { skipOperationalProbes } from "@middleware/operationalProbes.js";

export type MonitoringOptions = {
  metrics: MetricsFacade;
};

/**
 * Records HTTP request metrics and error counts.
 *
 * - The route label uses Express's matched route (`req.route.path`) so
 *   parameterised paths (e.g. `/users/:id`) do not explode label cardinality.
 * - Operational probes (/health, /ready, /metrics, /health/queues) are skipped
 *   to avoid polluting dashboards with probe traffic.
 * - Response times are measured with `process.hrtime.bigint()` to keep the
 *   collector allocation-free on the hot path.
 */
export function createMonitoringMiddleware(
  options: MonitoringOptions
): RequestHandler {
  const { metrics } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    if (skipOperationalProbes({ path: req.path })) {
      next();
      return;
    }

    const startNs = process.hrtime.bigint();

    res.once("finish", () => {
      const durationSeconds =
        Number(process.hrtime.bigint() - startNs) / 1_000_000_000;

      metrics.http.observeRequest({
        method: req.method,
        route: resolveRoute(req),
        statusCode: res.statusCode,
        durationSeconds,
        errorCode: resolveErrorCode(res),
      });

      recordAuthMetric(req, res, metrics.auth);
    });

    next();
  };
}

function resolveRoute(req: Request): string {
  const routePath = req.route?.path;
  const basePath = req.baseUrl ?? "";
  if (typeof routePath === "string" && routePath.length > 0) {
    return `${basePath}${routePath}` || routePath;
  }
  // Fallback to path with numeric ids collapsed, keeping cardinality bounded.
  return collapseIds(req.path);
}

function collapseIds(path: string): string {
  return path
    .split("/")
    .map((seg) => (/^[0-9a-fA-F]{8,}$/.test(seg) || /^\d+$/.test(seg) ? ":id" : seg))
    .join("/");
}

function resolveErrorCode(res: Response): string | undefined {
  if (res.statusCode < 400) {
    return undefined;
  }
  const contextualCode = (res as Response & { errorCode?: string }).errorCode;
  return contextualCode;
}

function recordAuthMetric(
  req: Request,
  res: Response,
  auth: AuthMetrics
): void {
  const path = req.path;
  if (!path.startsWith("/auth") && !path.includes("/auth/")) {
    return;
  }
  const success = res.statusCode >= 200 && res.statusCode < 300;
  const result = success ? "success" : "failure";
  if (path.endsWith("/login")) {
    auth.record("login", result);
  } else if (path.endsWith("/logout")) {
    auth.record("logout", result);
  } else if (path.endsWith("/refresh")) {
    auth.record("refresh", result);
  } else if (path.endsWith("/register") || path.endsWith("/signup")) {
    auth.record("register", result);
  } else if (path.endsWith("/me")) {
    auth.record("me", result);
  }
}
