import type { Socket } from "socket.io";
import type { Logger } from "pino";
import type { IPresenceService } from "@modules/presence/interfaces/IPresenceService.js";
import type { PresenceDeviceType } from "@modules/presence/dto/PresenceDto.js";
import type { SocketService } from "@websocket/SocketService.js";
import {
  conversationRoom,
  groupRoom,
  presenceRoom,
} from "@websocket/events.js";
import {
  getSocketAccessToken,
  getSocketUserId,
} from "@websocket/socketAuth.js";
import { UnauthorizedError, ForbiddenError } from "@common/errors/index.js";

/**
 * Socket controller — registers client event handlers (transport ↔ service).
 */
export class SocketController {
  constructor(
    private readonly socketService: SocketService,
    private readonly presenceService: IPresenceService,
    private readonly logger: Logger
  ) {}

  register(socket: Socket): void {
    const userId = getSocketUserId(socket);

    socket.on(
      "conversation:join",
      (payload: { conversationId?: string }, ack?: (r: unknown) => void) => {
        void this.handleJoin(socket, userId, payload, ack);
      }
    );

    socket.on(
      "conversation:leave",
      (payload: { conversationId?: string }, ack?: (r: unknown) => void) => {
        void this.handleLeave(socket, userId, payload, ack);
      }
    );

    socket.on(
      "typing.start",
      (payload: { conversationId?: string }) => {
        void this.handleTypingStart(socket, userId, payload);
      }
    );
    socket.on(
      "typing:start",
      (payload: { conversationId?: string }) => {
        void this.handleTypingStart(socket, userId, payload);
      }
    );

    socket.on(
      "typing.stop",
      (payload: { conversationId?: string }) => {
        void this.handleTypingStop(socket, userId, payload);
      }
    );
    socket.on(
      "typing:stop",
      (payload: { conversationId?: string }) => {
        void this.handleTypingStop(socket, userId, payload);
      }
    );

    socket.on("presence:ping", () => {
      void this.presenceService.heartbeat(userId, socket.id);
    });
    socket.on("presence.ping", () => {
      void this.presenceService.heartbeat(userId, socket.id);
    });

    socket.on(
      "presence.subscribe",
      (
        payload: { userId?: string },
        ack?: (r: unknown) => void
      ) => {
        void this.handlePresenceSubscribe(socket, userId, payload, ack);
      }
    );

    socket.on(
      "presence.unsubscribe",
      (
        payload: { userId?: string },
        ack?: (r: unknown) => void
      ) => {
        void this.handlePresenceUnsubscribe(socket, userId, payload, ack);
      }
    );

    socket.on("message:reaction", (payload: Record<string, unknown>) => {
      this.logger.debug(
        { userId, hasPayload: Boolean(payload) },
        "Event receive message:reaction (API phase pending)"
      );
    });
  }

  private async revalidate(socket: Socket): Promise<void> {
    const token = getSocketAccessToken(socket);
    await this.socketService.assertSession(token);
  }

  private async handleJoin(
    socket: Socket,
    userId: string,
    payload: { conversationId?: string },
    ack?: (r: unknown) => void
  ): Promise<void> {
    const conversationId = payload?.conversationId;
    if (!conversationId) {
      ack?.({ ok: false, error: "VALIDATION_ERROR" });
      return;
    }

    try {
      await this.revalidate(socket);
      await this.socketService.assertConversationMember(
        userId,
        conversationId
      );
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        socket.disconnect(true);
        ack?.({ ok: false, error: "UNAUTHORIZED" });
        return;
      }
      if (err instanceof ForbiddenError) {
        ack?.({ ok: false, error: "FORBIDDEN" });
        return;
      }
      ack?.({ ok: false, error: "INTERNAL_ERROR" });
      return;
    }

    const room = conversationRoom(conversationId);
    await socket.join(room);
    await socket.join(groupRoom(conversationId));

    this.logger.info(
      { userId, socketId: socket.id, room },
      "Join room"
    );
    ack?.({ ok: true, room });
  }

  private async handleLeave(
    socket: Socket,
    userId: string,
    payload: { conversationId?: string },
    ack?: (r: unknown) => void
  ): Promise<void> {
    const conversationId = payload?.conversationId;
    if (!conversationId) {
      ack?.({ ok: false });
      return;
    }
    const room = conversationRoom(conversationId);
    await socket.leave(room);
    await socket.leave(groupRoom(conversationId));
    this.logger.info(
      { userId, socketId: socket.id, room },
      "Leave room"
    );
    ack?.({ ok: true });
  }

  private async handlePresenceSubscribe(
    socket: Socket,
    viewerId: string,
    payload: { userId?: string },
    ack?: (r: unknown) => void
  ): Promise<void> {
    const targetUserId = payload?.userId;
    if (!targetUserId) {
      ack?.({ ok: false, error: "VALIDATION_ERROR" });
      return;
    }

    try {
      await this.revalidate(socket);
      const result = await this.presenceService.subscribe(
        viewerId,
        targetUserId
      );
      if (result.allowed) {
        await socket.join(presenceRoom(targetUserId));
      }
      ack?.({
        ok: true,
        allowed: result.allowed,
        presence: result.presence,
      });
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        socket.disconnect(true);
        ack?.({ ok: false, error: "UNAUTHORIZED" });
        return;
      }
      ack?.({ ok: false, error: "INTERNAL_ERROR" });
    }
  }

  private async handlePresenceUnsubscribe(
    socket: Socket,
    viewerId: string,
    payload: { userId?: string },
    ack?: (r: unknown) => void
  ): Promise<void> {
    const targetUserId = payload?.userId;
    if (!targetUserId) {
      ack?.({ ok: false });
      return;
    }
    await socket.leave(presenceRoom(targetUserId));
    this.logger.debug(
      { viewerId, targetUserId, socketId: socket.id },
      "presence.unsubscribe"
    );
    ack?.({ ok: true });
  }

  private async handleTypingStart(
    socket: Socket,
    userId: string,
    payload: { conversationId?: string }
  ): Promise<void> {
    const conversationId = payload?.conversationId;
    if (!conversationId) {
      return;
    }
    try {
      await this.revalidate(socket);
      await this.presenceService.assertConversationMember(
        userId,
        conversationId
      );
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        socket.disconnect(true);
      }
      return;
    }
    await this.presenceService.startTyping(userId, conversationId, socket.id);
  }

  private async handleTypingStop(
    socket: Socket,
    userId: string,
    payload: { conversationId?: string }
  ): Promise<void> {
    const conversationId = payload?.conversationId;
    if (!conversationId) {
      return;
    }
    await this.presenceService.stopTyping(userId, conversationId, socket.id);
  }
}

export function parseSocketDeviceType(
  value: unknown
): PresenceDeviceType {
  if (
    value === "phone" ||
    value === "tablet" ||
    value === "desktop" ||
    value === "browser"
  ) {
    return value;
  }
  return "browser";
}
