import { Worker, type Job, type Processor } from "bullmq";
import type { Logger } from "pino";
import type { IdempotencyStore } from "@jobs/IdempotencyStore.js";
import type { QueueManager } from "@jobs/QueueManager.js";
import type { JobName, JobPayload, QueueName } from "@jobs/types.js";

export type JobHandler = (job: Job<JobPayload>) => Promise<void>;

/**
 * Base BullMQ worker — logging, metrics, retries, DLQ, idempotency.
 * Subclasses map job names → handlers. No Prisma here.
 */
export abstract class BaseWorker {
  protected worker: Worker<JobPayload> | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(
    protected readonly queueName: QueueName,
    protected readonly workerName: string,
    protected readonly queues: QueueManager,
    protected readonly idempotency: IdempotencyStore,
    protected readonly logger: Logger
  ) {}

  protected abstract handlers(): Partial<Record<JobName, JobHandler>>;

  start(): void {
    const config = this.queues.getJobConfig();
    const processor: Processor<JobPayload> = async (job) => {
      await this.process(job);
    };

    this.worker = new Worker(this.queueName, processor, {
      connection: this.queues.getConnectionOptions(),
      prefix: config.prefix,
      concurrency: config.concurrency,
    });

    this.worker.on("active", (job) => {
      this.logger.info(
        {
          queue: this.queueName,
          jobName: job.name,
          jobId: job.id,
          attempt: job.attemptsMade + 1,
        },
        "Job started"
      );
    });

    this.worker.on("completed", (job) => {
      this.logger.info(
        {
          queue: this.queueName,
          jobName: job.name,
          jobId: job.id,
        },
        "Job completed"
      );
    });

    this.worker.on("failed", (job, err) => {
      const attempts = job?.attemptsMade ?? 0;
      const max = job?.opts.attempts ?? config.maxAttempts;
      this.queues.metrics.recordRetry(this.queueName);
      this.logger.warn(
        {
          queue: this.queueName,
          jobName: job?.name,
          jobId: job?.id,
          attempt: attempts,
          maxAttempts: max,
          err: err.message,
        },
        attempts < max ? "Retry" : "Job failed"
      );

      if (job && attempts >= max) {
        void this.queues.moveToDlq({
          sourceQueue: this.queueName,
          jobName: job.name,
          jobId: job.id,
          payload: job.data ?? {},
          failedReason: err.message,
          attemptsMade: attempts,
        });
      }
    });

    this.worker.on("error", (err) => {
      this.logger.error({ err, queue: this.queueName }, "Worker error");
    });

    this.heartbeatTimer = setInterval(() => {
      this.queues.metrics.recordHeartbeat(this.workerName);
    }, 15_000);
    this.heartbeatTimer.unref();
    this.queues.metrics.recordHeartbeat(this.workerName);

    this.logger.info(
      { queue: this.queueName, worker: this.workerName },
      "Worker registered"
    );
  }

  private async process(job: Job<JobPayload>): Promise<void> {
    const started = Date.now();
    const handlers = this.handlers();
    const handler = handlers[job.name as JobName];
    if (!handler) {
      this.logger.warn(
        { queue: this.queueName, jobName: job.name },
        "No handler for job — completing"
      );
      return;
    }

    const idemKey =
      typeof job.data?.idempotencyKey === "string"
        ? job.data.idempotencyKey
        : `${job.name}:${job.id}`;

    const claimed = await this.idempotency.claim(idemKey);
    if (!claimed) {
      this.logger.info(
        { queue: this.queueName, jobName: job.name, jobId: job.id },
        "Duplicate job skipped"
      );
      return;
    }

    try {
      await handler(job);
      this.queues.metrics.recordExecution(this.queueName, Date.now() - started);
      this.logger.info(
        {
          queue: this.queueName,
          jobName: job.name,
          jobId: job.id,
          durationMs: Date.now() - started,
        },
        "Job completed"
      );
    } catch (err) {
      // Release claim so a retry can re-run the handler.
      await this.idempotency.release(idemKey);
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      this.logger.info(
        { queue: this.queueName, worker: this.workerName },
        "Worker stopped"
      );
    }
  }
}
