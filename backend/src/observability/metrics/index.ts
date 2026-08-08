import { AuthMetrics } from "./authMetrics.js";
import { DbMetrics } from "./dbMetrics.js";
import { HttpMetrics } from "./httpMetrics.js";
import { NotificationMetrics } from "./notificationMetrics.js";
import { PresenceMetrics } from "./presenceMetrics.js";
import { QueueMetrics } from "./queueMetrics.js";
import { RedisMetrics } from "./redisMetrics.js";
import { SearchMetrics } from "./searchMetrics.js";
import { SocketMetrics } from "./socketMetrics.js";
import { UploadMetrics } from "./uploadMetrics.js";
import { MetricsRegistry } from "./registry.js";

/**
 * Aggregate accessor for every metric family. Owned by the observability
 * bootstrap; passed through DI to modules that need to record metrics.
 */
export class MetricsFacade {
  readonly registry: MetricsRegistry;
  readonly http: HttpMetrics;
  readonly db: DbMetrics;
  readonly redis: RedisMetrics;
  readonly queue: QueueMetrics;
  readonly socket: SocketMetrics;
  readonly auth: AuthMetrics;
  readonly upload: UploadMetrics;
  readonly search: SearchMetrics;
  readonly notification: NotificationMetrics;
  readonly presence: PresenceMetrics;

  constructor(defaultLabels: Record<string, string> = {}) {
    this.registry = new MetricsRegistry(defaultLabels);
    this.http = new HttpMetrics(this.registry);
    this.db = new DbMetrics(this.registry);
    this.redis = new RedisMetrics(this.registry);
    this.queue = new QueueMetrics(this.registry);
    this.socket = new SocketMetrics(this.registry);
    this.auth = new AuthMetrics(this.registry);
    this.upload = new UploadMetrics(this.registry);
    this.search = new SearchMetrics(this.registry);
    this.notification = new NotificationMetrics(this.registry);
    this.presence = new PresenceMetrics(this.registry);
  }

  enableDefaultCollectors(): void {
    this.registry.enableDefaultCollectors();
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }

  contentType(): string {
    return this.registry.contentType();
  }

  dispose(): void {
    this.registry.dispose();
  }
}

export { MetricsRegistry, METRIC_PREFIX } from "./registry.js";
export { HttpMetrics } from "./httpMetrics.js";
export { DbMetrics } from "./dbMetrics.js";
export { RedisMetrics } from "./redisMetrics.js";
export { QueueMetrics } from "./queueMetrics.js";
export { SocketMetrics } from "./socketMetrics.js";
export { AuthMetrics } from "./authMetrics.js";
export { UploadMetrics } from "./uploadMetrics.js";
export { SearchMetrics } from "./searchMetrics.js";
export { NotificationMetrics } from "./notificationMetrics.js";
export { PresenceMetrics } from "./presenceMetrics.js";
export type { AuthAction, AuthResult } from "./authMetrics.js";
