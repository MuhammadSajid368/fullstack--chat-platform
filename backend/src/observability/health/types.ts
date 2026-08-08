export type HealthStatus = "ok" | "degraded" | "down";

export type ComponentHealth = {
  name: string;
  status: HealthStatus;
  latencyMs?: number;
  detail?: string;
};

export type LivenessReport = {
  status: "ok";
  uptimeSeconds: number;
  version: string;
  timestamp: string;
};

export type ReadinessReport = {
  status: HealthStatus;
  ready: boolean;
  uptimeSeconds: number;
  version: string;
  timestamp: string;
  components: ComponentHealth[];
};

export type StartupReport = {
  status: HealthStatus;
  started: boolean;
  uptimeSeconds: number;
  version: string;
  timestamp: string;
  components: ComponentHealth[];
};

export type FullHealthReport = {
  status: HealthStatus;
  ready: boolean;
  started: boolean;
  uptimeSeconds: number;
  version: string;
  timestamp: string;
  components: ComponentHealth[];
};

/**
 * A single component health probe. Implementations must never throw —
 * failures are reported as `status: "down"` with a `detail` string.
 */
export type HealthCheck = () => Promise<ComponentHealth>;

/**
 * A named check registration. The `critical` flag decides whether a "down"
 * value causes readiness to fail (critical=true) or merely degrades it.
 */
export type CheckRegistration = {
  name: string;
  check: HealthCheck;
  critical: boolean;
  includeIn: readonly ("startup" | "readiness")[];
};
