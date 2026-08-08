import type { Counter, Gauge } from "prom-client";
import type { MetricsRegistry } from "./registry.js";
import { METRIC_PREFIX } from "./registry.js";

const CHANGE_LABELS = ["kind"] as const;
type ChangeLabel = (typeof CHANGE_LABELS)[number];

const TYPING_LABELS = ["action"] as const;
type TypingLabel = (typeof TYPING_LABELS)[number];

/**
 * Presence-domain Prometheus metrics.
 */
export class PresenceMetrics {
  readonly onlineUsers: Gauge<never>;
  readonly typingUsers: Gauge<never>;
  readonly activeDevices: Gauge<never>;
  readonly changesTotal: Counter<ChangeLabel>;
  readonly typingEventsTotal: Counter<TypingLabel>;

  constructor(registry: MetricsRegistry) {
    this.onlineUsers = registry.gauge({
      name: `${METRIC_PREFIX}presence_online_users`,
      help: "Users currently connected with at least one device.",
      labelNames: [],
    });

    this.typingUsers = registry.gauge({
      name: `${METRIC_PREFIX}presence_typing_users`,
      help: "Users currently marked as typing across conversations.",
      labelNames: [],
    });

    this.activeDevices = registry.gauge({
      name: `${METRIC_PREFIX}presence_active_devices`,
      help: "Total active device socket bindings tracked in Redis.",
      labelNames: [],
    });

    this.changesTotal = registry.counter<ChangeLabel>({
      name: `${METRIC_PREFIX}presence_changes_total`,
      help: "Presence state transitions (online/offline/status/privacy).",
      labelNames: [...CHANGE_LABELS],
    });

    this.typingEventsTotal = registry.counter<TypingLabel>({
      name: `${METRIC_PREFIX}presence_typing_events_total`,
      help: "Typing start/stop events that were published.",
      labelNames: [...TYPING_LABELS],
    });
  }

  setOnlineUsers(count: number): void {
    this.onlineUsers.set(count);
  }

  setTypingUsers(count: number): void {
    this.typingUsers.set(count);
  }

  setActiveDevices(count: number): void {
    this.activeDevices.set(count);
  }

  recordPresenceChange(kind: string): void {
    this.changesTotal.inc({ kind });
  }

  recordTypingChange(action: "start" | "stop"): void {
    this.typingEventsTotal.inc({ action });
  }
}
