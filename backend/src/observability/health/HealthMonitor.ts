import type { Logger } from "pino";
import type {
  CheckRegistration,
  ComponentHealth,
  FullHealthReport,
  HealthCheck,
  HealthStatus,
  LivenessReport,
  ReadinessReport,
  StartupReport,
} from "./types.js";

export type HealthMonitorOptions = {
  version: string;
  startupTimeoutMs: number;
  logger: Logger;
  clock?: () => number;
};

/**
 * Central operational probe aggregator.
 *
 * Not a domain service — this is infrastructure. Components register
 * lazy `HealthCheck` closures at bootstrap and the monitor executes them
 * in parallel on each probe with individual timeouts so a hung dependency
 * cannot block the whole endpoint.
 */
export class HealthMonitor {
  private readonly startedAt: number;
  private readonly checks = new Map<string, CheckRegistration>();
  private startupComplete = false;
  private readonly clock: () => number;
  private readonly perCheckTimeoutMs = 2500;

  constructor(private readonly options: HealthMonitorOptions) {
    this.clock = options.clock ?? (() => Date.now());
    this.startedAt = this.clock();
  }

  registerCheck(registration: CheckRegistration): void {
    this.checks.set(registration.name, registration);
    this.options.logger.debug(
      { name: registration.name, critical: registration.critical },
      "Health check registered"
    );
  }

  markStartupComplete(): void {
    if (this.startupComplete) {
      return;
    }
    this.startupComplete = true;
    this.options.logger.info(
      { uptimeSeconds: this.uptimeSeconds() },
      "Startup complete — readiness probes will use live checks"
    );
  }

  isStartupComplete(): boolean {
    return this.startupComplete;
  }

  getLiveness(): LivenessReport {
    return {
      status: "ok",
      uptimeSeconds: this.uptimeSeconds(),
      version: this.options.version,
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness(): Promise<ReadinessReport> {
    const components = await this.runChecks("readiness");
    const status = aggregate(components, this.checks);
    return {
      status,
      ready: status === "ok",
      uptimeSeconds: this.uptimeSeconds(),
      version: this.options.version,
      timestamp: new Date().toISOString(),
      components,
    };
  }

  async getStartup(): Promise<StartupReport> {
    if (!this.startupComplete) {
      const startedTooLong =
        this.clock() - this.startedAt > this.options.startupTimeoutMs;
      return {
        status: startedTooLong ? "down" : "degraded",
        started: false,
        uptimeSeconds: this.uptimeSeconds(),
        version: this.options.version,
        timestamp: new Date().toISOString(),
        components: [
          {
            name: "startup",
            status: startedTooLong ? "down" : "degraded",
            detail: startedTooLong
              ? "Startup did not complete within configured window"
              : "Startup still in progress",
          },
        ],
      };
    }

    const components = await this.runChecks("startup");
    const status = aggregate(components, this.checks);
    return {
      status,
      started: true,
      uptimeSeconds: this.uptimeSeconds(),
      version: this.options.version,
      timestamp: new Date().toISOString(),
      components,
    };
  }

  async getFullHealth(): Promise<FullHealthReport> {
    const readiness = await this.getReadiness();
    return {
      status: readiness.status,
      ready: readiness.ready,
      started: this.startupComplete,
      uptimeSeconds: readiness.uptimeSeconds,
      version: readiness.version,
      timestamp: readiness.timestamp,
      components: readiness.components,
    };
  }

  private async runChecks(
    scope: "startup" | "readiness"
  ): Promise<ComponentHealth[]> {
    const registrations = Array.from(this.checks.values()).filter((r) =>
      r.includeIn.includes(scope)
    );

    return Promise.all(
      registrations.map((reg) => this.runOne(reg.name, reg.check))
    );
  }

  private async runOne(
    name: string,
    check: HealthCheck
  ): Promise<ComponentHealth> {
    const started = this.clock();
    try {
      const result = await withTimeout(
        check(),
        this.perCheckTimeoutMs,
        name
      );
      return {
        ...result,
        name: result.name || name,
        latencyMs: result.latencyMs ?? this.clock() - started,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "unknown health check error";
      return {
        name,
        status: "down",
        latencyMs: this.clock() - started,
        detail: message,
      };
    }
  }

  private uptimeSeconds(): number {
    return Math.floor((this.clock() - this.startedAt) / 1000);
  }
}

function aggregate(
  components: ComponentHealth[],
  registry: Map<string, CheckRegistration>
): HealthStatus {
  let sawDegraded = false;
  for (const component of components) {
    if (component.status === "down") {
      const reg = registry.get(component.name);
      if (!reg || reg.critical) {
        return "down";
      }
      sawDegraded = true;
    } else if (component.status === "degraded") {
      sawDegraded = true;
    }
  }
  return sawDegraded ? "degraded" : "ok";
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  name: string
): Promise<T> {
  let handle: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    handle = setTimeout(() => {
      reject(new Error(`Health check "${name}" timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    handle.unref?.();
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (handle) {
      clearTimeout(handle);
    }
  }
}
