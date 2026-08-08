import { describe, expect, it, afterEach } from "vitest";
import { MetricsFacade, METRIC_PREFIX } from "../../src/observability/metrics/index.js";

const disposables: MetricsFacade[] = [];

function makeFacade(): MetricsFacade {
  const facade = new MetricsFacade();
  disposables.push(facade);
  return facade;
}

afterEach(() => {
  while (disposables.length > 0) {
    disposables.pop()?.dispose();
  }
});

describe("MetricsFacade", () => {
  it("renders Prometheus text with observed metrics", async () => {
    const facade = makeFacade();

    facade.http.observeRequest({
      method: "GET",
      route: "/api/messages/:id",
      statusCode: 200,
      durationSeconds: 0.012,
    });

    const output = await facade.render();
    expect(output).toContain(`${METRIC_PREFIX}http_requests_total`);
    expect(output).toContain('method="GET"');
    expect(output).toContain('route="/api/messages/:id"');
    expect(output).toContain('status_code="200"');
    expect(output).toContain(`${METRIC_PREFIX}http_request_duration_seconds`);
    expect(facade.contentType()).toContain("text/plain");
  });

  it("counts errors when status >= 400", async () => {
    const facade = makeFacade();
    facade.http.observeRequest({
      method: "POST",
      route: "/api/auth/login",
      statusCode: 401,
      durationSeconds: 0.05,
      errorCode: "INVALID_CREDENTIALS",
    });
    const output = await facade.render();
    expect(output).toContain(`${METRIC_PREFIX}http_request_errors_total`);
    expect(output).toContain('code="INVALID_CREDENTIALS"');
  });

  it("records queue metrics without blocking", () => {
    const facade = makeFacade();
    facade.queue.setDepth("message", "waiting", 5);
    facade.queue.setDepth("message", "active", 2);
    facade.queue.recordFailure("message", "message.delivery");
    facade.queue.recordRetry("message", "message.delivery");
    facade.queue.observeExecution("message", "message.delivery", 0.42);
    facade.queue.recordHeartbeat("message", "message-worker");
    facade.queue.recordDlq("message");

    expect(facade.registry.registry.getSingleMetric).toBeDefined();
  });

  it("records socket metrics and reflects gauge changes", async () => {
    const facade = makeFacade();
    facade.socket.recordConnection();
    facade.socket.recordConnection();
    facade.socket.recordDisconnection("client namespace disconnect");
    facade.socket.recordEvent("in", "message.send");
    facade.socket.recordEvent("out", "message.created");
    facade.socket.setPresenceOnline(42);
    facade.socket.observePublish("message.created", 0.005);

    const output = await facade.render();
    expect(output).toContain(`${METRIC_PREFIX}socket_connections`);
    expect(output).toContain(`${METRIC_PREFIX}presence_online_count 42`);
    expect(output).toContain('direction="in"');
    expect(output).toContain('direction="out"');
  });

  it("records auth outcomes by action", async () => {
    const facade = makeFacade();
    facade.auth.record("login", "success");
    facade.auth.record("login", "failure");
    facade.auth.record("refresh", "success");

    const output = await facade.render();
    expect(output).toContain('action="login"');
    expect(output).toContain('result="success"');
    expect(output).toContain('result="failure"');
  });

  it("dispose clears the registry", async () => {
    const facade = makeFacade();
    facade.enableDefaultCollectors();
    facade.http.observeRequest({
      method: "GET",
      route: "/api/x",
      statusCode: 200,
      durationSeconds: 0.001,
    });
    const before = await facade.render();
    expect(before.length).toBeGreaterThan(0);

    facade.dispose();
    const after = await facade.render();
    expect(after.trim()).toBe("");
  });
});
