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
import { MessageController } from "../../src/modules/messages/controller/MessageController.js";
import { MessageService } from "../../src/modules/messages/service/MessageService.js";
import {
  createConversationMessageRoutes,
  createMessageRoutes,
} from "../../src/modules/messages/routes/messages.routes.js";
import { hashPassword } from "../../src/modules/auth/utils/password.js";
import { InMemoryAuthRepository } from "../auth/InMemoryAuthRepository.js";
import {
  InMemoryMessageRepository,
  makeConversation,
  makeMember,
  makeMessage,
} from "./InMemoryMessageRepository.js";

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
  const messageRepo = new InMemoryMessageRepository();
  const passwordHash = await hashPassword("demo1234", true);

  authRepo.seedUser({
    id: "usr_1",
    email: "demo@chat.app",
    name: "Ada",
    avatarUrl: "a.png",
    passwordHash,
    deletedAt: null,
  });

  messageRepo.seedConversation(
    makeConversation({
      id: "conv_dm",
      type: "DIRECT",
      directPairKey: "usr_1:usr_2",
    })
  );
  messageRepo.seedMember(
    makeMember({ id: "m1", conversationId: "conv_dm", userId: "usr_1" })
  );
  messageRepo.seedMember(
    makeMember({ id: "m2", conversationId: "conv_dm", userId: "usr_2" })
  );
  messageRepo.seedUser({ id: "usr_1", deletedAt: null });
  messageRepo.seedUser({ id: "usr_2", deletedAt: null });
  messageRepo.seedUser({ id: "usr_99", deletedAt: null });

  for (let i = 0; i < 5; i++) {
    messageRepo.seedMessage(
      makeMessage({
        id: `msg_${i}`,
        conversationId: "conv_dm",
        senderId: i % 2 === 0 ? "usr_1" : "usr_2",
        content: `m${i}`,
        createdAt: new Date(`2026-02-0${i + 1}T00:00:00.000Z`),
        clientMessageId: `seed_${i}`,
      })
    );
  }

  const authService = new AuthService(authRepo, config);
  const messageService = new MessageService(messageRepo, logger);
  const controller = new MessageController(messageService, logger);
  const authenticate = createAuthenticateMiddleware(authService, config);

  const app = express();
  applySecurityMiddleware(app, config);
  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use(
    "/api/conversations",
    createConversationMessageRoutes(controller, authenticate)
  );
  app.use("/api/messages", createMessageRoutes(controller, authenticate));
  app.use(notFoundHandler);
  app.use(createErrorHandler(config, logger));

  const session = await authService.login(
    { email: "demo@chat.app", password: "demo1234" },
    {}
  );

  return {
    app,
    messageRepo,
    authHeader: { Authorization: `Bearer ${session.accessToken}` },
  };
}

describe("Messages HTTP endpoints", () => {
  let app: express.Express;
  let authHeader: { Authorization: string };
  let messageRepo: InMemoryMessageRepository;

  beforeEach(async () => {
    const ctx = await createApp();
    app = ctx.app;
    authHeader = ctx.authHeader;
    messageRepo = ctx.messageRepo;
  });

  it("requires authentication", async () => {
    await request(app).get("/api/conversations/conv_dm/messages").expect(401);
  });

  it("POST send creates message (201)", async () => {
    const res = await request(app)
      .post("/api/conversations/conv_dm/messages")
      .set(authHeader)
      .send({ content: "Hello world", clientMessageId: "http-1" })
      .expect(201);

    expect(res.body).toMatchObject({
      content: "Hello world",
      clientMessageId: "http-1",
      status: "sent",
      type: "text",
    });
    expect(res.body.id).toBeTruthy();
  });

  it("duplicate clientMessageId returns 200 with same id", async () => {
    const first = await request(app)
      .post("/api/conversations/conv_dm/messages")
      .set(authHeader)
      .send({ content: "Once", clientMessageId: "http-dup" })
      .expect(201);

    const second = await request(app)
      .post("/api/conversations/conv_dm/messages")
      .set(authHeader)
      .send({ content: "Twice", clientMessageId: "http-dup" })
      .expect(200);

    expect(second.body.id).toBe(first.body.id);
  });

  it("soft delete returns deleted message", async () => {
    const created = await request(app)
      .post("/api/conversations/conv_dm/messages")
      .set(authHeader)
      .send({ content: "to delete", clientMessageId: "http-del" })
      .expect(201);

    const res = await request(app)
      .delete(`/api/messages/${created.body.id}`)
      .set(authHeader)
      .expect(200);

    expect(res.body.deleted).toBe(true);
    expect(res.body.content).toBe("");
  });

  it("non-member access returns 404", async () => {
    messageRepo.seedConversation(
      makeConversation({ id: "conv_secret", type: "GROUP" })
    );

    await request(app)
      .get("/api/conversations/conv_secret/messages")
      .set(authHeader)
      .expect(404);

    await request(app)
      .post("/api/conversations/conv_secret/messages")
      .set(authHeader)
      .send({ content: "nope", clientMessageId: "x" })
      .expect(404);
  });

  it("invalid payloads return 400", async () => {
    await request(app)
      .post("/api/conversations/conv_dm/messages")
      .set(authHeader)
      .send({ content: "", clientMessageId: "bad" })
      .expect(400);

    await request(app)
      .post("/api/conversations/conv_dm/messages")
      .set(authHeader)
      .send({ type: "system", content: "x", clientMessageId: "sys" })
      .expect(400);

    await request(app)
      .post("/api/conversations/conv_dm/messages")
      .set(authHeader)
      .send({ type: "image", clientMessageId: "img" })
      .expect(400);
  });

  it("GET messages supports keyset pagination", async () => {
    const page1 = await request(app)
      .get("/api/conversations/conv_dm/messages")
      .query({ limit: 2 })
      .set(authHeader)
      .expect(200);

    expect(page1.body.messages).toHaveLength(2);
    expect(page1.body.hasMore).toBe(true);
    expect(page1.body.nextCursor).toBeTruthy();

    const page2 = await request(app)
      .get("/api/conversations/conv_dm/messages")
      .query({ limit: 2, cursor: page1.body.nextCursor })
      .set(authHeader)
      .expect(200);

    expect(page2.body.messages).toHaveLength(2);
    const ids1 = page1.body.messages.map((m: { id: string }) => m.id);
    const ids2 = page2.body.messages.map((m: { id: string }) => m.id);
    expect(ids1.some((id: string) => ids2.includes(id))).toBe(false);
  });

  it("star and pin endpoints work", async () => {
    const created = await request(app)
      .post("/api/conversations/conv_dm/messages")
      .set(authHeader)
      .send({ content: "flag me", clientMessageId: "http-flag" })
      .expect(201);

    const starred = await request(app)
      .post(`/api/messages/${created.body.id}/star`)
      .set(authHeader)
      .expect(200);
    expect(starred.body.starred).toBe(true);

    const pinned = await request(app)
      .post(`/api/messages/${created.body.id}/pin`)
      .set(authHeader)
      .expect(200);
    expect(pinned.body.pinned).toBe(true);

    await request(app)
      .delete(`/api/messages/${created.body.id}/star`)
      .set(authHeader)
      .expect(200);
    await request(app)
      .delete(`/api/messages/${created.body.id}/pin`)
      .set(authHeader)
      .expect(200);
  });

  it("POST /messages/direct creates DIRECT conversation", async () => {
    const res = await request(app)
      .post("/api/messages/direct")
      .set(authHeader)
      .send({
        peerUserId: "usr_99",
        content: "First DM",
        clientMessageId: "direct-1",
      })
      .expect(201);

    expect(res.body.conversationId).toBeTruthy();
    expect(res.body.message.content).toBe("First DM");
  });

  it("retry failed message", async () => {
    messageRepo.seedMessage(
      makeMessage({
        id: "msg_failed",
        conversationId: "conv_dm",
        senderId: "usr_1",
        status: "FAILED",
        content: "retry me",
      })
    );

    const res = await request(app)
      .post("/api/messages/msg_failed/retry")
      .set(authHeader)
      .expect(200);

    expect(res.body.status).toBe("sent");
  });
});
