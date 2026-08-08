import { afterEach, describe, expect, it, vi } from "vitest";
import pino from "pino";
import {
  MetricsFacade,
  METRIC_PREFIX,
} from "../../src/observability/metrics/index.js";
import { instrumentBullMQ } from "../../src/observability/instrumentation/bullmqInstrumentation.js";
import type { QueueManager, QueueHealthReport } from "../../src/jobs/QueueManager.js";

const disposables: MetricsFacade[] = [];

afterEach(() => {
  while (disposables.length > 0) {
    disposables.pop()?.dispose();
  }
});

function makeMetrics(): MetricsFacade {
  const facade = new MetricsFacade();
  disposables.push(facade);
  return facade;
}

describe("queue metrics", () => {
  it("gauges queue depth per state", async () => {
    const metrics = makeMetrics();
    metrics.queue.setDepth("message", "waiting", 3);
    metrics.queue.setDepth("message", "active", 1);
    metrics.queue.setDepth("message", "failed", 2);

    const output = await metrics.render();
    expect(output).toContain(`${METRIC_PREFIX}queue_depth`);
    expect(output).toMatch(/queue="message"[^\n]*state="waiting"[^\n]*} 3/);
    expect(output).toMatch(/queue="message"[^\n]*state="active"[^\n]*} 1/);
    expect(output).toMatch(/queue="message"[^\n]*state="failed"[^\n]*} 2/);
  });

  it("counts queue failures, retries, and DLQ moves", async () => {
    const metrics = makeMetrics();
    metrics.queue.recordFailure("notification", "notification.push");
    metrics.queue.recordFailure("notification", "notification.push");
    metrics.queue.recordRetry("notification", "notification.push");
    metrics.queue.recordDlq("notification");

    const output = await metrics.render();
    expect(output).toContain(`${METRIC_PREFIX}queue_failures_total`);
    expect(output).toContain(`${METRIC_PREFIX}queue_retries_total`);
    expect(output).toContain(`${METRIC_PREFIX}queue_dlq_total`);
    expect(output).toMatch(
      /queue_failures_total\{queue="notification",job_name="notification\.push"\} 2/
    );
    expect(output).toMatch(
      /queue_retries_total\{queue="notification",job_name="notification\.push"\} 1/
    );
  });

  it("instrumentBullMQ scrapes queue depth and mirrors heartbeats", async () => {
    vi.useFakeTimers();
    const metrics = makeMetrics();

    const report: QueueHealthReport = {
      status: "ok",
      redis: "ok",
      workersHealthy: true,
      dlqCount: 0,
      queues: {
        message: {
          waiting: 7,
          active: 2,
          delayed: 1,
          failed: 3,
          completed: 500,
          retryCount: 4,
          avgExecutionMs: 100,
          lastHeartbeatAt: new Date().toISOString(),
        },
      },
      heartbeats: {
        "message-worker": new Date().toISOString(),
      },
      generatedAt: new Date().toISOString(),
    };

    const original = vi.fn().mockResolvedValue({ id: "j1" });
    const queueManager = {
      getHealth: vi.fn().mockResolvedValue(report),
      enqueue: original,
    } as unknown as QueueManager;

    const handle = instrumentBullMQ({
      queueManager,
      metrics: metrics.queue,
      logger: pino({ level: "silent" }),
      scrapeIntervalMs: 1_000,
    });

    await handle.refresh();

    const output = await metrics.render();
    expect(output).toMatch(/queue="message"[^\n]*state="waiting"[^\n]*} 7/);
    expect(output).toMatch(/queue="message"[^\n]*state="failed"[^\n]*} 3/);
    expect(output).toContain(`${METRIC_PREFIX}worker_heartbeat_timestamp_seconds`);
    expect(output).toContain(`${METRIC_PREFIX}worker_active`);

    handle.stop();
    vi.useRealTimers();
  });

  it("instrumentBullMQ wraps enqueue without changing return value", async () => {
    const metrics = makeMetrics();

    const originalEnqueue = vi
      .fn()
      .mockResolvedValue({ id: "job-1" });

    const queueManager = {
      getHealth: vi.fn().mockResolvedValue({
        status: "ok",
        redis: "ok",
        workersHealthy: true,
        dlqCount: 0,
        queues: {},
        heartbeats: {},
        generatedAt: new Date().toISOString(),
      }),
      enqueue: originalEnqueue,
    } as unknown as QueueManager;

    const handle = instrumentBullMQ({
      queueManager,
      metrics: metrics.queue,
      logger: pino({ level: "silent" }),
      scrapeIntervalMs: 60_000,
    });

    const job = await queueManager.enqueue(
      "message.delivery" as never,
      { idempotencyKey: "k" }
    );
    expect(job?.id).toBe("job-1");
    expect(originalEnqueue).toHaveBeenCalled();

    handle.stop();
  });
});
