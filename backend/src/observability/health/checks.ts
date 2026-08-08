import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import type { QueueHealthProvider } from "@jobs/index.js";
import type { HealthCheck, ComponentHealth } from "./types.js";

/**
 * PostgreSQL probe — a single trivial query.
 */
export function makePrismaCheck(prisma: PrismaClient): HealthCheck {
  return async () => {
    const start = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
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
        detail: err instanceof Error ? err.message : "unknown error",
      };
    }
  };
}

/**
 * Redis probe — PING command.
 */
export function makeRedisCheck(redis: Redis): HealthCheck {
  return async () => {
    const start = Date.now();
    try {
      const pong = await redis.ping();
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
        detail: err instanceof Error ? err.message : "unknown error",
      };
    }
  };
}

/**
 * BullMQ worker + queue health probe based on the QueueHealthProvider.
 * When jobs are disabled (test env or JOBS_ENABLED=false) the probe reports
 * "degraded" so readiness admits traffic (workers optional in dev) without
 * hiding the fact that background processing is not running.
 */
export function makeQueueCheck(provider: QueueHealthProvider): HealthCheck {
  return async () => {
    const start = Date.now();
    try {
      const report = await provider.getHealth();
      if (!report) {
        return {
          name: "bullmq_workers",
          status: "degraded",
          latencyMs: Date.now() - start,
          detail: "jobs_disabled",
        };
      }

      const status: ComponentHealth["status"] = report.status;
      const detail = `${report.workersHealthy ? "workers ok" : "workers stale"} | dlq=${report.dlqCount}`;
      return {
        name: "bullmq_workers",
        status,
        latencyMs: Date.now() - start,
        detail,
      };
    } catch (err) {
      return {
        name: "bullmq_workers",
        status: "down",
        latencyMs: Date.now() - start,
        detail: err instanceof Error ? err.message : "unknown error",
      };
    }
  };
}

/**
 * Notification worker probe — a queue check restricted to the notification queue.
 */
export function makeNotificationWorkerCheck(
  provider: QueueHealthProvider
): HealthCheck {
  return async () => {
    const start = Date.now();
    try {
      const report = await provider.getHealth();
      if (!report) {
        return {
          name: "notification_workers",
          status: "degraded",
          latencyMs: Date.now() - start,
          detail: "jobs_disabled",
        };
      }
      const notification = report.queues["notification"];
      if (!notification) {
        return {
          name: "notification_workers",
          status: "degraded",
          latencyMs: Date.now() - start,
          detail: "notification queue not started",
        };
      }
      return {
        name: "notification_workers",
        status: report.workersHealthy ? "ok" : "degraded",
        latencyMs: Date.now() - start,
        detail: `waiting=${notification.waiting} active=${notification.active} failed=${notification.failed}`,
      };
    } catch (err) {
      return {
        name: "notification_workers",
        status: "down",
        latencyMs: Date.now() - start,
        detail: err instanceof Error ? err.message : "unknown error",
      };
    }
  };
}

/**
 * A cheap queue-depth probe that flips to "degraded" if any queue's
 * waiting + failed counts exceed the configured backlog threshold.
 */
export function makeQueueBacklogCheck(
  provider: QueueHealthProvider,
  backlogThreshold: number
): HealthCheck {
  return async () => {
    const start = Date.now();
    try {
      const report = await provider.getHealth();
      if (!report) {
        return {
          name: "queue_backlog",
          status: "degraded",
          latencyMs: Date.now() - start,
          detail: "jobs_disabled",
        };
      }
      const overload: string[] = [];
      for (const [name, stats] of Object.entries(report.queues)) {
        const total = stats.waiting + stats.failed;
        if (total > backlogThreshold) {
          overload.push(`${name}=${total}`);
        }
      }
      if (overload.length === 0) {
        return {
          name: "queue_backlog",
          status: "ok",
          latencyMs: Date.now() - start,
        };
      }
      return {
        name: "queue_backlog",
        status: "degraded",
        latencyMs: Date.now() - start,
        detail: `backlog>${backlogThreshold} for: ${overload.join(", ")}`,
      };
    } catch (err) {
      return {
        name: "queue_backlog",
        status: "down",
        latencyMs: Date.now() - start,
        detail: err instanceof Error ? err.message : "unknown error",
      };
    }
  };
}

/**
 * Socket.IO gateway probe. Registered lazily so tests without a gateway
 * can still exercise the monitor.
 */
export type SocketHealthProvider = {
  isRunning(): boolean;
  clientCount(): number;
};

export function makeSocketGatewayCheck(
  provider: SocketHealthProvider
): HealthCheck {
  return async () => {
    try {
      if (!provider.isRunning()) {
        return {
          name: "socket_gateway",
          status: "down",
          detail: "gateway not initialized",
        };
      }
      const clients = provider.clientCount();
      return {
        name: "socket_gateway",
        status: "ok",
        detail: `clients=${clients}`,
      };
    } catch (err) {
      return {
        name: "socket_gateway",
        status: "down",
        detail: err instanceof Error ? err.message : "unknown error",
      };
    }
  };
}
