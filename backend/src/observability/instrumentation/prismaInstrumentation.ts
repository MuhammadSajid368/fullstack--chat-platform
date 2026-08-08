import type { PrismaClient } from "@prisma/client";
import type { Logger } from "pino";
import { SpanKind, trace } from "@opentelemetry/api";
import type { DbMetrics } from "@observability/metrics/dbMetrics.js";
import { TRACER_NAME } from "@observability/tracing/index.js";

/**
 * Instruments Prisma via a `$extends` client extension so query timings feed
 * both Prometheus histograms and OpenTelemetry spans. The instrumentation
 * never modifies Prisma's own query behaviour — only observation.
 *
 * Returns a new client reference (Prisma extensions are immutable); callers
 * are expected to replace the original singleton at bootstrap.
 */
export function instrumentPrisma(
  prisma: PrismaClient,
  metrics: DbMetrics,
  logger: Logger
): PrismaClient {
  const tracer = trace.getTracer(TRACER_NAME);
  const extended = prisma.$extends({
    name: "chat-backend-observability",
    query: {
      $allOperations: async ({ model, operation, args, query }) => {
        const startNs = process.hrtime.bigint();
        const span = tracer.startSpan(
          `prisma.${model ?? "raw"}.${operation}`,
          {
            kind: SpanKind.CLIENT,
            attributes: {
              "db.system": "postgresql",
              "db.operation": operation,
              "db.prisma.model": model ?? "raw",
            },
          }
        );
        try {
          const result = await query(args);
          const durationSeconds =
            Number(process.hrtime.bigint() - startNs) / 1_000_000_000;
          metrics.observeQuery({
            operation,
            model: model ?? null,
            durationSeconds,
          });
          span.setStatus({ code: 1 });
          return result;
        } catch (err) {
          const durationSeconds =
            Number(process.hrtime.bigint() - startNs) / 1_000_000_000;
          metrics.observeQuery({
            operation,
            model: model ?? null,
            durationSeconds,
            error: true,
          });
          if (err instanceof Error) {
            span.recordException(err);
            span.setStatus({ code: 2, message: err.message });
          } else {
            span.setStatus({ code: 2 });
          }
          throw err;
        } finally {
          span.end();
        }
      },
    },
  });

  logger.info("Prisma observability instrumentation attached");
  return extended as unknown as PrismaClient;
}
