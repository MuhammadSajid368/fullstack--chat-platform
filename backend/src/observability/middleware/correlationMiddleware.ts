import type { NextFunction, Request, Response } from "express";
import type { Logger } from "pino";
import { context, trace } from "@opentelemetry/api";
import { withCorrelation } from "@observability/logging/index.js";

const TRACEPARENT_RE = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;

export type CorrelationOptions = {
  logger: Logger;
  headerName?: string;
};

/**
 * Extracts / propagates trace correlation identifiers and enriches `req.log`.
 *
 * - `traceparent` header is parsed when present so downstream tracers can
 *   continue an incoming distributed trace.
 * - The current OpenTelemetry span (if any) exposes trace/span ids that
 *   flow into structured logs and the `X-Trace-Id` response header.
 * - When tracing is disabled the middleware falls back to the request id.
 */
export function createCorrelationMiddleware(
  options: CorrelationOptions
): (req: Request, res: Response, next: NextFunction) => void {
  const headerName = (options.headerName ?? "traceparent").toLowerCase();

  return (req, res, next) => {
    const traceparent = req.header(headerName);
    const parsed = traceparent ? parseTraceparent(traceparent) : null;

    const activeSpan = trace.getSpan(context.active());
    const spanContext = activeSpan?.spanContext();
    const traceId = spanContext?.traceId || parsed?.traceId;
    const spanId = spanContext?.spanId || parsed?.parentId;

    if (traceId) {
      res.setHeader("X-Trace-Id", traceId);
    }

    const baseLogger = req.log ?? options.logger;
    req.log = withCorrelation(baseLogger, {
      requestId: req.requestId,
      traceId: traceId ?? undefined,
      spanId: spanId ?? undefined,
      userId: req.user?.id,
      sessionId: req.user?.sessionId,
    });

    next();
  };
}

function parseTraceparent(
  value: string
): { traceId: string; parentId: string } | null {
  const match = TRACEPARENT_RE.exec(value.trim());
  if (!match) {
    return null;
  }
  const [, , traceId, parentId] = match;
  if (
    !traceId ||
    !parentId ||
    traceId === "00000000000000000000000000000000" ||
    parentId === "0000000000000000"
  ) {
    return null;
  }
  return { traceId, parentId };
}
