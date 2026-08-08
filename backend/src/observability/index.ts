import type { Logger } from "pino";
import type { AppConfig } from "@config/index.js";
import { MetricsFacade } from "./metrics/index.js";
import { HealthMonitor } from "./health/HealthMonitor.js";
import { initTracing, type TracingHandle } from "./tracing/index.js";

export type ObservabilityHandle = {
  readonly metrics: MetricsFacade;
  readonly health: HealthMonitor;
  readonly tracing: TracingHandle;
  shutdown(): Promise<void>;
};

/**
 * Initialises the observability subsystem:
 *
 * 1. A Prometheus registry with default process/Node collectors.
 * 2. A HealthMonitor that composed checks can register into.
 * 3. An OpenTelemetry tracer (or no-op fallback when disabled).
 *
 * Callers wire this into the DI container so downstream instrumentation and
 * middleware can consume the same singletons.
 */
export async function initObservability(
  config: AppConfig,
  logger: Logger
): Promise<ObservabilityHandle> {
  const metrics = new MetricsFacade(config.observability.defaultLabels);
  if (config.observability.metricsEnabled) {
    metrics.enableDefaultCollectors();
  }

  const health = new HealthMonitor({
    version: config.version,
    startupTimeoutMs: config.observability.startupTimeoutMs,
    logger,
  });

  const tracing = await initTracing({
    enabled: config.observability.otelEnabled,
    serviceName: config.observability.otelServiceName,
    serviceVersion: config.version,
    environment: config.env,
    exporterUrl: config.observability.otelExporterUrl,
    exporterHeaders: config.observability.otelExporterHeaders,
    samplerRatio: config.observability.otelSamplerRatio,
    logger,
  });

  logger.info(
    {
      metricsEnabled: config.observability.metricsEnabled,
      otelEnabled: tracing.enabled,
    },
    "Observability initialised"
  );

  return {
    metrics,
    health,
    tracing,
    shutdown: async () => {
      await tracing.shutdown();
      metrics.dispose();
    },
  };
}

export { MetricsFacade } from "./metrics/index.js";
export { HealthMonitor } from "./health/HealthMonitor.js";
export type { TracingHandle } from "./tracing/index.js";
export type {
  LivenessReport,
  ReadinessReport,
  StartupReport,
  FullHealthReport,
  HealthCheck,
  HealthStatus,
  ComponentHealth,
  SocketHealthProvider,
} from "./health/index.js";
export {
  makePrismaCheck,
  makeRedisCheck,
  makeQueueCheck,
  makeNotificationWorkerCheck,
  makeQueueBacklogCheck,
  makeSocketGatewayCheck,
} from "./health/index.js";
export {
  createCorrelationMiddleware,
  createMonitoringMiddleware,
  createMetricsRouter,
  createObservabilityHealthRoutes,
} from "./middleware/index.js";
export {
  instrumentPrisma,
  instrumentRedis,
  instrumentBullMQ,
  instrumentSocketIO,
  type BullMQInstrumentationHandle,
  type SocketInstrumentationHandle,
} from "./instrumentation/index.js";
export {
  withSpan,
  currentSpan,
  currentContext,
  currentTraceIds,
  TRACER_NAME,
  SpanKind,
  SpanStatusCode,
} from "./tracing/index.js";
export { REDACT_PATHS, buildPinoRedaction, withCorrelation } from "./logging/index.js";
