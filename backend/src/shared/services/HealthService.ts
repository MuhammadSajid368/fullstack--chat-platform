import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import type { AppConfig } from "@config/index.js";
import type {
  ComponentHealth,
  HealthStatus,
  IHealthService,
  LivenessReport,
  ReadinessReport,
} from "@shared/interfaces/IHealthService.js";

/**
 * Operational health implementation (not a domain module).
 *
 * Architecture exception: this service may access Prisma and Redis clients
 * directly for readiness probes. Domain modules must still go through repositories.
 */
export class HealthService implements IHealthService {
  private readonly startedAt = Date.now();

  constructor(
    private readonly config: AppConfig,
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {}

  getLiveness(): LivenessReport {
    return {
      status: "ok",
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      version: this.config.version,
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness(): Promise<ReadinessReport> {
    const components = await Promise.all([
      this.checkPrisma(),
      this.checkRedis(),
    ]);

    const status = aggregate(components);

    return {
      status,
      ready: status === "ok",
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      version: this.config.version,
      timestamp: new Date().toISOString(),
      components,
    };
  }

  private async checkPrisma(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        name: "postgres",
        status: "ok",
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        name: "postgres",
        status: "down",
        latencyMs: Date.now() - start,
        detail: err instanceof Error ? err.message : "unknown",
      };
    }
  }

  private async checkRedis(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      const pong = await this.redis.ping();
      return {
        name: "redis",
        status: pong === "PONG" ? "ok" : "degraded",
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        name: "redis",
        status: "down",
        latencyMs: Date.now() - start,
        detail: err instanceof Error ? err.message : "unknown",
      };
    }
  }
}

function aggregate(components: ComponentHealth[]): HealthStatus {
  if (components.some((c) => c.status === "down")) {
    return "down";
  }
  if (components.some((c) => c.status === "degraded")) {
    return "degraded";
  }
  return "ok";
}
