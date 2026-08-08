import type { Counter, Gauge, Histogram } from "prom-client";
import type { MetricsRegistry } from "./registry.js";
import { METRIC_PREFIX } from "./registry.js";

const QUEUE_LABELS = ["queue", "state"] as const;
type QueueLabel = (typeof QUEUE_LABELS)[number];

const JOB_LABELS = ["queue", "job_name"] as const;
type JobLabel = (typeof JOB_LABELS)[number];

const WORKER_LABELS = ["queue", "worker"] as const;
type WorkerLabel = (typeof WORKER_LABELS)[number];

const DLQ_LABELS = ["queue"] as const;
type DlqLabel = (typeof DLQ_LABELS)[number];

const JOB_DURATION_BUCKETS_SECONDS = [
  0.005, 0.025, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60,
];

export class QueueMetrics {
  readonly queueDepth: Gauge<QueueLabel>;
  readonly queueFailuresTotal: Counter<JobLabel>;
  readonly queueRetriesTotal: Counter<JobLabel>;
  readonly workerExecutionDurationSeconds: Histogram<JobLabel>;
  readonly workerHeartbeatTimestamp: Gauge<WorkerLabel>;
  readonly workerActive: Gauge<WorkerLabel>;
  readonly dlqTotal: Counter<DlqLabel>;

  constructor(private readonly registry: MetricsRegistry) {
    this.queueDepth = registry.gauge<QueueLabel>({
      name: `${METRIC_PREFIX}queue_depth`,
      help: "BullMQ queue depth broken down by state.",
      labelNames: [...QUEUE_LABELS],
    });

    this.queueFailuresTotal = registry.counter<JobLabel>({
      name: `${METRIC_PREFIX}queue_failures_total`,
      help: "Total job executions that ended in a terminal failure.",
      labelNames: [...JOB_LABELS],
    });

    this.queueRetriesTotal = registry.counter<JobLabel>({
      name: `${METRIC_PREFIX}queue_retries_total`,
      help: "Total job executions that were retried after a failure.",
      labelNames: [...JOB_LABELS],
    });

    this.workerExecutionDurationSeconds = registry.histogram<JobLabel>({
      name: `${METRIC_PREFIX}worker_execution_duration_seconds`,
      help: "Worker job execution duration in seconds.",
      labelNames: [...JOB_LABELS],
      buckets: JOB_DURATION_BUCKETS_SECONDS,
    });

    this.workerHeartbeatTimestamp = registry.gauge<WorkerLabel>({
      name: `${METRIC_PREFIX}worker_heartbeat_timestamp_seconds`,
      help: "Unix timestamp of the most recent heartbeat emitted by a worker.",
      labelNames: [...WORKER_LABELS],
    });

    this.workerActive = registry.gauge<WorkerLabel>({
      name: `${METRIC_PREFIX}worker_active`,
      help: "1 when the worker is considered active (recent heartbeat), 0 otherwise.",
      labelNames: [...WORKER_LABELS],
    });

    this.dlqTotal = registry.counter<DlqLabel>({
      name: `${METRIC_PREFIX}queue_dlq_total`,
      help: "Total jobs moved to the dead-letter queue.",
      labelNames: [...DLQ_LABELS],
    });
  }

  setDepth(queue: string, state: string, value: number): void {
    this.queueDepth.set({ queue, state }, value);
  }

  recordFailure(queue: string, jobName: string): void {
    this.queueFailuresTotal.inc({ queue, job_name: jobName });
  }

  recordRetry(queue: string, jobName: string): void {
    this.queueRetriesTotal.inc({ queue, job_name: jobName });
  }

  observeExecution(queue: string, jobName: string, durationSeconds: number): void {
    this.workerExecutionDurationSeconds.observe(
      { queue, job_name: jobName },
      durationSeconds
    );
  }

  recordHeartbeat(queue: string, worker: string): void {
    this.workerHeartbeatTimestamp.set(
      { queue, worker },
      Math.floor(Date.now() / 1000)
    );
    this.workerActive.set({ queue, worker }, 1);
  }

  markWorkerInactive(queue: string, worker: string): void {
    this.workerActive.set({ queue, worker }, 0);
  }

  recordDlq(queue: string): void {
    this.dlqTotal.inc({ queue });
  }
}
