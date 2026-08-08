import type { Logger } from "pino";
import { SpanKind, trace, type Attributes } from "@opentelemetry/api";
import type { QueueManager } from "@jobs/QueueManager.js";
import type { QueueMetrics } from "@observability/metrics/queueMetrics.js";
import { TRACER_NAME } from "@observability/tracing/index.js";

export type BullMQInstrumentationHandle = {
  refresh(): Promise<void>;
  stop(): void;
};

export type BullMQInstrumentationOptions = {
  queueManager: QueueManager;
  metrics: QueueMetrics;
  logger: Logger;
  /** Polling interval (ms) for queue depth scrape. Defaults to 15 seconds. */
  scrapeIntervalMs?: number;
};

/**
 * Instruments the BullMQ subsystem for Prometheus + OpenTelemetry:
 *
 * - Periodically scrapes queue depth (waiting/active/delayed/failed/completed).
 * - Mirrors JobMetrics heartbeats into the Prometheus gauge.
 * - Creates client spans for enqueue operations without changing QueueManager.
 */
export function instrumentBullMQ(
  options: BullMQInstrumentationOptions
): BullMQInstrumentationHandle {
  const { queueManager, metrics, logger } = options;
  const intervalMs = options.scrapeIntervalMs ?? 15_000;
  const tracer = trace.getTracer(TRACER_NAME);

  wrapEnqueue(queueManager, tracer);

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const scrape = async (): Promise<void> => {
    if (stopped) {
      return;
    }
    try {
      const report = await queueManager.getHealth();
      for (const [queue, stats] of Object.entries(report.queues)) {
        metrics.setDepth(queue, "waiting", stats.waiting);
        metrics.setDepth(queue, "active", stats.active);
        metrics.setDepth(queue, "delayed", stats.delayed);
        metrics.setDepth(queue, "failed", stats.failed);
        metrics.setDepth(queue, "completed", stats.completed);
      }
      for (const [worker, lastAt] of Object.entries(report.heartbeats)) {
        if (typeof lastAt === "string") {
          const queue = worker.replace(/-worker$/, "");
          metrics.recordHeartbeat(queue, worker);
          if (Date.now() - Date.parse(lastAt) > 60_000) {
            metrics.markWorkerInactive(queue, worker);
          }
        }
      }
    } catch (err) {
      logger.warn({ err }, "BullMQ scrape failed");
    }
  };

  timer = setInterval(() => {
    void scrape();
  }, intervalMs);
  timer.unref?.();

  void scrape();

  logger.info(
    { intervalMs },
    "BullMQ observability instrumentation attached"
  );

  return {
    refresh: scrape,
    stop: () => {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

function wrapEnqueue(
  queueManager: QueueManager,
  tracer: ReturnType<typeof trace.getTracer>
): void {
  const original = queueManager.enqueue.bind(queueManager);
  queueManager.enqueue = async (jobName, payload, opts) => {
    const attrs: Attributes = {
      "messaging.system": "bullmq",
      "messaging.destination_kind": "queue",
      "messaging.operation": "publish",
      "messaging.destination": jobName,
    };
    const span = tracer.startSpan(`bullmq.enqueue ${jobName}`, {
      kind: SpanKind.PRODUCER,
      attributes: attrs,
    });
    try {
      const job = await original(jobName, payload, opts);
      if (job?.id) {
        span.setAttribute("messaging.message_id", String(job.id));
      }
      span.setStatus({ code: 1 });
      return job;
    } catch (err) {
      if (err instanceof Error) {
        span.recordException(err);
        span.setStatus({ code: 2, message: err.message });
      } else {
        span.setStatus({ code: 2 });
      }
      throw err;
    } finally {
      span.end();
    }
  };
}
