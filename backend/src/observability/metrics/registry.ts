import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
  type CounterConfiguration,
  type GaugeConfiguration,
  type HistogramConfiguration,
} from "prom-client";

/**
 * Metric name prefix — all custom metrics share this namespace so operators
 * can scope alerts and dashboards without conflicting with other services.
 */
export const METRIC_PREFIX = "chat_backend_";

/**
 * Central Prometheus registry.
 *
 * - Lazy: metric families are constructed on first access.
 * - Non-blocking: default collectors run on Node event loop hooks, never sync work.
 * - Idempotent: re-getting a metric returns the same instance.
 * - Reset-friendly: `dispose()` clears state for tests.
 */
export class MetricsRegistry {
  readonly registry: Registry;
  private readonly counters = new Map<string, Counter<string>>();
  private readonly gauges = new Map<string, Gauge<string>>();
  private readonly histograms = new Map<string, Histogram<string>>();
  private defaultCollected = false;

  constructor(defaultLabels: Record<string, string> = {}) {
    this.registry = new Registry();
    this.registry.setDefaultLabels(defaultLabels);
  }

  /**
   * Enable Node.js default metrics (event loop lag, GC, memory, CPU).
   * Idempotent; safe to call multiple times.
   */
  enableDefaultCollectors(): void {
    if (this.defaultCollected) {
      return;
    }
    this.defaultCollected = true;
    collectDefaultMetrics({
      register: this.registry,
      prefix: METRIC_PREFIX,
    });
  }

  counter<L extends string>(config: CounterConfiguration<L>): Counter<L> {
    const key = config.name;
    const existing = this.counters.get(key);
    if (existing) {
      return existing as unknown as Counter<L>;
    }
    const created = new Counter<L>({ ...config, registers: [this.registry] });
    this.counters.set(key, created as unknown as Counter<string>);
    return created;
  }

  gauge<L extends string>(config: GaugeConfiguration<L>): Gauge<L> {
    const key = config.name;
    const existing = this.gauges.get(key);
    if (existing) {
      return existing as unknown as Gauge<L>;
    }
    const created = new Gauge<L>({ ...config, registers: [this.registry] });
    this.gauges.set(key, created as unknown as Gauge<string>);
    return created;
  }

  histogram<L extends string>(
    config: HistogramConfiguration<L>
  ): Histogram<L> {
    const key = config.name;
    const existing = this.histograms.get(key);
    if (existing) {
      return existing as unknown as Histogram<L>;
    }
    const created = new Histogram<L>({
      ...config,
      registers: [this.registry],
    });
    this.histograms.set(key, created as unknown as Histogram<string>);
    return created;
  }

  contentType(): string {
    return this.registry.contentType;
  }

  async metrics(): Promise<string> {
    return this.registry.metrics();
  }

  dispose(): void {
    this.registry.clear();
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.defaultCollected = false;
  }
}
