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
import { UploadController } from "../../src/modules/uploads/controller/UploadController.js";
import { UploadService } from "../../src/modules/uploads/service/UploadService.js";
import { createUploadRoutes } from "../../src/modules/uploads/routes/uploads.routes.js";
import { hashPassword } from "../../src/modules/auth/utils/password.js";
import { InMemoryAuthRepository } from "../auth/InMemoryAuthRepository.js";
import { InMemoryUploadRepository } from "./InMemoryUploadRepository.js";

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
  const uploadRepo = new InMemoryUploadRepository();
  const passwordHash = await hashPassword("demo1234", true);

  authRepo.seedUser({
    id: "usr_1",
    email: "demo@chat.app",
    name: "Ada",
    avatarUrl: null,
    passwordHash,
    deletedAt: null,
  });
  authRepo.seedUser({
    id: "usr_2",
    email: "two@chat.app",
    name: "Two",
    avatarUrl: null,
    passwordHash,
    deletedAt: null,
  });
  uploadRepo.seedUser({ id: "usr_1", deletedAt: null });
  uploadRepo.seedUser({ id: "usr_2", deletedAt: null });

  const authService = new AuthService(authRepo, config);
  const uploadService = new UploadService(uploadRepo, logger);
  const controller = new UploadController(uploadService, logger);
  const authenticate = createAuthenticateMiddleware(authService, config);

  const app = express();
  applySecurityMiddleware(app, config);
  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use("/api/uploads", createUploadRoutes(controller, authenticate));
  app.use(notFoundHandler);
  app.use(createErrorHandler(config, logger));

  const session = await authService.login(
    { email: "demo@chat.app", password: "demo1234" },
    {}
  );
  const other = await authService.login(
    { email: "two@chat.app", password: "demo1234" },
    {}
  );

  return {
    app,
    uploadRepo,
    authHeader: { Authorization: `Bearer ${session.accessToken}` },
    otherHeader: { Authorization: `Bearer ${other.accessToken}` },
  };
}

describe("Uploads HTTP endpoints", () => {
  let app: express.Express;
  let authHeader: { Authorization: string };
  let otherHeader: { Authorization: string };

  beforeEach(async () => {
    const ctx = await createApp();
    app = ctx.app;
    authHeader = ctx.authHeader;
    otherHeader = ctx.otherHeader;
  });

  it("requires authentication", async () => {
    await request(app)
      .post("/api/uploads")
      .send({
        type: "image",
        mimeType: "image/png",
        fileName: "a.png",
        byteSize: 10,
      })
      .expect(401);
  });

  it("creates, gets, completes upload", async () => {
    const created = await request(app)
      .post("/api/uploads")
      .set(authHeader)
      .send({
        type: "image",
        mimeType: "image/png",
        fileName: "a.png",
        byteSize: 100,
      })
      .expect(201);

    expect(created.body.status).toBe("pending");
    expect(JSON.stringify(created.body)).not.toContain("storageKey");

    await request(app)
      .get(`/api/uploads/${created.body.id}`)
      .set(authHeader)
      .expect(200);

    const done = await request(app)
      .post(`/api/uploads/${created.body.id}/complete`)
      .set(authHeader)
      .send({ width: 10, height: 10, checksum: "checksum1" })
      .expect(200);

    expect(done.body.status).toBe("ready");
  });

  it("rejects invalid create payloads", async () => {
    await request(app)
      .post("/api/uploads")
      .set(authHeader)
      .send({
        type: "voice",
        mimeType: "image/png",
        fileName: "a.png",
        byteSize: 10,
      })
      .expect(400);
  });

  it("non-owner cannot view", async () => {
    const created = await request(app)
      .post("/api/uploads")
      .set(authHeader)
      .send({
        type: "document",
        mimeType: "application/pdf",
        fileName: "a.pdf",
        byteSize: 10,
      })
      .expect(201);

    await request(app)
      .get(`/api/uploads/${created.body.id}`)
      .set(otherHeader)
      .expect(404);
  });

  it("fail and delete endpoints", async () => {
    const created = await request(app)
      .post("/api/uploads")
      .set(authHeader)
      .send({
        type: "document",
        mimeType: "application/pdf",
        fileName: "a.pdf",
        byteSize: 10,
      })
      .expect(201);

    const failed = await request(app)
      .post(`/api/uploads/${created.body.id}/fail`)
      .set(authHeader)
      .send({ reason: "timeout" })
      .expect(200);

    expect(failed.body.status).toBe("failed");

    const pending = await request(app)
      .post("/api/uploads")
      .set(authHeader)
      .send({
        type: "document",
        mimeType: "application/pdf",
        fileName: "b.pdf",
        byteSize: 10,
      })
      .expect(201);

    const deleted = await request(app)
      .delete(`/api/uploads/${pending.body.id}`)
      .set(authHeader)
      .expect(200);

    expect(deleted.body.status).toBe("deleted");
  });

  it("complete after complete returns conflict", async () => {
    const created = await request(app)
      .post("/api/uploads")
      .set(authHeader)
      .send({
        type: "image",
        mimeType: "image/png",
        fileName: "a.png",
        byteSize: 10,
      })
      .expect(201);

    await request(app)
      .post(`/api/uploads/${created.body.id}/complete`)
      .set(authHeader)
      .send({ width: 1, height: 1, checksum: "checksum1" })
      .expect(200);

    await request(app)
      .post(`/api/uploads/${created.body.id}/complete`)
      .set(authHeader)
      .send({ width: 1, height: 1, checksum: "checksum1" })
      .expect(409);
  });
});
