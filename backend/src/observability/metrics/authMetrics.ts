import type { Counter } from "prom-client";
import type { MetricsRegistry } from "./registry.js";
import { METRIC_PREFIX } from "./registry.js";

const AUTH_LABELS = ["action", "result"] as const;
type AuthLabel = (typeof AUTH_LABELS)[number];

export type AuthAction = "login" | "logout" | "refresh" | "me" | "register";
export type AuthResult = "success" | "failure";

export class AuthMetrics {
  readonly attemptsTotal: Counter<AuthLabel>;

  constructor(registry: MetricsRegistry) {
    this.attemptsTotal = registry.counter<AuthLabel>({
      name: `${METRIC_PREFIX}auth_attempts_total`,
      help: "Authentication attempts by action and result.",
      labelNames: [...AUTH_LABELS],
    });
  }

  record(action: AuthAction, result: AuthResult): void {
    this.attemptsTotal.inc({ action, result });
  }
}
