import express from "express";
import request from "supertest";
import { describe, expect, it, beforeEach } from "vitest";
import pino from "pino";
import { loadConfig, resetConfigForTests } from "../../src/config/index.js";
import {
  createErrorHandler,
  notFoundHandler,
} from "../../src/middleware/errorHandler.js";
import { applySecurityMiddleware } from "../../src/middleware/security.js";
import { requestIdMiddleware } from "../../src/middleware/requestId.js";
import { createAuthenticateMiddleware } from "../../src/middleware/authenticate.js";
import { AuthService } from "../../src/modules/auth/service/AuthService.js";
import { ConversationController } from "../../src/modules/conversations/controller/ConversationController.js";
import { ConversationService } from "../../src/modules/conversations/service/ConversationService.js";
import { createConversationRoutes } from "../../src/modules/conversations/routes/conversations.routes.js";
import { hashPassword } from "../../src/modules/auth/utils/password.js";
import { InMemoryAuthRepository } from "../auth/InMemoryAuthRepository.js";
import {
  InMemoryConversationRepository,
  makeConversation,
  makeMember,
  seedUser,
} from "./InMemoryConversationRepository.js";

const testEnv = {
  NODE_ENV: "test",
  PORT: "3099",
  HOST: "127.0.0.1",
  API_PREFIX: "/api",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/chat_test",
  REDIS_URL: "redis://localhost:6379/15",
  JWT_ACCESS_SECRET: "test-access-secret-min-32-characters!!",
  JWT_REFRESH_SECRET: "test-refresh-secret-min-32-characters!",
  JWT_ACCESS_EXPIRES_IN: "15m",
  JWT_REFRESH_EXPIRES_IN: "7d",
  JWT_ISSUER: "chat-api",
  JWT_AUDIENCE: "chat-web",
  COOKIE_NAME: "chat_session",
  COOKIE_SECURE: "false",
  COOKIE_SAME_SITE: "lax",
  CORS_ORIGIN: "http://localhost:5173",
  LOG_LEVEL: "silent",
  RATE_LIMIT_WINDOW_MS: "60000",
  RATE_LIMIT_MAX: "1000",
} as NodeJS.ProcessEnv;

async function createApp() {
  resetConfigForTests();
  const config = loadConfig(testEnv);
  const logger = pino({ level: "silent" });

  const authRepo = new InMemoryAuthRepository();
  const convRepo = new InMemoryConversationRepository();
  const passwordHash = await hashPassword("demo1234", true);

  authRepo.seedUser({
    id: "usr_1",
    email: "demo@chat.app",
    name: "Ada",
    avatarUrl: "a.png",
    passwordHash,
    deletedAt: null,
  });

  convRepo.seedUser(
    seedUser({ id: "usr_1", name: "Ada", avatarUrl: "a.png", passwordHash })
  );
  convRepo.seedUser(
    seedUser({ id: "usr_2", name: "Grace", avatarUrl: "g.png" })
  );

  convRepo.seedConversation(
    makeConversation({
      id: "conv_dm",
      type: "DIRECT",
      lastMessagePreview: "Hi",
      lastMessageAt: new Date("2026-01-03T00:00:00.000Z"),
      lastMessageId: "msg_1",
    })
  );
  convRepo.seedMember(
    makeMember({
      id: "m1",
      conversationId: "conv_dm",
      userId: "usr_1",
      unreadCount: 3,
    })
  );
  convRepo.seedMember(
    makeMember({
      id: "m2",
      conversationId: "conv_dm",
      userId: "usr_2",
    })
  );

  convRepo.seedConversation(
    makeConversation({
      id: "conv_group",
      type: "GROUP",
      name: "Dev",
      description: "Eng",
      createdById: "usr_1",
      inviteCode: "xyz",
      lastMessageAt: new Date("2026-01-01T00:00:00.000Z"),
    })
  );
  convRepo.seedMember(
    makeMember({
      id: "mg1",
      conversationId: "conv_group",
      userId: "usr_1",
      role: "OWNER",
    })
  );
  convRepo.seedMember(
    makeMember({
      id: "mg2",
      conversationId: "conv_group",
      userId: "usr_2",
      role: "MEMBER",
    })
  );

  const authService = new AuthService(authRepo, config);
  const conversationService = new ConversationService(convRepo, logger);
  const controller = new ConversationController(conversationService, logger);
  const authenticate = createAuthenticateMiddleware(authService, config);

  const app = express();
  applySecurityMiddleware(app, config);
  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use(
    "/api/conversations",
    createConversationRoutes(controller, authenticate)
  );
  app.use(notFoundHandler);
  app.use(createErrorHandler(config, logger));

  const session = await authService.login(
    { email: "demo@chat.app", password: "demo1234" },
    {}
  );

  return {
    app,
    convRepo,
    authHeader: { Authorization: `Bearer ${session.accessToken}` },
  };
}

describe("Conversations HTTP endpoints", () => {
  let app: express.Express;
  let authHeader: { Authorization: string };
  let convRepo: InMemoryConversationRepository;

  beforeEach(async () => {
    const ctx = await createApp();
    app = ctx.app;
    authHeader = ctx.authHeader;
    convRepo = ctx.convRepo;
  });

  it("requires authentication", async () => {
    await request(app).get("/api/conversations").expect(401);
  });

  it("GET /conversations returns inbox bundle", async () => {
    const res = await request(app)
      .get("/api/conversations")
      .set(authHeader)
      .expect(200);

    expect(res.body.conversations).toHaveLength(2);
    expect(res.body.users.some((u: { id: string }) => u.id === "usr_2")).toBe(
      true
    );
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("GET /conversations/:id returns direct DTO", async () => {
    const res = await request(app)
      .get("/api/conversations/conv_dm")
      .set(authHeader)
      .expect(200);

    expect(res.body.type).toBe("direct");
    expect(res.body.name).toBe("Grace");
    expect(res.body.members).toBeNull();
  });

  it("GET /conversations/:id returns 404 for stranger", async () => {
    convRepo.seedConversation(
      makeConversation({ id: "conv_secret", type: "GROUP", name: "Secret" })
    );
    const res = await request(app)
      .get("/api/conversations/conv_secret")
      .set(authHeader)
      .expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("PATCH mute updates preference", async () => {
    const res = await request(app)
      .patch("/api/conversations/conv_dm/mute")
      .set(authHeader)
      .send({ muted: true })
      .expect(200);

    expect(res.body.muted).toBe(true);
  });

  it("PATCH mute validates body", async () => {
    const res = await request(app)
      .patch("/api/conversations/conv_dm/mute")
      .set(authHeader)
      .send({ muted: "yes" })
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST read is idempotent and returns 204", async () => {
    await request(app)
      .post("/api/conversations/conv_dm/read")
      .set(authHeader)
      .expect(204);

    await request(app)
      .post("/api/conversations/conv_dm/read")
      .set(authHeader)
      .expect(204);

    const dto = await request(app)
      .get("/api/conversations/conv_dm")
      .set(authHeader)
      .expect(200);
    expect(dto.body.unreadCount).toBe(0);
  });

  it("POST read returns 404 for non-member", async () => {
    await request(app)
      .post("/api/conversations/missing/read")
      .set(authHeader)
      .expect(404);
  });
});
