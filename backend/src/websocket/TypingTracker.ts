import type { Redis } from "ioredis";
import type { Logger } from "pino";
import type { IPresenceService } from "@modules/presence/interfaces/IPresenceService.js";

/**
 * Thin adapter kept for backward-compatible unit tests.
 * Production typing is owned by PresenceService (5s TTL, dedupe, privacy rooms).
 */
export class TypingTracker {
  constructor(
    private readonly _redis: Redis,
    private readonly presence: IPresenceService,
    private readonly logger: Logger,
    private readonly _ttlMs = 5_000
  ) {}

  async start(
    userId: string,
    conversationId: string,
    exceptSocketId?: string
  ): Promise<void> {
    await this.presence.startTyping(userId, conversationId, exceptSocketId);
    this.logger.debug({ userId, conversationId }, "typing:start");
  }

  async stop(
    userId: string,
    conversationId: string,
    exceptSocketId?: string
  ): Promise<void> {
    await this.presence.stopTyping(userId, conversationId, exceptSocketId);
    this.logger.debug({ userId, conversationId }, "typing:stop");
  }

  dispose(): void {
    if (
      "dispose" in this.presence &&
      typeof (this.presence as { dispose?: () => void }).dispose === "function"
    ) {
      (this.presence as { dispose: () => void }).dispose();
    }
  }
}
