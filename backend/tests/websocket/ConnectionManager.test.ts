import { describe, expect, it } from "vitest";
import pino from "pino";
import { ConnectionManager } from "../../src/websocket/ConnectionManager.js";

describe("ConnectionManager", () => {
  const logger = pino({ level: "silent" });

  it("tracks multiple devices per user", () => {
    const mgr = new ConnectionManager(logger);
    expect(mgr.add("u1", "s1").deviceCount).toBe(1);
    expect(mgr.add("u1", "s2").deviceCount).toBe(2);
    expect(mgr.getDeviceCount("u1")).toBe(2);

    const first = mgr.remove("s1");
    expect(first.wentOffline).toBe(false);
    expect(first.deviceCount).toBe(1);

    const second = mgr.remove("s2");
    expect(second.wentOffline).toBe(true);
    expect(second.deviceCount).toBe(0);
  });

  it("clears all connections", () => {
    const mgr = new ConnectionManager(logger);
    mgr.add("u1", "s1");
    mgr.clear();
    expect(mgr.getDeviceCount("u1")).toBe(0);
    expect(mgr.getUserId("s1")).toBeNull();
  });
});
