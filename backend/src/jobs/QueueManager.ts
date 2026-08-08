import {
  Queue,
  type ConnectionOptions,
  type JobsOptions,
  type Job,
} from "bullmq";
import { Redis } from "ioredis";
import type { Logger } from "pino";
import {
  defaultJobOptions,
  type JobConfig,
} from "@jobs/jobConfig.js";
import { JobMetrics } from "@jobs/metrics/JobMetrics.js";
import {
  JobNames,
  QueueNames,
  queueForJob,
  type JobName,
  type JobPayload,
  type QueueName,
} from "@jobs/types.js";

export type EnqueueOptions = {
  delayMs?: number;
  jobId?: string;
  attempts?: number;
};

export type QueueDepthStats = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
};

export type QueueHealthReport = {
  status: "ok" | "degraded" | "down";
  redis: "ok" | "down";
  workersHealthy: boolean;
  dlqCount: number;
  queues: Record<
    string,
    QueueDepthStats & {
      retryCount: number;
      avgExecutionMs: number;
      lastHeartbeatAt: string | null;
    }
  >;
  heartbeats: Record<string, string | null>;
  generatedAt: string;
};

/**
 * BullMQ queue manager — Redis-backed queues, DLQ, metrics, graceful close.
 * No Prisma. No domain business logic.
 */
export class QueueManager {
  private readonly connection: Redis;
  private readonly queues = new Map<QueueName, Queue>();
  private readonly jobDefaults: JobsOptions;
  readonly metrics: JobMetrics;
  private closed = false;

  constructor(
    private readonly redisUrl: string,
    private readonly config: JobConfig,
    private readonly logger: Logger
  ) {
    this.connection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    this.metrics = new JobMetrics(logger);
    this.jobDefaults = defaultJobOptions(config);
  }

  getConnectionOptions(): ConnectionOptions {
    return {
      url: this.redisUrl,
      maxRetriesPerRequest: null,
    };
  }

  getJobConfig(): JobConfig {
    return this.config;
  }

  getConnection(): Redis {
    return this.connection;
  }

  async start(): Promise<void> {
    if (this.connection.status === "wait") {
      await this.connection.connect();
    }

    const info = await this.connection.info("server");
    const versionMatch = /redis_version:(\d+)\.(\d+)/.exec(info);
    if (versionMatch) {
      const major = Number(versionMatch[1]);
      if (major < 5) {
        throw new Error(
          `Redis ${versionMatch[1]}.${versionMatch[2]} is unsupported; BullMQ requires Redis >= 5.0.0`
        );
      }
    }

    const names: QueueName[] = [
      QueueNames.MESSAGE,
      QueueNames.NOTIFICATION,
      QueueNames.UPLOAD,
      QueueNames.CONVERSATION,
      QueueNames.PRESENCE,
      QueueNames.MAINTENANCE,
      QueueNames.DLQ,
    ];

    for (const name of names) {
      const queue = new Queue(name, {
        connection: this.getConnectionOptions(),
        prefix: this.config.prefix,
        defaultJobOptions: this.jobDefaults,
      });
      this.queues.set(name, queue);
      this.logger.info({ queue: name }, "Queue created");
    }
  }

  getQueue(name: QueueName): Queue {
    const queue = this.queues.get(name);
    if (!queue) {
      throw new Error(`Queue not started: ${name}`);
    }
    return queue;
  }

  async enqueue(
    jobName: JobName,
    payload: JobPayload,
    options?: EnqueueOptions
  ): Promise<Job | null> {
    if (this.closed) {
      this.logger.warn({ jobName }, "Enqueue skipped — manager closed");
      return null;
    }

    const queueName = queueForJob(jobName);
    const queue = this.getQueue(queueName);
    try {
      const job = await queue.add(jobName, payload, {
        ...this.jobDefaults,
        attempts: options?.attempts ?? this.jobDefaults.attempts,
        delay: options?.delayMs,
        jobId: options?.jobId,
      });

      this.logger.info(
        {
          queue: queueName,
          jobName,
          jobId: job.id,
          delayMs: options?.delayMs ?? 0,
        },
        "Job queued"
      );

      return job;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (options?.jobId && /already exists|Job.*?exist/i.test(message)) {
        this.logger.debug(
          { queue: queueName, jobName, jobId: options.jobId },
          "Duplicate jobId skipped"
        );
        return null;
      }
      throw err;
    }
  }

  /**
   * Move exhausted/poison job payload into the DLQ queue.
   */
  async moveToDlq(input: {
    sourceQueue: string;
    jobName: string;
    jobId?: string;
    payload: JobPayload;
    failedReason?: string;
    attemptsMade?: number;
  }): Promise<void> {
    const dlq = this.getQueue(QueueNames.DLQ);
    await dlq.add(
      `dlq:${input.jobName}`,
      {
        ...input.payload,
        __dlq: {
          sourceQueue: input.sourceQueue,
          jobName: input.jobName,
          jobId: input.jobId,
          failedReason: input.failedReason,
          attemptsMade: input.attemptsMade,
          movedAt: new Date().toISOString(),
        },
      },
      {
        removeOnComplete: false,
        removeOnFail: false,
        attempts: 1,
      }
    );
    this.metrics.recordDlq();
    this.logger.error(
      {
        sourceQueue: input.sourceQueue,
        jobName: input.jobName,
        jobId: input.jobId,
        attemptsMade: input.attemptsMade,
      },
      "DLQ"
    );
  }

  async scheduleRepeatableJobs(): Promise<void> {
    const { schedules } = this.config;

    await this.addRepeatable(
      QueueNames.PRESENCE,
      JobNames.PRESENCE_CLEANUP,
      schedules.presenceCleanup
    );
    await this.addRepeatable(
      QueueNames.MAINTENANCE,
      JobNames.SESSION_CLEANUP,
      schedules.sessionCleanup
    );
    await this.addRepeatable(
      QueueNames.MAINTENANCE,
      JobNames.AUDIT_CLEANUP,
      schedules.auditCleanup
    );
    await this.addRepeatable(
      QueueNames.MAINTENANCE,
      JobNames.ATTACHMENT_CLEANUP,
      schedules.attachmentCleanup
    );
    await this.addRepeatable(
      QueueNames.NOTIFICATION,
      JobNames.NOTIFICATION_CLEANUP,
      schedules.notificationCleanup
    );
    await this.addRepeatable(
      QueueNames.MESSAGE,
      JobNames.MESSAGE_EXPIRE,
      schedules.messageExpire
    );
    await this.addRepeatable(
      QueueNames.CONVERSATION,
      JobNames.CONVERSATION_UNREAD_RECONCILE,
      schedules.unreadReconcile
    );
    await this.addRepeatable(
      QueueNames.CONVERSATION,
      JobNames.CONVERSATION_LAST_MESSAGE_REPAIR,
      schedules.lastMessageRepair
    );
  }

  private async addRepeatable(
    queueName: QueueName,
    jobName: JobName,
    pattern: string
  ): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.add(
      jobName,
      { scheduled: true },
      {
        repeat: { pattern },
        jobId: `repeat:${jobName}`,
        ...this.jobDefaults,
      }
    );
    this.logger.info(
      { queue: queueName, jobName, pattern },
      "Repeatable job scheduled"
    );
  }

  async getDepth(queueName: QueueName): Promise<QueueDepthStats> {
    const queue = this.getQueue(queueName);
    const counts = await queue.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "failed",
      "completed"
    );
    return {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
      completed: counts.completed ?? 0,
    };
  }

  async getHealth(): Promise<QueueHealthReport> {
    let redisStatus: "ok" | "down" = "ok";
    try {
      const pong = await this.connection.ping();
      if (pong !== "PONG") {
        redisStatus = "down";
      }
    } catch {
      redisStatus = "down";
    }

    const queues: QueueHealthReport["queues"] = {};
    const heartbeats = this.metrics.getHeartbeats();

    if (redisStatus === "ok") {
      for (const name of this.queues.keys()) {
        if (name === QueueNames.DLQ) {
          continue;
        }
        const depth = await this.getDepth(name);
        queues[name] = {
          ...depth,
          retryCount: this.metrics.getRetryCount(name),
          avgExecutionMs: this.metrics.getAvgExecutionMs(name),
          lastHeartbeatAt: heartbeats[`${name}-worker`] ?? null,
        };
      }
    }

    const workersHealthy = this.metrics.workersHealthy();
    let status: QueueHealthReport["status"] = "ok";
    if (redisStatus === "down") {
      status = "down";
    } else if (!workersHealthy) {
      status = "degraded";
    }

    return {
      status,
      redis: redisStatus,
      workersHealthy,
      dlqCount: this.metrics.getDlqCount(),
      queues,
      heartbeats,
      generatedAt: new Date().toISOString(),
    };
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const [name, queue] of this.queues) {
      try {
        await queue.close();
        this.logger.info({ queue: name }, "Queue closed");
      } catch (err) {
        this.logger.error({ err, queue: name }, "Error closing queue");
      }
    }
    this.queues.clear();
    try {
      await this.connection.quit();
    } catch {
      this.connection.disconnect();
    }
  }
}
