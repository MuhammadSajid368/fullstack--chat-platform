import express from "express";
import request from "supertest";
import { describe, expect, it, beforeEach } from "vitest";
import pino from "pino";
import { createErrorHandler, notFoundHandler } from "../../src/middleware/errorHandler.js";
import { requestIdMiddleware } from "../../src/middleware/requestId.js";
import { loadConfig, resetConfigForTests } from "../../src/config/index.js";
import { NotificationController } from "../../src/modules/notifications/controller/NotificationController.js";
import { NotificationService } from "../../src/modules/notifications/service/NotificationService.js";
import { createNotificationRoutes } from "../../src/modules/notifications/routes/notifications.routes.js";
import { EventPublisher } from "../../src/websocket/EventPublisher.js";
import { InMemoryNotificationRepository } from "./InMemoryNotificationRepository.js";

const testEnv = {
  NODE_ENV: "test",
  PORT: "3097",
  HOST: "127.0.0.1",
  API_PREFIX: "/api",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/chat_test",
  REDIS_URL: "redis://localhost:6379/15",
  JWT_ACCESS_SECRET: "test-access-secret-min-32-characters!!",
  JWT_REFRESH_SECRET: "test-refresh-secret-min-32-characters!",
  JWT_ACCESS_EXPIRES_IN: "15m",
  JWT_REFRESH_EXPIRES_IN: "7d",
  COOKIE_NAME: "chat_session",
  COOKIE_SECURE: "false",
  COOKIE_SAME_SITE: "lax",
  CORS_ORIGIN: "http://localhost:5173",
  LOG_LEVEL: "silent",
  RATE_LIMIT_WINDOW_MS: "60000",
  RATE_LIMIT_MAX: "1000",
} as NodeJS.ProcessEnv;

function createApp(repo: InMemoryNotificationRepository) {
  resetConfigForTests();
  const config = loadConfig(testEnv);
  const logger = pino({ level: "silent" });
  const service = new NotificationService(
    repo,
    logger,
    new EventPublisher()
  );
  const controller = new NotificationController(service, logger);

  const authenticate = (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.user = {
      id: "usr_2",
      email: "grace@test.app",
      name: "Grace",
      avatarUrl: null,
    };
    next();
  };

  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use(
    "/api/notifications",
    createNotificationRoutes(controller, authenticate)
  );
  app.use(notFoundHandler);
  app.use(createErrorHandler(config, logger));
  return app;
}

describe("Notifications HTTP", () => {
  let repo: InMemoryNotificationRepository;

  beforeEach(() => {
    repo = new InMemoryNotificationRepository();
  });

  it("GET /notifications returns page", async () => {
    repo.insert({ userId: "usr_2", title: "Hi", body: "body" });
    const app = createApp(repo);
    const res = await request(app).get("/api/notifications").expect(200);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.hasMore).toBe(false);
  });

  it("GET /notifications/unread-count", async () => {
    repo.insert({ userId: "usr_2", title: "A" });
    const app = createApp(repo);
    const res = await request(app)
      .get("/api/notifications/unread-count")
      .expect(200);
    expect(res.body).toEqual({ count: 1 });
  });

  it("PATCH /:id/read and read-all and DELETE", async () => {
    const n = repo.insert({ userId: "usr_2", title: "A" });
    repo.insert({ userId: "usr_2", title: "B" });
    const app = createApp(repo);

    await request(app)
      .patch(`/api/notifications/${n.id}/read`)
      .expect(200)
      .expect((r) => expect(r.body.status).toBe("read"));

    await request(app)
      .patch("/api/notifications/read-all")
      .expect(200)
      .expect((r) => expect(r.body.updated).toBe(1));

    await request(app).delete(`/api/notifications/${n.id}`).expect(200);

    const list = await request(app).get("/api/notifications").expect(200);
    expect(list.body.notifications).toHaveLength(1);
  });
});
