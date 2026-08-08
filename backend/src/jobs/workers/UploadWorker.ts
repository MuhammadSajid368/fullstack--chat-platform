import type { Logger } from "pino";
import type { IdempotencyStore } from "@jobs/IdempotencyStore.js";
import type { QueueManager } from "@jobs/QueueManager.js";
import { JobNames, QueueNames, type JobName } from "@jobs/types.js";
import { BaseWorker, type JobHandler } from "@jobs/workers/BaseWorker.js";

/**
 * Upload worker — virus scan / thumbnail / metadata / cleanup orchestration.
 * External scanners & storage remain out of scope; handlers are idempotent stubs.
 */
export class UploadWorker extends BaseWorker {
  constructor(
    queues: QueueManager,
    idempotency: IdempotencyStore,
    logger: Logger
  ) {
    super(QueueNames.UPLOAD, "upload-worker", queues, idempotency, logger);
  }

  protected handlers(): Partial<Record<JobName, JobHandler>> {
    return {
      [JobNames.UPLOAD_VIRUS_SCAN]: async (job) => {
        this.logger.info(
          { attachmentId: job.data.attachmentId },
          "upload.virusScan (skip placeholder — Uploads already marks SKIPPED)"
        );
      },
      [JobNames.UPLOAD_THUMBNAIL]: async (job) => {
        this.logger.debug(
          { attachmentId: job.data.attachmentId },
          "upload.thumbnail (no external storage)"
        );
      },
      [JobNames.UPLOAD_METADATA]: async (job) => {
        this.logger.debug(
          { attachmentId: job.data.attachmentId },
          "upload.metadata (no-op — metadata owned by UploadService)"
        );
      },
      [JobNames.UPLOAD_CLEANUP]: async (job) => {
        this.logger.info(
          { attachmentId: job.data.attachmentId, reason: job.data.reason },
          "upload.cleanup (placeholder — soft-delete via API/UploadService)"
        );
      },
    };
  }
}
