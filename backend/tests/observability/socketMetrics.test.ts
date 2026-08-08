import { EventEmitter } from "node:events";
import pino from "pino";
import { afterEach, describe, expect, it } from "vitest";
import { MetricsFacade, METRIC_PREFIX } from "../../src/observability/metrics/index.js";
import { instrumentSocketIO } from "../../src/observability/instrumentation/socketInstrumentation.js";
import type { Server as SocketIOServer, Socket } from "socket.io";

const disposables: MetricsFacade[] = [];

afterEach(() => {
  while (disposables.length > 0) {
    disposables.pop()?.dispose();
  }
});

class FakeSocket extends EventEmitter {
  id: string;
  conn = { transport: { name: "websocket" } };
  data: Record<string, unknown> = {};
  private incoming: ((event: string) => void) | null = null;
  private outgoing: ((event: string) => void) | null = null;

  constructor(id: string) {
    super();
    this.id = id;
  }

  onAny(listener: (event: string) => void): void {
    this.incoming = listener;
  }

  onAnyOutgoing(listener: (event: string) => void): void {
    this.outgoing = listener;
  }

  simulateIncoming(event: string): void {
    this.incoming?.(event);
  }

  simulateOutgoing(event: string): void {
    this.outgoing?.(event);
  }
}

class FakeIO extends EventEmitter {
  engine = { clientsCount: 0 } as { clientsCount: number };

  simulateConnect(socket: FakeSocket): void {
    this.engine.clientsCount += 1;
    this.emit("connection", socket);
  }

  simulateDisconnect(socket: FakeSocket, reason: string): void {
    this.engine.clientsCount = Math.max(0, this.engine.clientsCount - 1);
    socket.emit("disconnect", reason);
  }
}

function makeMetrics(): MetricsFacade {
  const facade = new MetricsFacade();
  disposables.push(facade);
  return facade;
}

describe("socket metrics instrumentation", () => {
  it("increments gauge on connect and counters on events", async () => {
    const metrics = makeMetrics();
    const io = new FakeIO();
    const handle = instrumentSocketIO({
      io: io as unknown as SocketIOServer,
      metrics: metrics.socket,
      logger: pino({ level: "silent" }),
    });

    const socket = new FakeSocket("s-1");
    io.simulateConnect(socket);
    socket.simulateIncoming("message.send");
    socket.simulateOutgoing("message.created");

    expect(handle.provider.isRunning()).toBe(true);
    expect(handle.provider.clientCount()).toBe(1);

    const output = await metrics.render();
    expect(output).toContain(`${METRIC_PREFIX}socket_connections`);
    expect(output).toContain(`${METRIC_PREFIX}socket_events_total`);
    expect(output).toMatch(
      /direction="in"[^\n]*event="message\.send"/
    );
    expect(output).toMatch(
      /direction="out"[^\n]*event="message\.created"/
    );

    handle.stop();
  });

  it("records disconnect reason and decrements the gauge", async () => {
    const metrics = makeMetrics();
    const io = new FakeIO();
    instrumentSocketIO({
      io: io as unknown as SocketIOServer,
      metrics: metrics.socket,
      logger: pino({ level: "silent" }),
    });

    const socket = new FakeSocket("s-2") as unknown as Socket & FakeSocket;
    io.simulateConnect(socket);
    io.simulateDisconnect(socket, "transport close");

    const output = await metrics.render();
    expect(output).toContain(`${METRIC_PREFIX}socket_disconnections_total`);
    expect(output).toMatch(
      /reason="transport close"[^\n]*} 1/
    );
  });

  it("presence gauge reports the currently-online count", async () => {
    const metrics = makeMetrics();
    metrics.socket.setPresenceOnline(0);
    metrics.socket.setPresenceOnline(11);
    metrics.socket.observePublish("message.created", 0.002);

    const output = await metrics.render();
    expect(output).toContain(`${METRIC_PREFIX}presence_online_count 11`);
    expect(output).toContain(`${METRIC_PREFIX}socket_publish_duration_seconds`);
  });
});
