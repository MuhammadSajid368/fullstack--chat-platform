import type { Counter, Gauge, Histogram } from "prom-client";
import type { MetricsRegistry } from "./registry.js";
import { METRIC_PREFIX } from "./registry.js";

const REDIS_BUCKETS_SECONDS = [
  0.0005, 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1,
];

const REDIS_LABELS = ["command"] as const;
type RedisLabel = (typeof REDIS_LABELS)[number];

const REDIS_STATE_LABELS = ["state"] as const;
type RedisStateLabel = (typeof REDIS_STATE_LABELS)[number];

export class RedisMetrics {
  readonly commandDurationSeconds: Histogram<RedisLabel>;
  readonly commandErrorsTotal: Counter<RedisLabel>;
  readonly connectionStatus: Gauge<RedisStateLabel>;

  constructor(private readonly registry: MetricsRegistry) {
    this.commandDurationSeconds = registry.histogram<RedisLabel>({
      name: `${METRIC_PREFIX}redis_command_duration_seconds`,
      help: "Redis command roundtrip latency in seconds.",
      labelNames: [...REDIS_LABELS],
      buckets: REDIS_BUCKETS_SECONDS,
    });

    this.commandErrorsTotal = registry.counter<RedisLabel>({
      name: `${METRIC_PREFIX}redis_command_errors_total`,
      help: "Redis commands that raised an error.",
      labelNames: [...REDIS_LABELS],
    });

    this.connectionStatus = registry.gauge<RedisStateLabel>({
      name: `${METRIC_PREFIX}redis_connection_status`,
      help: "1 when Redis is connected in the given state, 0 otherwise.",
      labelNames: [...REDIS_STATE_LABELS],
    });
  }

  observeCommand(input: {
    command: string;
    durationSeconds: number;
    error?: boolean;
  }): void {
    const labels = { command: input.command };
    this.commandDurationSeconds.observe(labels, input.durationSeconds);
    if (input.error) {
      this.commandErrorsTotal.inc(labels);
    }
  }

  setConnectionState(state: string): void {
    this.connectionStatus.set({ state }, 1);
  }
}
