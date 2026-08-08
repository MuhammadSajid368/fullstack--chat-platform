import type { Logger } from "pino";
import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import type { AppConfig } from "@config/index.js";
import { Container } from "@container/container.js";
import { TOKENS } from "@shared/constants/tokens.js";
import { HealthService } from "@shared/services/HealthService.js";
import type { IHealthService } from "@shared/interfaces/IHealthService.js";

import { AuthRepository } from "@modules/auth/repository/AuthRepository.js";
import { AuthService } from "@modules/auth/service/AuthService.js";
import { AuthController } from "@modules/auth/controller/AuthController.js";

import { UserRepository } from "@modules/users/repository/UserRepository.js";
import { UserService } from "@modules/users/service/UserService.js";
import { UserController } from "@modules/users/controller/UserController.js";

import { ConversationRepository } from "@modules/conversations/repository/ConversationRepository.js";
import { ConversationService } from "@modules/conversations/service/ConversationService.js";
import { ConversationController } from "@modules/conversations/controller/ConversationController.js";

import { MessageRepository } from "@modules/messages/repository/MessageRepository.js";
import { MessageService } from "@modules/messages/service/MessageService.js";
import { MessageController } from "@modules/messages/controller/MessageController.js";

import { GroupRepository } from "@modules/groups/repository/GroupRepository.js";
import { GroupService } from "@modules/groups/service/GroupService.js";
import { GroupController } from "@modules/groups/controller/GroupController.js";

import { PresenceRepository } from "@modules/presence/repository/PresenceRepository.js";
import { PresenceService } from "@modules/presence/service/PresenceService.js";
import { PresenceController } from "@modules/presence/controller/PresenceController.js";

import { UploadRepository } from "@modules/uploads/repository/UploadRepository.js";
import { UploadService } from "@modules/uploads/service/UploadService.js";
import { UploadController } from "@modules/uploads/controller/UploadController.js";

import { NotificationRepository } from "@modules/notifications/repository/NotificationRepository.js";
import { NotificationService } from "@modules/notifications/service/NotificationService.js";
import { NotificationController } from "@modules/notifications/controller/NotificationController.js";

import { SearchRepository } from "@modules/search/repository/SearchRepository.js";
import { SearchService } from "@modules/search/service/SearchService.js";
import { SearchController } from "@modules/search/controller/SearchController.js";

import { AdminRepository } from "@modules/admin/repository/AdminRepository.js";
import { AdminService } from "@modules/admin/service/AdminService.js";
import { AdminController } from "@modules/admin/controller/AdminController.js";

import { EventPublisher } from "@websocket/EventPublisher.js";
import type { QueueHealthProvider } from "@jobs/index.js";
import type { ObservabilityHandle } from "@observability/index.js";
import type { MetricsFacade } from "@observability/metrics/index.js";
import type { SocketHealthProvider } from "@observability/health/index.js";

export type CreateContainerDeps = {
  config: AppConfig;
  logger: Logger;
  prisma: PrismaClient;
  redis: Redis;
  observability: ObservabilityHandle;
};

/**
 * Composition root — wires all module layers.
 * Controllers never construct repositories or Prisma clients themselves.
 */
export function createContainer(deps: CreateContainerDeps): Container {
  const container = new Container();

  container.registerValue(TOKENS.Config, deps.config);
  container.registerValue(TOKENS.Logger, deps.logger);
  container.registerValue(TOKENS.Prisma, deps.prisma);
  container.registerValue(TOKENS.Redis, deps.redis);

  container.registerValue(TOKENS.MetricsRegistry, deps.observability.metrics);
  container.registerValue(TOKENS.HealthMonitor, deps.observability.health);
  container.registerValue(TOKENS.Tracer, deps.observability.tracing.tracer);
  container.registerValue<SocketHealthProvider>(TOKENS.SocketHealthProvider, {
    isRunning: () => false,
    clientCount: () => 0,
  });

  container.registerSingleton(
    TOKENS.EventPublisher,
    () => new EventPublisher()
  );

  container.registerValue<QueueHealthProvider>(TOKENS.QueueHealthProvider, {
    getHealth: async () => null,
  });

  container.registerSingleton(TOKENS.HealthService, (c) => {
    return new HealthService(
      c.resolve<AppConfig>(TOKENS.Config),
      c.resolve<PrismaClient>(TOKENS.Prisma),
      c.resolve<Redis>(TOKENS.Redis)
    ) satisfies IHealthService;
  });

  // Auth
  container.registerSingleton(
    TOKENS.AuthRepository,
    (c) => new AuthRepository(c.resolve(TOKENS.Prisma))
  );
  container.registerSingleton(
    TOKENS.AuthService,
    (c) =>
      new AuthService(
        c.resolve(TOKENS.AuthRepository),
        c.resolve(TOKENS.Config)
      )
  );
  container.registerSingleton(
    TOKENS.AuthController,
    (c) =>
      new AuthController(
        c.resolve(TOKENS.AuthService),
        c.resolve(TOKENS.Config),
        c.resolve(TOKENS.Logger)
      )
  );

  // Users
  container.registerSingleton(
    TOKENS.UserRepository,
    (c) => new UserRepository(c.resolve(TOKENS.Prisma))
  );
  container.registerSingleton(
    TOKENS.UserService,
    (c) => new UserService(c.resolve(TOKENS.UserRepository))
  );
  container.registerSingleton(
    TOKENS.UserController,
    (c) =>
      new UserController(
        c.resolve(TOKENS.UserService),
        c.resolve(TOKENS.Logger)
      )
  );

  // Conversations
  container.registerSingleton(
    TOKENS.ConversationRepository,
    (c) => new ConversationRepository(c.resolve(TOKENS.Prisma))
  );
  container.registerSingleton(
    TOKENS.ConversationService,
    (c) =>
      new ConversationService(
        c.resolve(TOKENS.ConversationRepository),
        c.resolve(TOKENS.Logger),
        c.resolve(TOKENS.EventPublisher)
      )
  );
  container.registerSingleton(
    TOKENS.ConversationController,
    (c) =>
      new ConversationController(
        c.resolve(TOKENS.ConversationService),
        c.resolve(TOKENS.Logger)
      )
  );

  // Messages
  container.registerSingleton(
    TOKENS.MessageRepository,
    (c) => new MessageRepository(c.resolve(TOKENS.Prisma))
  );
  container.registerSingleton(
    TOKENS.MessageService,
    (c) =>
      new MessageService(
        c.resolve(TOKENS.MessageRepository),
        c.resolve(TOKENS.Logger),
        c.resolve(TOKENS.EventPublisher),
        c.resolve(TOKENS.NotificationService)
      )
  );
  container.registerSingleton(
    TOKENS.MessageController,
    (c) =>
      new MessageController(
        c.resolve(TOKENS.MessageService),
        c.resolve(TOKENS.Logger)
      )
  );

  // Groups
  container.registerSingleton(
    TOKENS.GroupRepository,
    (c) => new GroupRepository(c.resolve(TOKENS.Prisma))
  );
  container.registerSingleton(
    TOKENS.GroupService,
    (c) =>
      new GroupService(
        c.resolve(TOKENS.GroupRepository),
        c.resolve(TOKENS.Logger),
        c.resolve(TOKENS.EventPublisher)
      )
  );
  container.registerSingleton(
    TOKENS.GroupController,
    (c) =>
      new GroupController(
        c.resolve(TOKENS.GroupService),
        c.resolve(TOKENS.Logger)
      )
  );

  // Presence
  container.registerSingleton(
    TOKENS.PresenceRepository,
    (c) =>
      new PresenceRepository(
        c.resolve(TOKENS.Prisma),
        c.resolve(TOKENS.Redis)
      )
  );
  container.registerSingleton(
    TOKENS.PresenceService,
    (c) =>
      new PresenceService(
        c.resolve(TOKENS.PresenceRepository),
        c.resolve(TOKENS.EventPublisher),
        c.resolve(TOKENS.Logger),
        c.resolve<MetricsFacade>(TOKENS.MetricsRegistry).presence
      )
  );
  container.registerSingleton(
    TOKENS.PresenceController,
    (c) =>
      new PresenceController(
        c.resolve(TOKENS.PresenceService),
        c.resolve(TOKENS.Logger)
      )
  );

  // Uploads
  container.registerSingleton(
    TOKENS.UploadRepository,
    (c) => new UploadRepository(c.resolve(TOKENS.Prisma))
  );
  container.registerSingleton(
    TOKENS.UploadService,
    (c) =>
      new UploadService(
        c.resolve(TOKENS.UploadRepository),
        c.resolve(TOKENS.Logger),
        c.resolve(TOKENS.EventPublisher)
      )
  );
  container.registerSingleton(
    TOKENS.UploadController,
    (c) =>
      new UploadController(
        c.resolve(TOKENS.UploadService),
        c.resolve(TOKENS.Logger)
      )
  );

  // Notifications
  container.registerSingleton(
    TOKENS.NotificationRepository,
    (c) => new NotificationRepository(c.resolve(TOKENS.Prisma))
  );
  container.registerSingleton(
    TOKENS.NotificationService,
    (c) =>
      new NotificationService(
        c.resolve(TOKENS.NotificationRepository),
        c.resolve(TOKENS.Logger),
        c.resolve(TOKENS.EventPublisher)
      )
  );
  container.registerSingleton(
    TOKENS.NotificationController,
    (c) =>
      new NotificationController(
        c.resolve(TOKENS.NotificationService),
        c.resolve(TOKENS.Logger)
      )
  );

  // Search
  container.registerSingleton(
    TOKENS.SearchRepository,
    (c) => new SearchRepository(c.resolve(TOKENS.Prisma))
  );
  container.registerSingleton(
    TOKENS.SearchService,
    (c) =>
      new SearchService(
        c.resolve(TOKENS.SearchRepository),
        c.resolve(TOKENS.Logger)
      )
  );
  container.registerSingleton(
    TOKENS.SearchController,
    (c) =>
      new SearchController(
        c.resolve(TOKENS.SearchService),
        c.resolve(TOKENS.Logger)
      )
  );

  // Admin & Moderation
  container.registerSingleton(
    TOKENS.AdminRepository,
    (c) => new AdminRepository(c.resolve(TOKENS.Prisma))
  );
  container.registerSingleton(
    TOKENS.AdminService,
    (c) =>
      new AdminService(
        c.resolve(TOKENS.AdminRepository),
        c.resolve(TOKENS.Logger)
      )
  );
  container.registerSingleton(
    TOKENS.AdminController,
    (c) =>
      new AdminController(
        c.resolve(TOKENS.AdminService),
        c.resolve(TOKENS.Logger)
      )
  );

  return container;
}

export { Container } from "./container.js";
