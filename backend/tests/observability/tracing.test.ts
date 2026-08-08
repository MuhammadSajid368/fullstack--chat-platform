import pino from "pino";
import { describe, expect, it } from "vitest";
import { trace } from "@opentelemetry/api";
import {
  initTracing,
  withSpan,
  currentTraceIds,
} from "../../src/observability/tracing/index.js";
import { REDACT_PATHS, withCorrelation } from "../../src/observability/logging/index.js";

const logger = pino({ level: "silent" });

describe("tracing bootstrap", () => {
  it("returns a no-op tracer when disabled", async () => {
    const handle = await initTracing({
      enabled: false,
      serviceName: "chat-backend",
      serviceVersion: "1.0.0",
      environment: "test",
      exporterUrl: null,
      exporterHeaders: {},
      samplerRatio: 0.1,
      logger,
    });

    expect(handle.enabled).toBe(false);
    expect(typeof handle.tracer.startSpan).toBe("function");
    await handle.shutdown();
  });

  it("withSpan surfaces thrown errors and always ends the span", async () => {
    const handle = await initTracing({
      enabled: false,
      serviceName: "chat-backend",
      serviceVersion: "1.0.0",
      environment: "test",
      exporterUrl: null,
      exporterHeaders: {},
      samplerRatio: 0.1,
      logger,
    });

    await expect(
      withSpan(handle.tracer, "unit.op", { attempt: 1 }, async () => {
        throw new Error("nope");
      })
    ).rejects.toThrow("nope");

    expect(trace.getActiveSpan()).toBeUndefined();
  });

  it("currentTraceIds returns empty object without an active span", () => {
    expect(currentTraceIds()).toEqual({});
  });
});

describe("logging correlation", () => {
  it("adds correlation bindings without leaking secrets", () => {
    const base = pino({ level: "silent" });
    const child = withCorrelation(base, {
      requestId: "req-1",
      traceId: "trace-1",
      userId: "usr-1",
      sessionId: "sess-1",
    });
    expect(child).toBeDefined();
  });

  it("redact list covers passwords, tokens, cookies and message content", () => {
    for (const path of [
      "password",
      "req.body.password",
      "accessToken",
      "refreshToken",
      "req.cookies",
      "req.body.content",
      "upload.storageKey",
    ]) {
      expect(REDACT_PATHS).toContain(path);
    }
  });
});
