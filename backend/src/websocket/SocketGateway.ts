import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Redis } from "ioredis";
import type { Logger } from "pino";
import type { AppConfig } from "@config/index.js";
import type { IAuthService } from "@modules/auth/interfaces/IAuthService.js";
import type { IMessageRepository } from "@modules/messages/interfaces/IMessageRepository.js";
import type { IPresenceService } from "@modules/presence/interfaces/IPresenceService.js";
import { ConnectionManager } from "@websocket/ConnectionManager.js";
import type { EventPublisher } from "@websocket/EventPublisher.js";
import {
  conversationRoom,
  groupRoom,
  RealtimeEvents,
  userRoom,
  type RealtimeEvent,
} from "@websocket/events.js";
import {
  bindSocketSessionRevoker,
  unbindSocketSessionRevoker,
} from "@websocket/socketSessionRevoker.js";
import {
  createSocketAuthMiddleware,
  getSocketUserId,
} from "@websocket/socketAuth.js";
import {
  parseSocketDeviceType,
  SocketController,
} from "@websocket/SocketController.js";
import { SocketService } from "@websocket/SocketService.js";

export type WebSocketGatewayHandle = {
  io: Server;
  disconnectUser(userId: string): void;
  leaveConversation(userId: string, conversationId: string): void;
  close(): Promise<void>;
};

export type SocketGatewayDeps = {
  httpServer: HttpServer;
  config: AppConfig;
  logger: Logger;
  redis: Redis;
  authService: IAuthService;
  messageRepository: IMessageRepository;
  presenceService: IPresenceService;
  eventPublisher: EventPublisher;
  /** When false, skip Redis adapter (unit / isolated tests). */
  enableRedisAdapter?: boolean;
};

/**
 * Socket.IO transport gateway — auth, rooms, adapter, connection lifecycle.
 * No Prisma. Business rules stay in services; after-commit publish via EventPublisher.
 */
export class SocketGateway {
  readonly io: Server;
  readonly connections: ConnectionManager;
  private readonly adapterClients: Redis[] = [];
  private readonly redis: Redis;
  private readonly controller: SocketController;
  private readonly startedAt = Date.now();
  private boundEmit: ((event: RealtimeEvent) => void) | null = null;

  constructor(private readonly deps: SocketGatewayDeps) {
    this.redis = deps.redis;
    this.connections = new ConnectionManager(deps.logger);

    const socketService = new SocketService(
      deps.messageRepository,
      deps.authService,
      deps.logger
    );
    this.controller = new SocketController(
      socketService,
      deps.presenceService,
      deps.logger
    );

    this.io = new Server(deps.httpServer, {
      path: "/socket.io",
      cors: {
        origin: deps.config.corsOrigin,
        credentials: true,
      },
      transports: ["websocket", "polling"],
    });
  }

  async start(): Promise<WebSocketGatewayHandle> {
    if (this.deps.enableRedisAdapter !== false) {
      const pub = this.redis.duplicate();
      const sub = this.redis.duplicate();
      if (pub.status === "wait") {
        await pub.connect();
      }
      if (sub.status === "wait") {
        await sub.connect();
      }
      this.adapterClients.push(pub, sub);
      this.io.adapter(createAdapter(pub, sub));
      this.deps.logger.info("Socket.IO Redis adapter attached");
    }

    this.boundEmit = (event) => this.emitEvent(event);
    this.deps.eventPublisher.bind(this.boundEmit);

    this.io.use(
      createSocketAuthMiddleware(this.deps.authService, this.deps.config)
    );

    this.io.on("connection", (socket) => {
      void this.onConnection(socket);
    });

    this.deps.logger.info(
      { path: "/socket.io" },
      "WebSocket gateway ready"
    );

    const handle: WebSocketGatewayHandle = {
      io: this.io,
      disconnectUser: (userId) => this.disconnectUser(userId),
      leaveConversation: (userId, conversationId) =>
        this.leaveConversation(userId, conversationId),
      close: () => this.close(),
    };

    bindSocketSessionRevoker({
      disconnectUser: handle.disconnectUser,
      leaveConversation: handle.leaveConversation,
    });

    return handle;
  }

  disconnectUser(userId: string): void {
    for (const socketId of this.connections.getSocketIds(userId)) {
      this.io.sockets.sockets.get(socketId)?.disconnect(true);
    }
  }

  leaveConversation(userId: string, conversationId: string): void {
    for (const socketId of this.connections.getSocketIds(userId)) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (!socket) continue;
      void socket.leave(conversationRoom(conversationId));
      void socket.leave(groupRoom(conversationId));
    }
  }

  emitEvent(event: RealtimeEvent): void {
    const started = Date.now();
    for (const room of event.rooms) {
      const target = event.exceptSocketId
        ? this.io.to(room).except(event.exceptSocketId)
        : this.io.to(room);
      target.emit(event.name, event.payload);
    }
    this.deps.logger.info(
      {
        event: event.name,
        rooms: event.rooms,
        latencyMs: Date.now() - started,
      },
      "Event publish"
    );

    if (
      event.name === RealtimeEvents.MEMBER_REMOVED ||
      event.name === RealtimeEvents.MEMBER_LEFT
    ) {
      const userId = String(event.payload.userId ?? "");
      const conversationId = String(event.payload.conversationId ?? "");
      if (userId && conversationId) {
        this.leaveConversation(userId, conversationId);
      }
    }
  }

  private async onConnection(socket: Socket): Promise<void> {
    const userId = getSocketUserId(socket);
    const connectStarted = Date.now();
    const deviceType = parseSocketDeviceType(
      (socket.handshake.auth as { deviceType?: unknown } | undefined)
        ?.deviceType ?? socket.handshake.query.deviceType
    );

    await socket.join(userRoom(userId));
    this.connections.add(userId, socket.id);

    try {
      await this.deps.presenceService.markOnline(userId, socket.id, {
        socketId: socket.id,
        deviceType,
      });
    } catch (err) {
      this.deps.logger.error({ err, userId }, "Presence markOnline failed");
    }

    this.deps.logger.info(
      {
        userId,
        socketId: socket.id,
        deviceType,
        latencyMs: Date.now() - connectStarted,
        uptimeMs: Date.now() - this.startedAt,
      },
      "Socket connection"
    );

    this.controller.register(socket);

    socket.on("disconnect", (reason) => {
      void this.onDisconnect(socket, userId, reason);
    });
  }

  private async onDisconnect(
    socket: Socket,
    userId: string,
    reason: string
  ): Promise<void> {
    this.connections.remove(socket.id);
    try {
      await this.deps.presenceService.markOffline(userId, socket.id);
    } catch (err) {
      this.deps.logger.error({ err, userId }, "Presence markOffline failed");
    }
    this.deps.logger.info(
      { userId, socketId: socket.id, reason },
      "Socket disconnect"
    );
  }

  async close(): Promise<void> {
    unbindSocketSessionRevoker();
    const presence = this.deps.presenceService as {
      dispose?: () => void;
    };
    presence.dispose?.();

    if (this.boundEmit) {
      this.deps.eventPublisher.unbind(this.boundEmit);
      this.boundEmit = null;
    }
    this.connections.clear();

    await new Promise<void>((resolve) => {
      this.io.close(() => resolve());
    });

    for (const client of this.adapterClients) {
      try {
        await client.quit();
      } catch {
        client.disconnect();
      }
    }
  }
}
