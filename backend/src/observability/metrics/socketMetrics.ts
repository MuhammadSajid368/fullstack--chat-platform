import type { Counter, Gauge, Histogram } from "prom-client";
import type { MetricsRegistry } from "./registry.js";
import { METRIC_PREFIX } from "./registry.js";

const SOCKET_LABELS = [] as const;

const SOCKET_EVENT_LABELS = ["direction", "event"] as const;
type SocketEventLabel = (typeof SOCKET_EVENT_LABELS)[number];

const DISCONNECT_LABELS = ["reason"] as const;
type DisconnectLabel = (typeof DISCONNECT_LABELS)[number];

const PUBLISH_LABELS = ["event"] as const;
type PublishLabel = (typeof PUBLISH_LABELS)[number];

const PUBLISH_BUCKETS_SECONDS = [
  0.0005, 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1,
];

export class SocketMetrics {
  readonly connections: Gauge<never>;
  readonly connectionsTotal: Counter<never>;
  readonly disconnectionsTotal: Counter<DisconnectLabel>;
  readonly eventsTotal: Counter<SocketEventLabel>;
  readonly presenceOnlineCount: Gauge<never>;
  readonly publishDurationSeconds: Histogram<PublishLabel>;

  constructor(private readonly registry: MetricsRegistry) {
    this.connections = registry.gauge({
      name: `${METRIC_PREFIX}socket_connections`,
      help: "Current number of active Socket.IO connections.",
      labelNames: [...SOCKET_LABELS],
    });

    this.connectionsTotal = registry.counter({
      name: `${METRIC_PREFIX}socket_connections_total`,
      help: "Total Socket.IO connections accepted since process start.",
      labelNames: [...SOCKET_LABELS],
    });

    this.disconnectionsTotal = registry.counter<DisconnectLabel>({
      name: `${METRIC_PREFIX}socket_disconnections_total`,
      help: "Total Socket.IO disconnections, labelled by reason.",
      labelNames: [...DISCONNECT_LABELS],
    });

    this.eventsTotal = registry.counter<SocketEventLabel>({
      name: `${METRIC_PREFIX}socket_events_total`,
      help: "Total Socket.IO events observed, in and out.",
      labelNames: [...SOCKET_EVENT_LABELS],
    });

    this.presenceOnlineCount = registry.gauge({
      name: `${METRIC_PREFIX}presence_online_count`,
      help: "Number of users currently reported as online by the presence subsystem.",
      labelNames: [...SOCKET_LABELS],
    });

    this.publishDurationSeconds = registry.histogram<PublishLabel>({
      name: `${METRIC_PREFIX}socket_publish_duration_seconds`,
      help: "Duration of Socket.IO fan-out publishes in seconds.",
      labelNames: [...PUBLISH_LABELS],
      buckets: PUBLISH_BUCKETS_SECONDS,
    });
  }

  recordConnection(): void {
    this.connections.inc();
    this.connectionsTotal.inc();
  }

  recordDisconnection(reason: string): void {
    this.connections.dec();
    this.disconnectionsTotal.inc({ reason });
  }

  recordEvent(direction: "in" | "out", event: string): void {
    this.eventsTotal.inc({ direction, event });
  }

  setPresenceOnline(count: number): void {
    this.presenceOnlineCount.set(count);
  }

  observePublish(event: string, durationSeconds: number): void {
    this.publishDurationSeconds.observe({ event }, durationSeconds);
  }

  reset(): void {
    this.connections.reset();
    this.presenceOnlineCount.reset();
  }
}
