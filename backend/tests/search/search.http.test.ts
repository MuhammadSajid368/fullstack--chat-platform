import express from "express";
import request from "supertest";
import { describe, expect, it, beforeEach } from "vitest";
import pino from "pino";
import { createErrorHandler, notFoundHandler } from "../../src/middleware/errorHandler.js";
import { requestIdMiddleware } from "../../src/middleware/requestId.js";
import { loadConfig, resetConfigForTests } from "../../src/config/index.js";
import { SearchController } from "../../src/modules/search/controller/SearchController.js";
import { SearchService } from "../../src/modules/search/service/SearchService.js";
import { createSearchRoutes } from "../../src/modules/search/routes/search.routes.js";
import { InMemorySearchRepository } from "./InMemorySearchRepository.js";

const testEnv = {
  NODE_ENV: "test",
  PORT: "3096",
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

function createApp(repo: InMemorySearchRepository) {
  resetConfigForTests();
  const config = loadConfig(testEnv);
  const logger = pino({ level: "silent" });
  const service = new SearchService(repo, logger);
  const controller = new SearchController(service, logger);

  const authenticate = (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.user = {
      id: "usr_1",
      email: "ada@chat.app",
      name: "Ada",
      avatarUrl: null,
    };
    next();
  };

  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use("/api/search", createSearchRoutes(controller, authenticate));
  app.use(notFoundHandler);
  app.use(createErrorHandler(config, logger));
  return app;
}

describe("Search HTTP", () => {
  let repo: InMemorySearchRepository;

  beforeEach(() => {
    repo = new InMemorySearchRepository();
    repo.users.push({
      id: "usr_2",
      name: "Grace Hopper",
      email: "grace@chat.app",
      avatarUrl: null,
      about: null,
      createdAt: new Date(),
      deletedAt: null,
    });
    repo.conversations.push({
      id: "conv_grp",
      type: "GROUP",
      name: "Engineering",
      avatarUrl: null,
      description: null,
      lastMessagePreview: "hi",
      lastMessageAt: new Date(),
      createdAt: new Date(),
      deletedAt: null,
      memberIds: ["usr_1", "usr_2"],
    });
    repo.seedMembership("conv_grp", "usr_1");
    repo.messages.push({
      id: "msg_1",
      conversationId: "conv_grp",
      senderId: "usr_2",
      type: "text",
      content: "hello search world",
      createdAt: new Date(),
      deletedAt: null,
      linkPreview: false,
      hasAttachments: false,
      conversationDeletedAt: null,
      senderDeletedAt: null,
    });
  });

  it("GET /search/messages", async () => {
    const app = createApp(repo);
    const res = await request(app)
      .get("/api/search/messages")
      .query({ q: "hello" })
      .expect(200);
    expect(res.body.results).toHaveLength(1);
  });

  it("GET /search/users", async () => {
    const app = createApp(repo);
    const res = await request(app)
      .get("/api/search/users")
      .query({ q: "Grace" })
      .expect(200);
    expect(res.body.results[0].id).toBe("usr_2");
  });

  it("GET /search/groups", async () => {
    const app = createApp(repo);
    const res = await request(app)
      .get("/api/search/groups")
      .query({ q: "Engineer" })
      .expect(200);
    expect(res.body.results[0].id).toBe("conv_grp");
  });

  it("GET /search/conversations", async () => {
    const app = createApp(repo);
    const res = await request(app)
      .get("/api/search/conversations")
      .query({ q: "Engineering" })
      .expect(200);
    expect(res.body.results[0].id).toBe("conv_grp");
  });

  it("rejects unauthorized conversation scope with 404", async () => {
    const app = createApp(repo);
    await request(app)
      .get("/api/search/messages")
      .query({ q: "x", conversationId: "missing" })
      .expect(404);
  });
});
