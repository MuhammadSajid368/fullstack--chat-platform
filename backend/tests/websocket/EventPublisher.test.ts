import { describe, expect, it, vi } from "vitest";
import {
  EventPublisher,
  NoOpEventPublisher,
} from "../../src/websocket/EventPublisher.js";
import { RealtimeEvents } from "../../src/websocket/events.js";

describe("EventPublisher", () => {
  it("NoOp ignores publishes", () => {
    const pub = new NoOpEventPublisher();
    expect(() =>
      pub.publish({
        name: RealtimeEvents.MESSAGE_CREATED,
        rooms: ["user:1"],
        payload: {},
      })
    ).not.toThrow();
  });

  it("bound publisher forwards events", () => {
    const pub = new EventPublisher();
    const emit = vi.fn();
    pub.bind(emit);
    pub.publish({
      name: RealtimeEvents.TYPING_START,
      rooms: ["conversation:1"],
      payload: { userId: "u1" },
    });
    expect(emit).toHaveBeenCalledOnce();
  });

  it("unbind stops forwarding and swallows emit errors", () => {
    const pub = new EventPublisher();
    pub.bind(() => {
      throw new Error("transport");
    });
    expect(() =>
      pub.publish({
        name: RealtimeEvents.PRESENCE_ONLINE,
        rooms: ["user:1"],
        payload: {},
      })
    ).not.toThrow();

    pub.unbind();
    const emit = vi.fn();
    pub.bind(emit);
    pub.unbind();
    pub.publish({
      name: RealtimeEvents.PRESENCE_OFFLINE,
      rooms: ["user:1"],
      payload: {},
    });
    expect(emit).not.toHaveBeenCalled();
  });

  it("supports multiple listeners and selective unbind", () => {
    const pub = new EventPublisher();
    const a = vi.fn();
    const b = vi.fn();
    pub.bind(a);
    pub.bind(b);
    pub.publish({
      name: RealtimeEvents.MESSAGE_CREATED,
      rooms: ["user:1"],
      payload: {},
    });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
    pub.unbind(a);
    pub.publish({
      name: RealtimeEvents.MESSAGE_DELETED,
      rooms: ["user:1"],
      payload: {},
    });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledTimes(2);
  });
});
