/**
 * Queue / job name catalog — transport only; no business rules.
 */

export const QueueNames = {
  MESSAGE: "message",
  NOTIFICATION: "notification",
  UPLOAD: "upload",
  CONVERSATION: "conversation",
  PRESENCE: "presence",
  MAINTENANCE: "maintenance",
  DLQ: "dlq",
} as const;

export type QueueName = (typeof QueueNames)[keyof typeof QueueNames];

export const JobNames = {
  // Message
  MESSAGE_DELIVERY: "message.delivery",
  MESSAGE_RETRY: "message.retry",
  MESSAGE_EXPIRE: "message.expire",

  // Notification
  NOTIFICATION_CREATE: "notification.create",
  NOTIFICATION_PUSH: "notification.push",
  NOTIFICATION_EMAIL: "notification.email",
  NOTIFICATION_CLEANUP: "notification.cleanup",

  // Upload
  UPLOAD_VIRUS_SCAN: "upload.virusScan",
  UPLOAD_THUMBNAIL: "upload.thumbnail",
  UPLOAD_METADATA: "upload.metadata",
  UPLOAD_CLEANUP: "upload.cleanup",

  // Conversation
  CONVERSATION_UNREAD_RECONCILE: "conversation.unreadReconcile",
  CONVERSATION_LAST_MESSAGE_REPAIR: "conversation.lastMessageRepair",

  // Presence
  PRESENCE_CLEANUP: "presence.cleanup",
  PRESENCE_LAST_SEEN: "presence.lastSeen",

  // Maintenance
  AUDIT_CLEANUP: "audit.cleanup",
  SESSION_CLEANUP: "session.cleanup",
  ATTACHMENT_CLEANUP: "attachment.cleanup",
} as const;

export type JobName = (typeof JobNames)[keyof typeof JobNames];

export type JobPayload = Record<string, unknown> & {
  /** Stable key for idempotent handling (duplicates are no-ops). */
  idempotencyKey?: string;
};

export const QUEUE_JOBS: Record<
  Exclude<QueueName, "dlq">,
  readonly JobName[]
> = {
  [QueueNames.MESSAGE]: [
    JobNames.MESSAGE_DELIVERY,
    JobNames.MESSAGE_RETRY,
    JobNames.MESSAGE_EXPIRE,
  ],
  [QueueNames.NOTIFICATION]: [
    JobNames.NOTIFICATION_CREATE,
    JobNames.NOTIFICATION_PUSH,
    JobNames.NOTIFICATION_EMAIL,
    JobNames.NOTIFICATION_CLEANUP,
  ],
  [QueueNames.UPLOAD]: [
    JobNames.UPLOAD_VIRUS_SCAN,
    JobNames.UPLOAD_THUMBNAIL,
    JobNames.UPLOAD_METADATA,
    JobNames.UPLOAD_CLEANUP,
  ],
  [QueueNames.CONVERSATION]: [
    JobNames.CONVERSATION_UNREAD_RECONCILE,
    JobNames.CONVERSATION_LAST_MESSAGE_REPAIR,
  ],
  [QueueNames.PRESENCE]: [
    JobNames.PRESENCE_CLEANUP,
    JobNames.PRESENCE_LAST_SEEN,
  ],
  [QueueNames.MAINTENANCE]: [
    JobNames.AUDIT_CLEANUP,
    JobNames.SESSION_CLEANUP,
    JobNames.ATTACHMENT_CLEANUP,
  ],
};

export function queueForJob(jobName: JobName): Exclude<QueueName, "dlq"> {
  for (const [queue, jobs] of Object.entries(QUEUE_JOBS) as Array<
    [Exclude<QueueName, "dlq">, readonly JobName[]]
  >) {
    if (jobs.includes(jobName)) {
      return queue;
    }
  }
  throw new Error(`Unknown job name: ${jobName}`);
}
