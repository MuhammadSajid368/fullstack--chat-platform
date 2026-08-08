import type { Counter, Histogram } from "prom-client";
import type { MetricsRegistry } from "./registry.js";
import { METRIC_PREFIX } from "./registry.js";

const NOTIF_LABELS = ["channel", "status"] as const;
type NotifLabel = (typeof NOTIF_LABELS)[number];

const NOTIF_CHANNEL_LABELS = ["channel"] as const;
type NotifChannelLabel = (typeof NOTIF_CHANNEL_LABELS)[number];

const NOTIF_BUCKETS_SECONDS = [
  0.005, 0.025, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30,
];

export class NotificationMetrics {
  readonly deliveredTotal: Counter<NotifLabel>;
  readonly sendDurationSeconds: Histogram<NotifChannelLabel>;

  constructor(registry: MetricsRegistry) {
    this.deliveredTotal = registry.counter<NotifLabel>({
      name: `${METRIC_PREFIX}notifications_delivered_total`,
      help: "Total notifications processed, labelled by channel and terminal status.",
      labelNames: [...NOTIF_LABELS],
    });

    this.sendDurationSeconds = registry.histogram<NotifChannelLabel>({
      name: `${METRIC_PREFIX}notifications_send_duration_seconds`,
      help: "Time spent sending a notification via a specific channel.",
      labelNames: [...NOTIF_CHANNEL_LABELS],
      buckets: NOTIF_BUCKETS_SECONDS,
    });
  }

  recordDelivered(channel: string, status: string): void {
    this.deliveredTotal.inc({ channel, status });
  }

  observeSend(channel: string, durationSeconds: number): void {
    this.sendDurationSeconds.observe({ channel }, durationSeconds);
  }
}
