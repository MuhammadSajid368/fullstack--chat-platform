import type { Redis } from "ioredis";
import type { Logger } from "pino";
import type { RedisMetrics } from "@observability/metrics/redisMetrics.js";

/**
 * Attaches lightweight event listeners to an ioredis client for
 * connection-state gauges and command latency histograms.
 *
 * We intentionally do not monkey-patch send_command — ioredis pipelines and
 * multi-exec make wrapping error-prone. Instead we listen to the
 * "commandFinished" hook when available (ioredis >= 5) and fall back to
 * connection-state metrics only.
 */
export function instrumentRedis(
  redis: Redis,
  metrics: RedisMetrics,
  logger: Logger
): void {
  metrics.setConnectionState(redis.status);

  redis.on("connect", () => metrics.setConnectionState("connect"));
  redis.on("ready", () => metrics.setConnectionState("ready"));
  redis.on("close", () => metrics.setConnectionState("close"));
  redis.on("end", () => metrics.setConnectionState("end"));
  redis.on("reconnecting", () => metrics.setConnectionState("reconnecting"));
  redis.on("error", (err: Error) => {
    metrics.setConnectionState("error");
    logger.warn({ err: err.message }, "Redis connection error");
  });

  const emitter = redis as unknown as {
    on(event: "commandFinished", listener: (info: unknown) => void): void;
  };

  try {
    emitter.on("commandFinished", (info) => {
      const detail = info as {
        commandName?: string;
        durationMs?: number;
        error?: unknown;
      };
      if (!detail || typeof detail.commandName !== "string") {
        return;
      }
      metrics.observeCommand({
        command: detail.commandName.toLowerCase(),
        durationSeconds: (detail.durationMs ?? 0) / 1000,
        error: Boolean(detail.error),
      });
    });
  } catch {
    // ioredis versions without commandFinished simply skip latency observation.
  }

  logger.info("Redis observability instrumentation attached");
}
