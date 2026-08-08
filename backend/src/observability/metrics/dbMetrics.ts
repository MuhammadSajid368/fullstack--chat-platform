import type { Counter, Histogram } from "prom-client";
import type { MetricsRegistry } from "./registry.js";
import { METRIC_PREFIX } from "./registry.js";

const DB_BUCKETS_SECONDS = [
  0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5,
];

const DB_LABELS = ["operation", "model"] as const;
type DbLabel = (typeof DB_LABELS)[number];

export class DbMetrics {
  readonly queryDurationSeconds: Histogram<DbLabel>;
  readonly queryErrorsTotal: Counter<DbLabel>;

  constructor(private readonly registry: MetricsRegistry) {
    this.queryDurationSeconds = registry.histogram<DbLabel>({
      name: `${METRIC_PREFIX}db_query_duration_seconds`,
      help: "Database query duration in seconds by operation and model.",
      labelNames: [...DB_LABELS],
      buckets: DB_BUCKETS_SECONDS,
    });

    this.queryErrorsTotal = registry.counter<DbLabel>({
      name: `${METRIC_PREFIX}db_query_errors_total`,
      help: "Database queries that raised an error.",
      labelNames: [...DB_LABELS],
    });
  }

  observeQuery(input: {
    operation: string;
    model: string | null;
    durationSeconds: number;
    error?: boolean;
  }): void {
    const labels = {
      operation: input.operation,
      model: input.model ?? "unknown",
    };
    this.queryDurationSeconds.observe(labels, input.durationSeconds);
    if (input.error) {
      this.queryErrorsTotal.inc(labels);
    }
  }
}
