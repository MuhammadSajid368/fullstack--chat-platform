/**
 * Operational probe paths for orchestrators (K8s / load balancers).
 *
 * Architecture rule: these routes must never require authentication,
 * must not be rate-limited, and should stay quiet in request logs.
 */
export const OPERATIONAL_PROBE_PATHS = new Set([
  "/health",
  "/ready",
  "/health/queues",
  "/health/live",
  "/health/ready",
  "/health/startup",
  "/metrics",
]);

/**
 * Adds a runtime path to the probe list. Used when METRICS_ROUTE is
 * customised via configuration.
 */
export function registerOperationalProbePath(path: string): void {
  if (path && path.startsWith("/")) {
    OPERATIONAL_PROBE_PATHS.add(path);
  }
}

export function isOperationalProbePath(path: string): boolean {
  return OPERATIONAL_PROBE_PATHS.has(path);
}

/**
 * Shared skip predicate for rate limiter, request logging, and (future) auth.
 */
export function skipOperationalProbes(req: { path: string }): boolean {
  return isOperationalProbePath(req.path);
}
