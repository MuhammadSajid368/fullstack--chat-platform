import express from "express";
import request from "supertest";
import { describe, expect, it, beforeEach } from "vitest";
import pino from "pino";
import { createErrorHandler, notFoundHandler } from "../../src/middleware/errorHandler.js";
import { requestIdMiddleware } from "../../src/middleware/requestId.js";
import { loadConfig, resetConfigForTests } from "../../src/config/index.js";
import { AdminController } from "../../src/modules/admin/controller/AdminController.js";
import { AdminService } from "../../src/modules/admin/service/AdminService.js";
import { createAdminRoutes } from "../../src/modules/admin/routes/admin.routes.js";
import { createRequireAdminMiddleware } from "../../src/modules/admin/middleware/requireAdmin.js";
import { InMemoryAdminRepository } from "./InMemoryAdminRepository.js";

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

function createApp(
  repo: InMemoryAdminRepository,
  viewer: { id: string; email: string }
) {
  resetConfigForTests();
  const config = loadConfig(testEnv);
  const logger = pino({ level: "silent" });
  const service = new AdminService(repo, logger);
  const controller = new AdminController(service, logger);

  const authenticate = (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.user = { id: viewer.id, email: viewer.email };
    next();
  };

  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use(
    "/api/admin",
    createAdminRoutes(
      controller,
      authenticate,
      createRequireAdminMiddleware(repo)
    )
  );
  app.use(notFoundHandler);
  app.use(createErrorHandler(config, logger));
  return app;
}

describe("Admin HTTP", () => {
  let repo: InMemoryAdminRepository;

  beforeEach(() => {
    repo = new InMemoryAdminRepository();
    repo.seedUser({
      id: "admin_1",
      email: "admin@chat.app",
      name: "Admin",
      globalRole: "ADMIN",
    });
    repo.seedUser({
      id: "user_1",
      email: "ada@chat.app",
      name: "Ada Lovelace",
      globalRole: "USER",
    });
    repo.seedUser({
      id: "user_2",
      email: "grace@chat.app",
      name: "Grace",
      globalRole: "USER",
    });
  });

  it("rejects non-admin with 403", async () => {
    const app = createApp(repo, { id: "user_1", email: "ada@chat.app" });
    await request(app).get("/api/admin/users").expect(403);
  });

  it("lists and searches users", async () => {
    const app = createApp(repo, { id: "admin_1", email: "admin@chat.app" });
    const res = await request(app)
      .get("/api/admin/users")
      .query({ q: "Ada" })
      .expect(200);
    expect(res.body.results.some((u: { id: string }) => u.id === "user_1")).toBe(
      true
    );
  });

  it("suspends user and writes audit", async () => {
    const app = createApp(repo, { id: "admin_1", email: "admin@chat.app" });
    await request(app)
      .patch("/api/admin/users/user_1/suspend")
      .send({ reason: "spam" })
      .expect(200);

    const audit = await request(app).get("/api/admin/audit").expect(200);
    expect(
      audit.body.results.some(
        (a: { action: string }) => a.action === "USER_SUSPEND"
      )
    ).toBe(true);
  });

  it("archives and restores conversations", async () => {
    repo.conversations.push({
      id: "conv_1",
      type: "DIRECT",
      status: "ACTIVE",
      name: null,
      avatarUrl: null,
      description: null,
      memberCount: 2,
      lastMessageAt: null,
      createdAt: new Date(),
      deletedAt: null,
      members: [],
    });
    const app = createApp(repo, { id: "admin_1", email: "admin@chat.app" });
    await request(app)
      .patch("/api/admin/conversations/conv_1/archive")
      .send({})
      .expect(200);
    await request(app).delete("/api/admin/conversations/conv_1").expect(200);
    await request(app)
      .post("/api/admin/conversations/conv_1/restore")
      .send({})
      .expect(200);
  });

  it("paginates messages", async () => {
    for (let i = 0; i < 4; i += 1) {
      repo.messages.push({
        id: `msg_${i}`,
        conversationId: "c1",
        senderId: "user_1",
        type: "TEXT",
        content: `msg ${i}`,
        status: "SENT",
        createdAt: new Date(Date.now() - i * 1000),
        updatedAt: new Date(),
        deletedAt: null,
      });
    }
    const app = createApp(repo, { id: "admin_1", email: "admin@chat.app" });
    const page1 = await request(app)
      .get("/api/admin/messages")
      .query({ limit: 2 })
      .expect(200);
    expect(page1.body.hasMore).toBe(true);
    const page2 = await request(app)
      .get("/api/admin/messages")
      .query({ limit: 2, cursor: page1.body.nextCursor })
      .expect(200);
    expect(page2.body.results[0].id).not.toBe(page1.body.results[0].id);
  });

  it("creates and dismisses reports", async () => {
    const app = createApp(repo, { id: "admin_1", email: "admin@chat.app" });
    const created = await request(app)
      .post("/api/admin/reports")
      .send({
        targetType: "USER",
        targetId: "user_1",
        reason: "harassment",
      })
      .expect(201);
    await request(app)
      .patch(`/api/admin/reports/${created.body.id}/dismiss`)
      .send({ resolution: "duplicate" })
      .expect(200);
  });
});
