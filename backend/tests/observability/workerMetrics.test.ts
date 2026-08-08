import { afterEach, describe, expect, it } from "vitest";
import { MetricsFacade, METRIC_PREFIX } from "../../src/observability/metrics/index.js";

const disposables: MetricsFacade[] = [];

afterEach(() => {
  while (disposables.length > 0) {
    disposables.pop()?.dispose();
  }
});

describe("worker metrics", () => {
  it("records execution duration histograms", async () => {
    const metrics = new MetricsFacade();
    disposables.push(metrics);

    metrics.queue.observeExecution("upload", "upload.thumbnail", 0.1);
    metrics.queue.observeExecution("upload", "upload.thumbnail", 0.35);
    metrics.queue.observeExecution("upload", "upload.thumbnail", 1.2);

    const output = await metrics.render();
    expect(output).toContain(
      `${METRIC_PREFIX}worker_execution_duration_seconds`
    );
    expect(output).toMatch(
      /worker_execution_duration_seconds_count\{queue="upload",job_name="upload\.thumbnail"\} 3/
    );
    expect(output).toMatch(
      /worker_execution_duration_seconds_sum\{queue="upload",job_name="upload\.thumbnail"\}/
    );
  });

  it("heartbeat records active timestamp and mark inactive drops gauge", async () => {
    const metrics = new MetricsFacade();
    disposables.push(metrics);

    metrics.queue.recordHeartbeat("message", "message-worker");
    let output = await metrics.render();
    expect(output).toMatch(
      /worker_active\{queue="message",worker="message-worker"\} 1/
    );

    metrics.queue.markWorkerInactive("message", "message-worker");
    output = await metrics.render();
    expect(output).toMatch(
      /worker_active\{queue="message",worker="message-worker"\} 0/
    );
  });

  it("notification throughput can be derived from queue metrics", async () => {
    const metrics = new MetricsFacade();
    disposables.push(metrics);

    for (let i = 0; i < 5; i += 1) {
      metrics.queue.observeExecution(
        "notification",
        "notification.push",
        0.05
      );
    }
    metrics.notification.recordDelivered("push", "sent");
    metrics.notification.recordDelivered("email", "sent");
    metrics.notification.recordDelivered("email", "failed");
    metrics.notification.observeSend("push", 0.03);

    const output = await metrics.render();
    expect(output).toMatch(
      /worker_execution_duration_seconds_count\{queue="notification",job_name="notification\.push"\} 5/
    );
    expect(output).toContain(
      `${METRIC_PREFIX}notifications_delivered_total`
    );
    expect(output).toMatch(/channel="push"[^\n]*status="sent"/);
    expect(output).toMatch(/channel="email"[^\n]*status="failed"/);
  });
});
