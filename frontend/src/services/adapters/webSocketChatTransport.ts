/**
 * TODO(websocket): Implement real-time event transport (message, typing, presence).
 * This adapter is a documented boundary only — not used in mock mode.
 */
export interface WebSocketChatTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(
    event: string,
    handler: (payload: unknown) => void
  ): () => void;
}

export function createWebSocketChatTransport(): WebSocketChatTransport {
  throw new Error(
    "WebSocket transport is not implemented. Use mock mode for local development."
  );
}
