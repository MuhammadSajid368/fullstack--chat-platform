import { describe, expect, it, vi, beforeEach } from "vitest";
import pino from "pino";
import { Redis } from "ioredis";
import { loadJobConfig, defaultJobOptions } from "../../src/jobs/jobConfig.js";
import { QueueManager } from "../../src/jobs/QueueManager.js";
import { IdempotencyStore } from "../../src/jobs/IdempotencyStore.js";
import { JobDispatcher } from "../../src/jobs/JobDispatcher.js";
import { JobMetrics } from "../../src/jobs/metrics/JobMetrics.js";
import {
  JobNames,
  QueueNames,
  queueForJob,
} from "../../src/jobs/types.js";
import { EventPublisher } from "../../src/websocket/EventPublisher.js";
import { RealtimeEvents } from "../../src/websocket/events.js";
import { createFakeRedis } from "../websocket/fakeRedis.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379/14";

async function redisBullMqReady(): Promise<boolean> {
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    connectTimeout: 1_000,
    enableOfflineQueue: false,
  });
  try {
    await client.connect();
    const info = await client.info("server");
    await client.quit();
    const match = /redis_version:(\d+)\./.exec(info);
    const major = match ? Number(match[1]) : 0;
    return major >= 5;
  } catch {
    try {
      client.disconnect();
    } catch {
      /* ignore */
    }
    return false;
  }
}

describe("Job types & config", () => {
  it("maps job names to queues", () => {
    expect(queueForJob(JobNames.MESSAGE_DELIVERY)).toBe(QueueNames.MESSAGE);
    expect(queueForJob(JobNames.NOTIFICATION_PUSH)).toBe(
      QueueNames.NOTIFICATION
    );
    expect(queueForJob(JobNames.UPLOAD_VIRUS_SCAN)).toBe(QueueNames.UPLOAD);
    expect(queueForJob(JobNames.SESSION_CLEANUP)).toBe(QueueNames.MAINTENANCE);
    expect(queueForJob(JobNames.CONVERSATION_UNREAD_RECONCILE)).toBe(
      QueueNames.CONVERSATION
    );
    expect(queueForJob(JobNames.PRESENCE_CLEANUP)).toBe(QueueNames.PRESENCE);
  });

  it("loads retry defaults with exponential backoff", () => {
    const config = loadJobConfig({
      JOBS_MAX_ATTEMPTS: "7",
      JOBS_BACKOFF_MS: "500",
    } as NodeJS.ProcessEnv);
    expect(config.maxAttempts).toBe(7);
    expect(config.backoffMs).toBe(500);
    const opts = defaultJobOptions(config);
    expect(opts.attempts).toBe(7);
    expect(opts.backoff).toEqual({ type: "exponential", delay: 500 });
  });

  it("can be disabled via JOBS_ENABLED=false", () => {
    expect(
      loadJobConfig({ JOBS_ENABLED: "false" } as NodeJS.ProcessEnv).enabled
    ).toBe(false);
  });
});

describe("JobMetrics", () => {
  it("tracks retries, duration, DLQ, heartbeats", () => {
    const metrics = new JobMetrics(pino({ level: "silent" }));
    metrics.recordRetry(QueueNames.MESSAGE);
    metrics.recordRetry(QueueNames.MESSAGE);
    metrics.recordExecution(QueueNames.MESSAGE, 100);
    metrics.recordExecution(QueueNames.MESSAGE, 200);
    metrics.recordDlq();
    metrics.recordHeartbeat("message-worker");

    expect(metrics.getRetryCount(QueueNames.MESSAGE)).toBe(2);
    expect(metrics.getAvgExecutionMs(QueueNames.MESSAGE)).toBe(150);
    expect(metrics.getDlqCount()).toBe(1);
    expect(metrics.workersHealthy(60_000)).toBe(true);
    expect(metrics.workersHealthy(0)).toBe(false);
  });
});

describe("IdempotencyStore", () => {
  it("claims once and skips duplicates", async () => {
    const redis = createFakeRedis();
    const store = new IdempotencyStore(
      redis,
      pino({ level: "silent" }),
      60
    );
    expect(await store.claim("k1")).toBe(true);
    expect(await store.claim("k1")).toBe(false);
    expect(await store.has("k1")).toBe(true);
    await store.release("k1");
    expect(await store.claim("k1")).toBe(true);
  });
});

describe("JobDispatcher (after-commit outbox)", () => {
  it("enqueues delivery + notification after message.created", async () => {
    const enqueue = vi.fn().mockResolvedValue({ id: "1" });
    const queues = { enqueue } as unknown as QueueManager;
    const publisher = new EventPublisher();
    const dispatcher = new JobDispatcher(
      publisher,
      queues,
      pino({ level: "silent" })
    );
    dispatcher.start();

    publisher.publish({
      name: RealtimeEvents.MESSAGE_CREATED,
      rooms: ["conversation:c1"],
      payload: {
        conversationId: "c1",
        message: { id: "m1" },
      },
    });

    await vi.waitFor(() => {
      expect(enqueue).toHaveBeenCalled();
    });

    expect(enqueue).toHaveBeenCalledWith(
      JobNames.MESSAGE_DELIVERY,
      expect.objectContaining({ messageId: "m1" }),
      expect.objectContaining({ jobId: "message.delivery:m1" })
    );
    expect(enqueue).toHaveBeenCalledWith(
      JobNames.NOTIFICATION_CREATE,
      expect.objectContaining({ messageId: "m1" }),
      expect.any(Object)
    );

    dispatcher.stop();
  });

  it("enqueues delayed upload.cleanup on upload.failed", async () => {
    const enqueue = vi.fn().mockResolvedValue({ id: "1" });
    const queues = { enqueue } as unknown as QueueManager;
    const publisher = new EventPublisher();
    const dispatcher = new JobDispatcher(
      publisher,
      queues,
      pino({ level: "silent" })
    );
    dispatcher.start();

    publisher.publish({
      name: RealtimeEvents.UPLOAD_FAILED,
      rooms: ["user:u1"],
      payload: { attachmentId: "att_1" },
    });

    await vi.waitFor(() => expect(enqueue).toHaveBeenCalled());
    expect(enqueue).toHaveBeenCalledWith(
      JobNames.UPLOAD_CLEANUP,
      expect.objectContaining({ attachmentId: "att_1" }),
      expect.objectContaining({ delayMs: 60_000 })
    );
    expect(enqueue).toHaveBeenCalledWith(
      JobNames.NOTIFICATION_CREATE,
      expect.objectContaining({
        kind: "upload.failed",
        attachmentId: "att_1",
      }),
      expect.any(Object)
    );
    dispatcher.stop();
  });

  it("enqueues upload pipeline on upload.completed", async () => {
    const enqueue = vi.fn().mockResolvedValue({ id: "1" });
    const queues = { enqueue } as unknown as QueueManager;
    const publisher = new EventPublisher();
    const dispatcher = new JobDispatcher(
      publisher,
      queues,
      pino({ level: "silent" })
    );
    dispatcher.start();

    publisher.publish({
      name: RealtimeEvents.UPLOAD_COMPLETED,
      rooms: ["user:u1"],
      payload: { attachmentId: "att_9" },
    });

    await vi.waitFor(() => expect(enqueue.mock.calls.length).toBeGreaterThanOrEqual(4));
    expect(enqueue).toHaveBeenCalledWith(
      JobNames.UPLOAD_VIRUS_SCAN,
      expect.any(Object),
      expect.any(Object)
    );
    expect(enqueue).toHaveBeenCalledWith(
      JobNames.UPLOAD_THUMBNAIL,
      expect.any(Object),
      expect.any(Object)
    );
    expect(enqueue).toHaveBeenCalledWith(
      JobNames.UPLOAD_METADATA,
      expect.any(Object),
      expect.any(Object)
    );
    expect(enqueue).toHaveBeenCalledWith(
      JobNames.NOTIFICATION_CREATE,
      expect.objectContaining({ kind: "upload.completed" }),
      expect.any(Object)
    );
    dispatcher.stop();
  });

  it("swallows enqueue errors without throwing to publisher", async () => {
    const enqueue = vi.fn().mockRejectedValue(new Error("redis down"));
    const queues = { enqueue } as unknown as QueueManager;
    const publisher = new EventPublisher();
    const dispatcher = new JobDispatcher(
      publisher,
      queues,
      pino({ level: "silent" })
    );
    dispatcher.start();
    expect(() =>
      publisher.publish({
        name: RealtimeEvents.MESSAGE_CREATED,
        rooms: [],
        payload: { message: { id: "m2" }, conversationId: "c" },
      })
    ).not.toThrow();
    await vi.waitFor(() => expect(enqueue).toHaveBeenCalled());
    dispatcher.stop();
  });
});

describe("QueueManager (BullMQ / Redis >= 5)", () => {
  let ready = false;

  beforeEach(async () => {
    ready = await redisBullMqReady();
  });

  it("creates queues, runs jobs, delayed, duplicate jobId, DLQ, shutdown", async () => {
    if (!ready) {
      // Local Redis 3.x / Memurai or missing Redis — unit coverage above still runs.
      expect(ready).toBe(false);
      return;
    }

    const logger = pino({ level: "silent" });
    const config = loadJobConfig({
      JOBS_ENABLED: "true",
      JOBS_MAX_ATTEMPTS: "3",
      JOBS_BACKOFF_MS: "50",
      JOBS_PREFIX: `test:${Date.now()}`,
      JOBS_CONCURRENCY: "1",
    } as NodeJS.ProcessEnv);

    const manager = new QueueManager(REDIS_URL, config, logger);
    await manager.start();

    const depths = await manager.getDepth(QueueNames.MESSAGE);
    expect(depths.waiting).toBeGreaterThanOrEqual(0);

    const job = await manager.enqueue(JobNames.NOTIFICATION_CREATE, {
      messageId: "m_ok",
      kind: "test",
      idempotencyKey: `test:notif:${Date.now()}`,
    });
    expect(job).not.toBeNull();

    await manager.enqueue(
      JobNames.MESSAGE_EXPIRE,
      { scheduled: false, idempotencyKey: `expire:${Date.now()}` },
      { delayMs: 500 }
    );

    const key = `dup:${Date.now()}`;
    await manager.enqueue(
      JobNames.NOTIFICATION_CLEANUP,
      { idempotencyKey: key },
      { jobId: key }
    );
    const dup = await manager.enqueue(
      JobNames.NOTIFICATION_CLEANUP,
      { idempotencyKey: key },
      { jobId: key }
    );
    expect(dup).toBeNull();

    await manager.moveToDlq({
      sourceQueue: QueueNames.MESSAGE,
      jobName: JobNames.MESSAGE_DELIVERY,
      jobId: "poison-1",
      payload: { messageId: "x" },
      failedReason: "boom",
      attemptsMade: 3,
    });
    expect(manager.metrics.getDlqCount()).toBe(1);

    const health = await manager.getHealth();
    expect(health.redis).toBe("ok");

    await manager.close();
    const afterClose = await manager.enqueue(JobNames.AUDIT_CLEANUP, {
      idempotencyKey: "after-close",
    });
    expect(afterClose).toBeNull();
  }, 30_000);

  it("rejects Redis < 5 with a clear error", async () => {
    if (ready) {
      // Compatible Redis — version gate already passed in start(); skip negative path.
      expect(ready).toBe(true);
      return;
    }

    const logger = pino({ level: "silent" });
    const config = loadJobConfig({
      JOBS_PREFIX: "vertest",
    } as NodeJS.ProcessEnv);
    const manager = new QueueManager(REDIS_URL, config, logger);
    await expect(manager.start()).rejects.toThrow(
      /Redis|ECONNREFUSED|unsupported|Connection is closed/i
    );
    try {
      await manager.close();
    } catch {
      /* ignore */
    }
  }, 10_000);

  it("handles unreachable Redis on start", async () => {
    const logger = pino({ level: "silent" });
    const config = loadJobConfig({
      JOBS_PREFIX: "failtest",
    } as NodeJS.ProcessEnv);
    const manager = new QueueManager("redis://127.0.0.1:1", config, logger);
    manager.getConnection().on("error", () => undefined);
    await expect(manager.start()).rejects.toThrow();
    try {
      await manager.close();
    } catch {
      /* ignore */
    }
  }, 10_000);
});
