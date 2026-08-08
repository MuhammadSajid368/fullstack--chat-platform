import express, { type Request, type Response } from "express";
import request from "supertest";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { requestIdMiddleware } from "../../src/middleware/requestId.js";
import { createCorrelationMiddleware } from "../../src/observability/middleware/correlationMiddleware.js";

function build() {
  const logs: Record<string, unknown>[] = [];
  const logger = pino(
    { level: "trace" },
    {
      write(chunk: string) {
        try {
          logs.push(JSON.parse(chunk));
        } catch {
          // ignore transport metadata
        }
      },
    }
  );

  const app = express();
  app.use(requestIdMiddleware);
  app.use(createCorrelationMiddleware({ logger }));

  app.get("/echo", (req: Request, res: Response) => {
    req.log?.info({ scope: "handler" }, "handled");
    res.status(200).json({
      requestId: req.requestId,
      traceHeader: res.getHeader("X-Trace-Id") ?? null,
    });
  });

  return { app, logs };
}

describe("correlation middleware", () => {
  it("propagates X-Request-Id and enriches request logger", async () => {
    const { app, logs } = build();
    const res = await request(app)
      .get("/echo")
      .set("X-Request-Id", "req-123")
      .expect(200);

    expect(res.headers["x-request-id"]).toBe("req-123");
    expect(res.body.requestId).toBe("req-123");

    const enriched = logs.find((entry) => entry.scope === "handler");
    expect(enriched).toBeDefined();
    expect(enriched?.requestId).toBe("req-123");
  });

  it("extracts traceId from a well-formed traceparent header", async () => {
    const { app } = build();
    const traceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    const res = await request(app)
      .get("/echo")
      .set("traceparent", traceparent)
      .expect(200);

    expect(res.headers["x-trace-id"]).toBe(
      "4bf92f3577b34da6a3ce929d0e0e4736"
    );
    expect(res.body.traceHeader).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
  });

  it("ignores malformed traceparent gracefully", async () => {
    const { app } = build();
    const res = await request(app)
      .get("/echo")
      .set("traceparent", "not-a-real-traceparent")
      .expect(200);
    expect(res.headers["x-trace-id"]).toBeUndefined();
  });
});
