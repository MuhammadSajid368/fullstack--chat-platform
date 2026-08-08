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
import { UserController } from "../../src/modules/users/controller/UserController.js";
import { UserService } from "../../src/modules/users/service/UserService.js";
import { createUserRoutes } from "../../src/modules/users/routes/users.routes.js";
import { hashPassword } from "../../src/modules/auth/utils/password.js";
import { InMemoryAuthRepository } from "../auth/InMemoryAuthRepository.js";
import {
  InMemoryUserRepository,
  type InMemoryUser,
} from "./InMemoryUserRepository.js";

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

function seedProfile(
  overrides: Partial<InMemoryUser> & Pick<InMemoryUser, "id" | "email" | "name">
): InMemoryUser {
  return {
    avatarUrl: null,
    phone: null,
    about: null,
    passwordHash: "x",
    deletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

async function createUsersTestApp() {
  resetConfigForTests();
  const config = loadConfig(testEnv);
  const logger = pino({ level: "silent" });

  const authRepo = new InMemoryAuthRepository();
  const userRepo = new InMemoryUserRepository();
  const passwordHash = await hashPassword("demo1234", true);

  authRepo.seedUser({
    id: "usr_1",
    email: "demo@chat.app",
    name: "Demo User",
    avatarUrl: null,
    passwordHash,
    deletedAt: null,
  });

  userRepo.seed(
    seedProfile({
      id: "usr_1",
      email: "demo@chat.app",
      name: "Demo User",
      createdAt: new Date("2026-01-03T00:00:00.000Z"),
      passwordHash,
    })
  );
  userRepo.seed(
    seedProfile({
      id: "usr_2",
      email: "other@chat.app",
      name: "Other User",
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
    })
  );
  userRepo.seed(
    seedProfile({
      id: "usr_del",
      email: "gone@chat.app",
      name: "Gone",
      deletedAt: new Date(),
      createdAt: new Date("2026-01-04T00:00:00.000Z"),
    })
  );

  const authService = new AuthService(authRepo, config);
  const userService = new UserService(userRepo);
  const controller = new UserController(userService, logger);
  const authenticate = createAuthenticateMiddleware(authService, config);

  const app = express();
  applySecurityMiddleware(app, config);
  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use("/api/users", createUserRoutes(controller, authenticate));
  app.use(notFoundHandler);
  app.use(createErrorHandler(config, logger));

  const session = await authService.login(
    { email: "demo@chat.app", password: "demo1234" },
    {}
  );

  return {
    app,
    userRepo,
    accessToken: session.accessToken,
    authHeader: { Authorization: `Bearer ${session.accessToken}` },
  };
}

describe("Users HTTP endpoints", () => {
  let app: express.Express;
  let authHeader: { Authorization: string };
  let userRepo: InMemoryUserRepository;

  beforeEach(async () => {
    const ctx = await createUsersTestApp();
    app = ctx.app;
    authHeader = ctx.authHeader;
    userRepo = ctx.userRepo;
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/users").expect(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("GET /users lists active users only", async () => {
    const res = await request(app)
      .get("/api/users")
      .set(authHeader)
      .expect(200);

    expect(res.body.users.map((u: { id: string }) => u.id)).toEqual([
      "usr_1",
      "usr_2",
    ]);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    expect(res.body.users[0]).not.toHaveProperty("passwordHash");
  });

  it("GET /users/:id returns public profile", async () => {
    const res = await request(app)
      .get("/api/users/usr_2")
      .set(authHeader)
      .expect(200);

    expect(res.body.user).toMatchObject({
      id: "usr_2",
      name: "Other User",
      email: "other@chat.app",
    });
  });

  it("GET /users/:id returns 404 for soft-deleted", async () => {
    const res = await request(app)
      .get("/api/users/usr_del")
      .set(authHeader)
      .expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("GET /users/search finds by name", async () => {
    const res = await request(app)
      .get("/api/users/search")
      .query({ q: "other" })
      .set(authHeader)
      .expect(200);

    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0].id).toBe("usr_2");
  });

  it("GET /users/search validates query", async () => {
    const res = await request(app)
      .get("/api/users/search")
      .set(authHeader)
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("PATCH /users/me updates own profile", async () => {
    const res = await request(app)
      .patch("/api/users/me")
      .set(authHeader)
      .send({
        name: "Demo Updated",
        avatarUrl: "https://cdn.example.com/me.png",
        id: "hacker",
        email: "evil@example.com",
        password: "nope",
      })
      .expect(200);

    expect(res.body.user.name).toBe("Demo Updated");
    expect(res.body.user.email).toBe("demo@chat.app");
    expect(res.body.user.avatarUrl).toBe("https://cdn.example.com/me.png");
    expect(userRepo.auditLogs).toHaveLength(1);
  });

  it("PATCH /users/me rejects invalid avatarUrl", async () => {
    const res = await request(app)
      .patch("/api/users/me")
      .set(authHeader)
      .send({ avatarUrl: "not-a-url" })
      .expect(400);

    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("PATCH /users/me cannot update another user (own session only)", async () => {
    const before = await userRepo.findActiveUserById("usr_2");
    await request(app)
      .patch("/api/users/me")
      .set(authHeader)
      .send({ name: "Should Only Affect Me" })
      .expect(200);

    const after = await userRepo.findActiveUserById("usr_2");
    expect(after?.name).toBe(before?.name);
  });
});
