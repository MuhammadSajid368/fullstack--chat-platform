import type { Logger } from "pino";
import { SpanKind, trace, type Attributes } from "@opentelemetry/api";
import type { Server as SocketIOServer, Socket } from "socket.io";
import type { SocketMetrics } from "@observability/metrics/socketMetrics.js";
import type { SocketHealthProvider } from "@observability/health/checks.js";
import { TRACER_NAME } from "@observability/tracing/index.js";

export type SocketInstrumentationHandle = {
  provider: SocketHealthProvider;
  stop(): void;
};

export type SocketInstrumentationOptions = {
  io: SocketIOServer;
  metrics: SocketMetrics;
  logger: Logger;
};

/**
 * Attaches metrics + tracing hooks around Socket.IO's connection lifecycle.
 * Does not alter the SocketGateway itself — listeners are additive.
 */
export function instrumentSocketIO(
  options: SocketInstrumentationOptions
): SocketInstrumentationHandle {
  const { io, metrics, logger } = options;
  const tracer = trace.getTracer(TRACER_NAME);
  let running = true;

  const onConnection = (socket: Socket): void => {
    metrics.recordConnection();

    const span = tracer.startSpan("socket.connection", {
      kind: SpanKind.SERVER,
      attributes: buildSocketAttrs(socket),
    });
    span.end();

    socket.onAny((event: string) => {
      metrics.recordEvent("in", event);
    });

    socket.onAnyOutgoing((event: string) => {
      metrics.recordEvent("out", event);
    });

    socket.on("disconnect", (reason: string) => {
      metrics.recordDisconnection(reason);
      const disconnectSpan = tracer.startSpan("socket.disconnect", {
        kind: SpanKind.SERVER,
        attributes: {
          ...buildSocketAttrs(socket),
          "socket.disconnect_reason": reason,
        },
      });
      disconnectSpan.end();
    });
  };

  io.on("connection", onConnection);

  const provider: SocketHealthProvider = {
    isRunning: () => running,
    clientCount: () => {
      try {
        return io.engine?.clientsCount ?? 0;
      } catch {
        return 0;
      }
    },
  };

  logger.info("Socket.IO observability instrumentation attached");

  return {
    provider,
    stop: () => {
      running = false;
      try {
        io.off("connection", onConnection);
      } catch {
        // best effort
      }
    },
  };
}

function buildSocketAttrs(socket: Socket): Attributes {
  const attrs: Attributes = {
    "socket.id": socket.id,
    "socket.transport": socket.conn?.transport?.name ?? "unknown",
  };
  const userId = (socket.data as { userId?: string } | undefined)?.userId;
  if (typeof userId === "string" && userId.length > 0) {
    attrs["user.id"] = userId;
  }
  return attrs;
}
