import type { Counter, Histogram } from "prom-client";
import type { MetricsRegistry } from "./registry.js";
import { METRIC_PREFIX } from "./registry.js";

const DURATION_BUCKETS_SECONDS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

const HTTP_LABELS = ["method", "route", "status_code"] as const;
type HttpLabel = (typeof HTTP_LABELS)[number];

const HTTP_ERROR_LABELS = ["method", "route", "code"] as const;
type HttpErrorLabel = (typeof HTTP_ERROR_LABELS)[number];

export class HttpMetrics {
  readonly requestsTotal: Counter<HttpLabel>;
  readonly requestDurationSeconds: Histogram<HttpLabel>;
  readonly requestErrorsTotal: Counter<HttpErrorLabel>;
  readonly inFlight: Counter<HttpLabel>;

  constructor(private readonly registry: MetricsRegistry) {
    this.requestsTotal = registry.counter<HttpLabel>({
      name: `${METRIC_PREFIX}http_requests_total`,
      help: "Total HTTP requests received.",
      labelNames: [...HTTP_LABELS],
    });

    this.requestDurationSeconds = registry.histogram<HttpLabel>({
      name: `${METRIC_PREFIX}http_request_duration_seconds`,
      help: "HTTP request handler duration in seconds.",
      labelNames: [...HTTP_LABELS],
      buckets: DURATION_BUCKETS_SECONDS,
    });

    this.requestErrorsTotal = registry.counter<HttpErrorLabel>({
      name: `${METRIC_PREFIX}http_request_errors_total`,
      help: "HTTP responses that resulted in an error (>=400) or thrown exception.",
      labelNames: [...HTTP_ERROR_LABELS],
    });

    this.inFlight = registry.counter<HttpLabel>({
      name: `${METRIC_PREFIX}http_requests_inflight_total`,
      help: "HTTP requests that have been started (used with rate() for concurrency insight).",
      labelNames: [...HTTP_LABELS],
    });
  }

  observeRequest(input: {
    method: string;
    route: string;
    statusCode: number;
    durationSeconds: number;
    errorCode?: string;
  }): void {
    const labels = {
      method: input.method,
      route: input.route,
      status_code: String(input.statusCode),
    };

    this.requestsTotal.inc(labels);
    this.requestDurationSeconds.observe(labels, input.durationSeconds);

    if (input.statusCode >= 400 || input.errorCode) {
      this.requestErrorsTotal.inc({
        method: input.method,
        route: input.route,
        code: input.errorCode ?? String(input.statusCode),
      });
    }
  }
}
