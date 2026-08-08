import type { Server } from "node:http";
import type { Logger } from "pino";
import type { Redis } from "ioredis";
import type { Container } from "@container/container.js";
import type { AppConfig } from "@config/index.js";
import { TOKENS } from "@shared/constants/tokens.js";
import type { IAuthService } from "@modules/auth/interfaces/IAuthService.js";
import type { IMessageRepository } from "@modules/messages/interfaces/IMessageRepository.js";
import type { IPresenceService } from "@modules/presence/interfaces/IPresenceService.js";
import type { EventPublisher } from "@websocket/EventPublisher.js";
import {
  SocketGateway,
  type WebSocketGatewayHandle,
} from "@websocket/SocketGateway.js";

export type { WebSocketGatewayHandle };

/**
 * Boots Socket.IO gateway on the HTTP server (Redis adapter + EventPublisher bind).
 */
export async function initWebSocketGateway(
  server: Server,
  container: Container,
  logger: Logger,
  options?: { enableRedisAdapter?: boolean }
): Promise<WebSocketGatewayHandle> {
  const gateway = new SocketGateway({
    httpServer: server,
    config: container.resolve<AppConfig>(TOKENS.Config),
    logger,
    redis: container.resolve<Redis>(TOKENS.Redis),
    authService: container.resolve<IAuthService>(TOKENS.AuthService),
    messageRepository: container.resolve<IMessageRepository>(
      TOKENS.MessageRepository
    ),
    presenceService: container.resolve<IPresenceService>(TOKENS.PresenceService),
    eventPublisher: container.resolve<EventPublisher>(TOKENS.EventPublisher),
    enableRedisAdapter: options?.enableRedisAdapter,
  });

  return gateway.start();
}

export { SocketGateway } from "./SocketGateway.js";
export { SocketService } from "./SocketService.js";
export { SocketController } from "./SocketController.js";
export { EventPublisher, NoOpEventPublisher } from "./EventPublisher.js";
export { RealtimeEvents } from "./events.js";
