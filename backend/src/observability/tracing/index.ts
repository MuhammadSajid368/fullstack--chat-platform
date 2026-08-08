import {
  context,
  trace,
  SpanKind,
  SpanStatusCode,
  type Attributes,
  type Span,
  type Tracer,
  type Context,
} from "@opentelemetry/api";
import type { Logger } from "pino";

/**
 * The tracer name used across the codebase; instrumentations pick this
 * automatically via `trace.getTracer(TRACER_NAME)`.
 */
export const TRACER_NAME = "chat-backend";

export type TracingHandle = {
  readonly enabled: boolean;
  readonly tracer: Tracer;
  shutdown(): Promise<void>;
};

/**
 * Configuration accepted by the tracing bootstrap. Kept intentionally small —
 * production overrides come from `AppConfig.observability`.
 */
export type TracingOptions = {
  enabled: boolean;
  serviceName: string;
  serviceVersion: string;
  environment: string;
  exporterUrl: string | null;
  exporterHeaders: Record<string, string>;
  samplerRatio: number;
  logger: Logger;
};

/**
 * Boots the OpenTelemetry NodeSDK when enabled. When disabled the API's
 * no-op tracer is returned so callers can always call trace APIs safely.
 *
 * The SDK is dynamically imported so unused observability packages remain
 * out of the hot path when tracing is disabled.
 */
export async function initTracing(
  options: TracingOptions
): Promise<TracingHandle> {
  if (!options.enabled || !options.exporterUrl) {
    return {
      enabled: false,
      tracer: trace.getTracer(TRACER_NAME, options.serviceVersion),
      shutdown: async () => {
        /* no-op */
      },
    };
  }

  try {
    const sdkModule = (await import(
      "@opentelemetry/sdk-node"
    )) as unknown as {
      NodeSDK: new (config: Record<string, unknown>) => {
        start(): void;
        shutdown(): Promise<void>;
      };
    };
    const resourcesModule = (await import(
      "@opentelemetry/resources"
    )) as unknown as {
      resourceFromAttributes?: (attrs: Attributes) => unknown;
      Resource?: new (attrs: Attributes) => unknown;
    };
    const semanticModule = (await import(
      "@opentelemetry/semantic-conventions"
    )) as unknown as {
      ATTR_SERVICE_NAME?: string;
      ATTR_SERVICE_VERSION?: string;
      SEMRESATTRS_SERVICE_NAME?: string;
      SEMRESATTRS_SERVICE_VERSION?: string;
      SEMRESATTRS_DEPLOYMENT_ENVIRONMENT?: string;
    };
    const exporterModule = (await import(
      "@opentelemetry/exporter-trace-otlp-http"
    )) as unknown as {
      OTLPTraceExporter: new (config: {
        url?: string;
        headers?: Record<string, string>;
      }) => unknown;
    };

    const serviceNameKey =
      semanticModule.ATTR_SERVICE_NAME ??
      semanticModule.SEMRESATTRS_SERVICE_NAME ??
      "service.name";
    const serviceVersionKey =
      semanticModule.ATTR_SERVICE_VERSION ??
      semanticModule.SEMRESATTRS_SERVICE_VERSION ??
      "service.version";
    const environmentKey =
      semanticModule.SEMRESATTRS_DEPLOYMENT_ENVIRONMENT ??
      "deployment.environment";

    const resourceAttrs: Attributes = {
      [serviceNameKey]: options.serviceName,
      [serviceVersionKey]: options.serviceVersion,
      [environmentKey]: options.environment,
    };
    const resource = resourcesModule.resourceFromAttributes
      ? resourcesModule.resourceFromAttributes(resourceAttrs)
      : resourcesModule.Resource
      ? new resourcesModule.Resource(resourceAttrs)
      : undefined;

    const traceExporter = new exporterModule.OTLPTraceExporter({
      url: options.exporterUrl,
      headers: options.exporterHeaders,
    });

    const sdkConfig: Record<string, unknown> = {
      traceExporter,
    };
    if (resource) {
      sdkConfig.resource = resource;
    }

    const sdk = new sdkModule.NodeSDK(sdkConfig);
    sdk.start();

    options.logger.info(
      {
        exporter: options.exporterUrl,
        service: options.serviceName,
        sampler: options.samplerRatio,
      },
      "OpenTelemetry tracing enabled"
    );

    return {
      enabled: true,
      tracer: trace.getTracer(TRACER_NAME, options.serviceVersion),
      shutdown: async () => {
        try {
          await sdk.shutdown();
        } catch (err) {
          options.logger.error(
            { err },
            "OpenTelemetry SDK shutdown failed"
          );
        }
      },
    };
  } catch (err) {
    options.logger.error(
      { err },
      "Failed to start OpenTelemetry SDK — falling back to no-op tracer"
    );
    return {
      enabled: false,
      tracer: trace.getTracer(TRACER_NAME, options.serviceVersion),
      shutdown: async () => {
        /* no-op */
      },
    };
  }
}

/**
 * Runs `fn` inside a fresh span. The span always ends, and thrown errors
 * are recorded before being re-thrown.
 */
export async function withSpan<T>(
  tracer: Tracer,
  name: string,
  attrs: Attributes,
  fn: (span: Span) => Promise<T> | T,
  kind: SpanKind = SpanKind.INTERNAL
): Promise<T> {
  const span = tracer.startSpan(name, { kind, attributes: attrs });
  const ctx = trace.setSpan(context.active(), span);
  try {
    const result = await context.with(ctx, () => fn(span));
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (err) {
    if (err instanceof Error) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    } else {
      span.setStatus({ code: SpanStatusCode.ERROR });
    }
    throw err;
  } finally {
    span.end();
  }
}

export function currentSpan(): Span | undefined {
  return trace.getActiveSpan() ?? undefined;
}

export function currentContext(): Context {
  return context.active();
}

export function currentTraceIds(): { traceId?: string; spanId?: string } {
  const span = trace.getActiveSpan();
  if (!span) {
    return {};
  }
  const spanContext = span.spanContext();
  if (!spanContext || !spanContext.traceId) {
    return {};
  }
  return { traceId: spanContext.traceId, spanId: spanContext.spanId };
}

export { SpanKind, SpanStatusCode } from "@opentelemetry/api";
