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
import { GroupController } from "../../src/modules/groups/controller/GroupController.js";
import { GroupService } from "../../src/modules/groups/service/GroupService.js";
import { createGroupRoutes } from "../../src/modules/groups/routes/groups.routes.js";
import { hashPassword } from "../../src/modules/auth/utils/password.js";
import { InMemoryAuthRepository } from "../auth/InMemoryAuthRepository.js";
import { InMemoryGroupRepository } from "./InMemoryGroupRepository.js";

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
  const groupRepo = new InMemoryGroupRepository();
  const passwordHash = await hashPassword("demo1234", true);

  authRepo.seedUser({
    id: "usr_owner",
    email: "owner@chat.app",
    name: "Owner",
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

  groupRepo.seedUser({ id: "usr_owner", deletedAt: null, suspendedAt: null });
  groupRepo.seedUser({ id: "usr_2", deletedAt: null, suspendedAt: null });
  groupRepo.seedUser({ id: "usr_3", deletedAt: null, suspendedAt: null });
  groupRepo.seedUser({ id: "usr_4", deletedAt: null, suspendedAt: null });

  const authService = new AuthService(authRepo, config);
  const groupService = new GroupService(groupRepo, logger);
  const controller = new GroupController(groupService, logger);
  const authenticate = createAuthenticateMiddleware(authService, config);

  const app = express();
  applySecurityMiddleware(app, config);
  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use("/api/groups", createGroupRoutes(controller, authenticate));
  app.use(notFoundHandler);
  app.use(createErrorHandler(config, logger));

  const ownerSession = await authService.login(
    { email: "owner@chat.app", password: "demo1234" },
    {}
  );
  const memberSession = await authService.login(
    { email: "two@chat.app", password: "demo1234" },
    {}
  );

  return {
    app,
    groupRepo,
    ownerHeader: { Authorization: `Bearer ${ownerSession.accessToken}` },
    memberHeader: { Authorization: `Bearer ${memberSession.accessToken}` },
  };
}

describe("Groups HTTP endpoints", () => {
  let app: express.Express;
  let ownerHeader: { Authorization: string };
  let memberHeader: { Authorization: string };

  beforeEach(async () => {
    const ctx = await createApp();
    app = ctx.app;
    ownerHeader = ctx.ownerHeader;
    memberHeader = ctx.memberHeader;
  });

  it("requires authentication", async () => {
    await request(app).post("/api/groups").send({ name: "X" }).expect(401);
  });

  it("POST /groups creates group", async () => {
    const res = await request(app)
      .post("/api/groups")
      .set(ownerHeader)
      .send({
        name: "Dev Team",
        description: "Engineering",
        memberUserIds: ["usr_2", "usr_3"],
      })
      .expect(201);

    expect(res.body.type).toBe("group");
    expect(res.body.name).toBe("Dev Team");
    expect(res.body.members).toEqual(
      expect.arrayContaining([
        { userId: "usr_owner", role: "owner" },
        { userId: "usr_2", role: "member" },
        { userId: "usr_3", role: "member" },
      ])
    );
  });

  it("rejects invalid create payload", async () => {
    await request(app)
      .post("/api/groups")
      .set(ownerHeader)
      .send({ name: "" })
      .expect(400);
  });

  it("rejects create with fewer than 2 members", async () => {
    await request(app)
      .post("/api/groups")
      .set(ownerHeader)
      .send({ name: "TooSmall", memberUserIds: ["usr_2"] })
      .expect(400);
  });

  it("GET /groups/:id returns group for member", async () => {
    const created = await request(app)
      .post("/api/groups")
      .set(ownerHeader)
      .send({ name: "G", memberUserIds: ["usr_2", "usr_3"] })
      .expect(201);

    const res = await request(app)
      .get(`/api/groups/${created.body.id}`)
      .set(memberHeader)
      .expect(200);

    expect(res.body.id).toBe(created.body.id);
  });

  it("non-member GET returns 404", async () => {
    const created = await request(app)
      .post("/api/groups")
      .set(ownerHeader)
      .send({ name: "Private", memberUserIds: ["usr_3", "usr_4"] })
      .expect(201);

    await request(app)
      .get(`/api/groups/${created.body.id}`)
      .set(memberHeader)
      .expect(404);
  });

  it("add / remove members and leave", async () => {
    const created = await request(app)
      .post("/api/groups")
      .set(ownerHeader)
      .send({ name: "G", memberUserIds: ["usr_2", "usr_3"] })
      .expect(201);

    const added = await request(app)
      .post(`/api/groups/${created.body.id}/members`)
      .set(ownerHeader)
      .send({ memberUserIds: ["usr_4"] })
      .expect(200);

    expect(added.body.memberIds).toEqual(
      expect.arrayContaining(["usr_2", "usr_3", "usr_4", "usr_owner"])
    );

    await request(app)
      .delete(`/api/groups/${created.body.id}/members/usr_3`)
      .set(ownerHeader)
      .expect(200);

    await request(app)
      .post(`/api/groups/${created.body.id}/leave`)
      .set(memberHeader)
      .expect(204);
  });

  it("transfer ownership and soft delete", async () => {
    const created = await request(app)
      .post("/api/groups")
      .set(ownerHeader)
      .send({ name: "G", memberUserIds: ["usr_2", "usr_3"] })
      .expect(201);

    const transferred = await request(app)
      .post(`/api/groups/${created.body.id}/transfer-ownership`)
      .set(ownerHeader)
      .send({ toUserId: "usr_2" })
      .expect(200);

    expect(
      transferred.body.members.find(
        (m: { role: string }) => m.role === "owner"
      ).userId
    ).toBe("usr_2");

    await request(app)
      .delete(`/api/groups/${created.body.id}`)
      .set(memberHeader)
      .expect(204);

    await request(app)
      .get(`/api/groups/${created.body.id}`)
      .set(memberHeader)
      .expect(404);
  });

  it("PATCH metadata and role change", async () => {
    const created = await request(app)
      .post("/api/groups")
      .set(ownerHeader)
      .send({ name: "G", memberUserIds: ["usr_2", "usr_3"] })
      .expect(201);

    const updated = await request(app)
      .patch(`/api/groups/${created.body.id}`)
      .set(ownerHeader)
      .send({ name: "Renamed", description: "New" })
      .expect(200);

    expect(updated.body.name).toBe("Renamed");
    expect(updated.body.description).toBe("New");

    const role = await request(app)
      .patch(`/api/groups/${created.body.id}/members/usr_2/role`)
      .set(ownerHeader)
      .send({ role: "admin" })
      .expect(200);

    expect(
      role.body.members.find((m: { userId: string }) => m.userId === "usr_2")
        .role
    ).toBe("admin");
  });

  it("sole owner leave returns conflict", async () => {
    const created = await request(app)
      .post("/api/groups")
      .set(ownerHeader)
      .send({ name: "G", memberUserIds: ["usr_2", "usr_3"] })
      .expect(201);

    await request(app)
      .post(`/api/groups/${created.body.id}/leave`)
      .set(ownerHeader)
      .expect(409);
  });
});
