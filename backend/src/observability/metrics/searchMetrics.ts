import type { Counter, Histogram } from "prom-client";
import type { MetricsRegistry } from "./registry.js";
import { METRIC_PREFIX } from "./registry.js";

const SEARCH_LABELS = ["scope"] as const;
type SearchLabel = (typeof SEARCH_LABELS)[number];

const SEARCH_ERROR_LABELS = ["scope", "code"] as const;
type SearchErrorLabel = (typeof SEARCH_ERROR_LABELS)[number];

const SEARCH_BUCKETS_SECONDS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5,
];

export class SearchMetrics {
  readonly latencySeconds: Histogram<SearchLabel>;
  readonly queriesTotal: Counter<SearchLabel>;
  readonly errorsTotal: Counter<SearchErrorLabel>;

  constructor(registry: MetricsRegistry) {
    this.latencySeconds = registry.histogram<SearchLabel>({
      name: `${METRIC_PREFIX}search_query_duration_seconds`,
      help: "Search query latency in seconds by scope.",
      labelNames: [...SEARCH_LABELS],
      buckets: SEARCH_BUCKETS_SECONDS,
    });

    this.queriesTotal = registry.counter<SearchLabel>({
      name: `${METRIC_PREFIX}search_queries_total`,
      help: "Total search queries served by scope.",
      labelNames: [...SEARCH_LABELS],
    });

    this.errorsTotal = registry.counter<SearchErrorLabel>({
      name: `${METRIC_PREFIX}search_query_errors_total`,
      help: "Search queries that returned an error.",
      labelNames: [...SEARCH_ERROR_LABELS],
    });
  }

  observe(input: {
    scope: string;
    durationSeconds: number;
    error?: string;
  }): void {
    const labels = { scope: input.scope };
    this.latencySeconds.observe(labels, input.durationSeconds);
    this.queriesTotal.inc(labels);
    if (input.error) {
      this.errorsTotal.inc({ scope: input.scope, code: input.error });
    }
  }
}
