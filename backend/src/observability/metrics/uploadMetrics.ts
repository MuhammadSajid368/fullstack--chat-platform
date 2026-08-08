import type { Counter, Histogram } from "prom-client";
import type { MetricsRegistry } from "./registry.js";
import { METRIC_PREFIX } from "./registry.js";

const UPLOAD_LABELS = ["status"] as const;
type UploadLabel = (typeof UPLOAD_LABELS)[number];

const UPLOAD_BYTES_LABELS = [] as const;

const UPLOAD_OPERATION_LABELS = ["operation"] as const;
type UploadOpLabel = (typeof UPLOAD_OPERATION_LABELS)[number];

const UPLOAD_BUCKETS_SECONDS = [
  0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60,
];

export class UploadMetrics {
  readonly uploadsTotal: Counter<UploadLabel>;
  readonly uploadDurationSeconds: Histogram<UploadOpLabel>;
  readonly uploadBytesTotal: Counter<never>;

  constructor(registry: MetricsRegistry) {
    this.uploadsTotal = registry.counter<UploadLabel>({
      name: `${METRIC_PREFIX}uploads_total`,
      help: "File uploads processed by terminal status.",
      labelNames: [...UPLOAD_LABELS],
    });

    this.uploadDurationSeconds = registry.histogram<UploadOpLabel>({
      name: `${METRIC_PREFIX}upload_operation_duration_seconds`,
      help: "Duration of upload lifecycle operations (init, complete, virus-scan, thumbnail).",
      labelNames: [...UPLOAD_OPERATION_LABELS],
      buckets: UPLOAD_BUCKETS_SECONDS,
    });

    this.uploadBytesTotal = registry.counter({
      name: `${METRIC_PREFIX}upload_bytes_total`,
      help: "Total bytes accepted across all completed uploads.",
      labelNames: [...UPLOAD_BYTES_LABELS],
    });
  }

  recordStatus(status: string): void {
    this.uploadsTotal.inc({ status });
  }

  observeOperation(operation: string, durationSeconds: number): void {
    this.uploadDurationSeconds.observe({ operation }, durationSeconds);
  }

  addBytes(bytes: number): void {
    if (bytes > 0) {
      this.uploadBytesTotal.inc(bytes);
    }
  }
}
