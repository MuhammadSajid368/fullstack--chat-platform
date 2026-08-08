import type { Logger } from "pino";
import type { QueueName } from "@jobs/types.js";

export type QueueMetricsSnapshot = {
  queueDepth: number;
  active: number;
  failed: number;
  completed: number;
  delayed: number;
  retryCount: number;
  avgExecutionMs: number;
  lastHeartbeatAt: string | null;
};

export type JobMetricsSnapshot = {
  queues: Record<string, QueueMetricsSnapshot>;
  workersHealthy: boolean;
  generatedAt: string;
};

type ExecSample = { totalMs: number; count: number };

/**
 * In-process job metrics — depth/health enriched from QueueManager.
 */
export class JobMetrics {
  private readonly retries = new Map<string, number>();
  private readonly exec = new Map<string, ExecSample>();
  private readonly heartbeats = new Map<string, number>();
  private readonly dlqCount = { value: 0 };

  constructor(private readonly logger: Logger) {}

  recordRetry(queue: QueueName | string): void {
    this.retries.set(queue, (this.retries.get(queue) ?? 0) + 1);
  }

  recordExecution(queue: QueueName | string, durationMs: number): void {
    const prev = this.exec.get(queue) ?? { totalMs: 0, count: 0 };
    this.exec.set(queue, {
      totalMs: prev.totalMs + durationMs,
      count: prev.count + 1,
    });
  }

  recordDlq(): void {
    this.dlqCount.value += 1;
  }

  recordHeartbeat(workerName: string): void {
    this.heartbeats.set(workerName, Date.now());
  }

  getRetryCount(queue: string): number {
    return this.retries.get(queue) ?? 0;
  }

  getAvgExecutionMs(queue: string): number {
    const sample = this.exec.get(queue);
    if (!sample || sample.count === 0) {
      return 0;
    }
    return Math.round(sample.totalMs / sample.count);
  }

  getDlqCount(): number {
    return this.dlqCount.value;
  }

  getHeartbeats(): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    for (const [name, ts] of this.heartbeats) {
      out[name] = new Date(ts).toISOString();
    }
    return out;
  }

  workersHealthy(staleMs = 60_000): boolean {
    if (this.heartbeats.size === 0) {
      return false;
    }
    const now = Date.now();
    for (const ts of this.heartbeats.values()) {
      if (now - ts >= staleMs) {
        return false;
      }
    }
    return true;
  }

  logInfo(msg: string, extra?: Record<string, unknown>): void {
    this.logger.info(extra ?? {}, msg);
  }
}
