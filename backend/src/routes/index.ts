import { Router } from "express";
import type { Redis } from "ioredis";
import type { Container } from "@container/container.js";
import type { AppConfig } from "@config/index.js";
import { TOKENS } from "@shared/constants/tokens.js";
import { createAuthenticateMiddleware } from "@middleware/authenticate.js";
import type { IAuthService } from "@modules/auth/interfaces/IAuthService.js";

import type { AuthController } from "@modules/auth/controller/AuthController.js";
import type { UserController } from "@modules/users/controller/UserController.js";
import type { ConversationController } from "@modules/conversations/controller/ConversationController.js";
import type { MessageController } from "@modules/messages/controller/MessageController.js";
import type { GroupController } from "@modules/groups/controller/GroupController.js";
import type { PresenceController } from "@modules/presence/controller/PresenceController.js";
import type { UploadController } from "@modules/uploads/controller/UploadController.js";
import type { NotificationController } from "@modules/notifications/controller/NotificationController.js";
import type { SearchController } from "@modules/search/controller/SearchController.js";
import type { AdminController } from "@modules/admin/controller/AdminController.js";
import type { IAdminRepository } from "@modules/admin/interfaces/IAdminRepository.js";

import { createAuthRoutes } from "@modules/auth/routes/auth.routes.js";
import { createUserRoutes } from "@modules/users/routes/users.routes.js";
import { createConversationRoutes } from "@modules/conversations/routes/conversations.routes.js";
import {
  createConversationMessageRoutes,
  createMessageRoutes,
} from "@modules/messages/routes/messages.routes.js";
import { createGroupRoutes } from "@modules/groups/routes/groups.routes.js";
import { createPresenceRoutes } from "@modules/presence/routes/presence.routes.js";
import { createUploadRoutes } from "@modules/uploads/routes/uploads.routes.js";
import { createNotificationRoutes } from "@modules/notifications/routes/notifications.routes.js";
import { createSearchRoutes } from "@modules/search/routes/search.routes.js";
import { createAdminRoutes } from "@modules/admin/routes/admin.routes.js";
import { createRequireAdminMiddleware } from "@modules/admin/middleware/requireAdmin.js";

/**
 * Root API router under API_PREFIX.
 */
export function createApiRouter(container: Container): Router {
  const router = Router();
  const config = container.resolve<AppConfig>(TOKENS.Config);
  const authenticate = createAuthenticateMiddleware(
    container.resolve<IAuthService>(TOKENS.AuthService),
    config
  );
  const messageController = container.resolve<MessageController>(
    TOKENS.MessageController
  );

  router.use(
    "/auth",
    createAuthRoutes(
      container.resolve<AuthController>(TOKENS.AuthController),
      config,
      container.resolve<Redis>(TOKENS.Redis)
    )
  );
  router.use(
    "/users",
    createUserRoutes(
      container.resolve<UserController>(TOKENS.UserController),
      authenticate
    )
  );
  router.use(
    "/conversations",
    createConversationRoutes(
      container.resolve<ConversationController>(TOKENS.ConversationController),
      authenticate
    )
  );
  router.use(
    "/conversations",
    createConversationMessageRoutes(messageController, authenticate)
  );
  router.use(
    "/messages",
    createMessageRoutes(messageController, authenticate)
  );
  router.use(
    "/groups",
    createGroupRoutes(
      container.resolve<GroupController>(TOKENS.GroupController),
      authenticate
    )
  );
  router.use(
    "/presence",
    createPresenceRoutes(
      container.resolve<PresenceController>(TOKENS.PresenceController),
      authenticate
    )
  );
  router.use(
    "/uploads",
    createUploadRoutes(
      container.resolve<UploadController>(TOKENS.UploadController),
      authenticate
    )
  );
  router.use(
    "/notifications",
    createNotificationRoutes(
      container.resolve<NotificationController>(TOKENS.NotificationController),
      authenticate
    )
  );
  router.use(
    "/search",
    createSearchRoutes(
      container.resolve<SearchController>(TOKENS.SearchController),
      authenticate
    )
  );
  router.use(
    "/admin",
    createAdminRoutes(
      container.resolve<AdminController>(TOKENS.AdminController),
      authenticate,
      createRequireAdminMiddleware(
        container.resolve<IAdminRepository>(TOKENS.AdminRepository)
      )
    )
  );

  return router;
}
