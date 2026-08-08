/**
 * Bindable after-commit event bus.
 * Socket gateway and JobDispatcher both subscribe; never throws into TX paths.
 */
import type { RealtimeEvent } from "@websocket/events.js";

export type EventListener = (event: RealtimeEvent) => void;

export interface IEventPublisher {
  publish(event: RealtimeEvent): void;
}

export class NoOpEventPublisher implements IEventPublisher {
  publish(_event: RealtimeEvent): void {
    // used before gateway binds / in unit tests without sockets
  }
}

/**
 * Multi-subscriber publisher — gateway + job outbox attach independently.
 */
export class EventPublisher implements IEventPublisher {
  private readonly listeners = new Set<EventListener>();

  bind(listener: EventListener): void {
    this.listeners.add(listener);
  }

  unbind(listener?: EventListener): void {
    if (!listener) {
      this.listeners.clear();
      return;
    }
    this.listeners.delete(listener);
  }

  publish(event: RealtimeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Never fail business TX due to transport / enqueue errors.
      }
    }
  }
}
