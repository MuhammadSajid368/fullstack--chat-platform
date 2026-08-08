import express from "express";
import request from "supertest";
import { describe, expect, it, beforeEach } from "vitest";
import pino from "pino";
import { loadConfig, resetConfigForTests } from "../../src/config/index.js";
import { createErrorHandler, notFoundHandler } from "../../src/middleware/errorHandler.js";
import { applySecurityMiddleware } from "../../src/middleware/security.js";
import { requestIdMiddleware } from "../../src/middleware/requestId.js";
import { AuthController } from "../../src/modules/auth/controller/AuthController.js";
import { AuthService } from "../../src/modules/auth/service/AuthService.js";
import { createAuthRoutes } from "../../src/modules/auth/routes/auth.routes.js";
import { hashPassword } from "../../src/modules/auth/utils/password.js";
import {
  accessCookieName,
  authCookiePath,
  refreshCookieName,
} from "../../src/modules/auth/utils/cookies.js";
import { InMemoryAuthRepository } from "./InMemoryAuthRepository.js";

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
  COOKIE_NAME: "chat_session",
  COOKIE_SECURE: "false",
  COOKIE_SAME_SITE: "lax",
  CORS_ORIGIN: "http://localhost:5173",
  LOG_LEVEL: "silent",
  RATE_LIMIT_WINDOW_MS: "60000",
  RATE_LIMIT_MAX: "1000",
} as NodeJS.ProcessEnv;

function createAuthTestApp(repo: InMemoryAuthRepository) {
  resetConfigForTests();
  const config = loadConfig(testEnv);
  const logger = pino({ level: "silent" });
  const service = new AuthService(repo, config);
  const controller = new AuthController(service, config, logger);

  const app = express();
  applySecurityMiddleware(app, config);
  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use("/api/auth", createAuthRoutes(controller, config));
  app.use(notFoundHandler);
  app.use(createErrorHandler(config, logger));

  return { app, config };
}

function cookieValue(setCookie: string[] | undefined, name: string): string | undefined {
  if (!setCookie) {
    return undefined;
  }
  for (const header of setCookie) {
    if (header.startsWith(`${name}=`)) {
      return header.slice(name.length + 1).split(";")[0];
    }
  }
  return undefined;
}

describe("Auth HTTP endpoints", () => {
  let repo: InMemoryAuthRepository;

  beforeEach(async () => {
    repo = new InMemoryAuthRepository();
    const passwordHash = await hashPassword("demo1234", true);
    repo.seedUser({
      id: "usr_1",
      email: "demo@chat.app",
      name: "Demo User",
      avatarUrl: "https://example.com/a.png",
      passwordHash,
      deletedAt: null,
    });
  });

  it("POST /auth/login sets HttpOnly cookies and returns user contract", async () => {
    const { app, config } = createAuthTestApp(repo);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "demo@chat.app", password: "demo1234" })
      .expect(200);

    expect(res.body).toEqual({
      user: {
        id: "usr_1",
        email: "demo@chat.app",
        name: "Demo User",
        avatarUrl: "https://example.com/a.png",
      },
    });
    expect(res.body.user).not.toHaveProperty("passwordHash");
    expect(res.body).not.toHaveProperty("accessToken");
    expect(res.body).not.toHaveProperty("refreshToken");

    const setCookie = res.headers["set-cookie"] as string[] | undefined;
    expect(setCookie?.length).toBeGreaterThanOrEqual(2);

    const refresh = setCookie?.find((c) =>
      c.startsWith(`${refreshCookieName(config)}=`)
    );
    const access = setCookie?.find((c) =>
      c.startsWith(`${accessCookieName(config)}=`)
    );

    expect(refresh).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/SameSite=Lax/i);
    expect(refresh).toMatch(new RegExp(`Path=${authCookiePath(config)}`, "i"));
    expect(access).toMatch(/HttpOnly/i);
    expect(access).toMatch(new RegExp(`Path=${authCookiePath(config)}`, "i"));
  });

  it("POST /auth/login rejects invalid credentials", async () => {
    const { app } = createAuthTestApp(repo);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "demo@chat.app", password: "nope" })
      .expect(401);

    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("GET /auth/me restores session from refresh cookie", async () => {
    const { app, config } = createAuthTestApp(repo);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "demo@chat.app", password: "demo1234" })
      .expect(200);

    const refresh = cookieValue(
      login.headers["set-cookie"] as string[],
      refreshCookieName(config)
    );
    expect(refresh).toBeTruthy();

    const me = await request(app)
      .get("/api/auth/me")
      .set("Cookie", `${refreshCookieName(config)}=${refresh}`)
      .expect(200);

    expect(me.body.user.email).toBe("demo@chat.app");
  });

  it("POST /auth/refresh rotates cookie value", async () => {
    const { app, config } = createAuthTestApp(repo);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "demo@chat.app", password: "demo1234" })
      .expect(200);

    const refreshName = refreshCookieName(config);
    const firstRefresh = cookieValue(
      login.headers["set-cookie"] as string[],
      refreshName
    );

    const refreshed = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", `${refreshName}=${firstRefresh}`)
      .expect(200);

    const secondRefresh = cookieValue(
      refreshed.headers["set-cookie"] as string[],
      refreshName
    );
    expect(secondRefresh).toBeTruthy();
    expect(secondRefresh).not.toBe(firstRefresh);
    expect(refreshed.body.user.id).toBe("usr_1");
  });

  it("POST /auth/refresh detects replay of an old refresh cookie", async () => {
    const { app, config } = createAuthTestApp(repo);
    const refreshName = refreshCookieName(config);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "demo@chat.app", password: "demo1234" })
      .expect(200);

    const firstRefresh = cookieValue(
      login.headers["set-cookie"] as string[],
      refreshName
    );

    await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", `${refreshName}=${firstRefresh}`)
      .expect(200);

    const replay = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", `${refreshName}=${firstRefresh}`)
      .expect(401);

    expect(replay.body.error.code).toBe("UNAUTHORIZED");
  });

  it("POST /auth/logout clears cookies and revokes session", async () => {
    const { app, config } = createAuthTestApp(repo);
    const refreshName = refreshCookieName(config);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "demo@chat.app", password: "demo1234" })
      .expect(200);

    const refresh = cookieValue(
      login.headers["set-cookie"] as string[],
      refreshName
    );

    const logout = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", `${refreshName}=${refresh}`)
      .expect(204);

    const cleared = logout.headers["set-cookie"] as string[] | undefined;
    expect(cleared?.some((c) => c.startsWith(`${refreshName}=`))).toBe(true);

    await request(app)
      .get("/api/auth/me")
      .set("Cookie", `${refreshName}=${refresh}`)
      .expect(401);
  });

  it("GET /auth/me returns 401 without cookies", async () => {
    const { app } = createAuthTestApp(repo);
    const res = await request(app).get("/api/auth/me").expect(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects expired session on /auth/me", async () => {
    const { app, config } = createAuthTestApp(repo);
    const refreshName = refreshCookieName(config);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "demo@chat.app", password: "demo1234" })
      .expect(200);

    const refresh = cookieValue(
      login.headers["set-cookie"] as string[],
      refreshName
    );

    const session = [...repo.sessions.values()][0];
    session.expiresAt = new Date(Date.now() - 1000);

    await request(app)
      .get("/api/auth/me")
      .set("Cookie", `${refreshName}=${refresh}`)
      .expect(401);
  });

  it("POST /auth/register creates user, sets cookies, returns 201", async () => {
    const { app, config } = createAuthTestApp(repo);
    const refreshName = refreshCookieName(config);
    const accessName = accessCookieName(config);

    const res = await request(app)
      .post("/api/auth/register")
      .send({
        name: "John Doe",
        email: "John@Example.com",
        password: "StrongPassword123!",
      })
      .expect(201);

    expect(res.body.user.email).toBe("john@example.com");
    expect(res.body.user.name).toBe("John Doe");
    expect(res.body.user.id).toBeTruthy();
    expect(res.body.user).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");

    const setCookie = res.headers["set-cookie"] as string[];
    expect(cookieValue(setCookie, refreshName)).toBeTruthy();
    expect(cookieValue(setCookie, accessName)).toBeTruthy();
    expect(
      setCookie.some(
        (c) => c.includes("HttpOnly") && c.startsWith(`${refreshName}=`)
      )
    ).toBe(true);
    expect(
      setCookie.some((c) => c.includes(`Path=${authCookiePath(config)}`))
    ).toBe(true);

    await request(app)
      .post("/api/auth/login")
      .send({ email: "john@example.com", password: "StrongPassword123!" })
      .expect(200);
  });

  it("POST /auth/register rejects duplicate email with 409", async () => {
    const { app } = createAuthTestApp(repo);
    await request(app)
      .post("/api/auth/register")
      .send({
        name: "Dup",
        email: "demo@chat.app",
        password: "StrongPassword123!",
      })
      .expect(409);
  });

  it("POST /auth/register rejects invalid email and weak password", async () => {
    const { app } = createAuthTestApp(repo);

    const badEmail = await request(app)
      .post("/api/auth/register")
      .send({
        name: "X",
        email: "not-an-email",
        password: "StrongPassword123!",
      })
      .expect(400);
    expect(badEmail.body.error.code).toBe("VALIDATION_ERROR");

    const weak = await request(app)
      .post("/api/auth/register")
      .send({
        name: "X",
        email: "weak@chat.app",
        password: "short",
      })
      .expect(400);
    expect(weak.body.error.code).toBe("VALIDATION_ERROR");

    const missing = await request(app)
      .post("/api/auth/register")
      .send({ email: "a@b.com" })
      .expect(400);
    expect(missing.body.error.code).toBe("VALIDATION_ERROR");
  });
});
