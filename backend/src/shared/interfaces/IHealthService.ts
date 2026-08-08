export type HealthStatus = "ok" | "degraded" | "down";

export type ComponentHealth = {
  name: string;
  status: HealthStatus;
  latencyMs?: number;
  detail?: string;
};

/** Liveness — process only; never touches external dependencies. */
export type LivenessReport = {
  status: "ok";
  uptimeSeconds: number;
  version: string;
  timestamp: string;
};

/** Readiness — dependency connectivity for traffic admission. */
export type ReadinessReport = {
  status: HealthStatus;
  ready: boolean;
  uptimeSeconds: number;
  version: string;
  timestamp: string;
  components: ComponentHealth[];
};

/**
 * Cross-cutting operational probes (not domain business logic).
 *
 * Architecture exception: readiness may talk to Prisma/Redis directly
 * because probes are infrastructure concerns, not domain repositories.
 */
export interface IHealthService {
  getLiveness(): LivenessReport;
  getReadiness(): Promise<ReadinessReport>;
}
