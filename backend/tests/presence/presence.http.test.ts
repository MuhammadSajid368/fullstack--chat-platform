import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import pino from "pino";
import {
  createErrorHandler,
  notFoundHandler,
} from "../../src/middleware/errorHandler.js";
import { requestIdMiddleware } from "../../src/middleware/requestId.js";
import { loadConfig, resetConfigForTests } from "../../src/config/index.js";
import { PresenceController } from "../../src/modules/presence/controller/PresenceController.js";
import { PresenceService } from "../../src/modules/presence/service/PresenceService.js";
import { PresenceRepository } from "../../src/modules/presence/repository/PresenceRepository.js";
import { createPresenceRoutes } from "../../src/modules/presence/routes/presence.routes.js";
import { EventPublisher } from "../../src/websocket/EventPublisher.js";
import { createFakeRedis } from "../websocket/fakeRedis.js";

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

function createPrisma() {
  const prefs = {
    presencePrivacy: "EVERYONE" as const,
    presencePreferredStatus: "ONLINE" as const,
    lastSeenAt: null as Date | null,
  };
  return {
    prefs,
    client: {
      user: {
        update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          if (data.presencePrivacy) {
            prefs.presencePrivacy = data.presencePrivacy as typeof prefs.presencePrivacy;
          }
          if (data.presencePreferredStatus) {
            prefs.presencePreferredStatus =
              data.presencePreferredStatus as typeof prefs.presencePreferredStatus;
          }
          if (data.lastSeenAt) {
            prefs.lastSeenAt = data.lastSeenAt as Date;
          }
          return { ...prefs };
        }),
        findUnique: vi.fn().mockImplementation(async () => ({ ...prefs })),
        findFirst: vi.fn().mockResolvedValue({ id: "usr_1" }),
      },
      conversationMember: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
  };
}

function createApp(viewerId = "usr_1") {
  resetConfigForTests();
  const config = loadConfig(testEnv);
  const logger = pino({ level: "silent" });
  const { client } = createPrisma();
  const redis = createFakeRedis();
  const repo = new PresenceRepository(client as never, redis);
  const service = new PresenceService(repo, new EventPublisher(), logger);
  const controller = new PresenceController(service, logger);

  const authenticate = (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.user = {
      id: viewerId,
      email: "me@test.app",
      name: "Me",
      avatarUrl: null,
    };
    next();
  };

  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use("/api/presence", createPresenceRoutes(controller, authenticate));
  app.use(notFoundHandler);
  app.use(createErrorHandler(config, logger));
  return { app, service, redis, client };
}

describe("Presence HTTP", () => {
  it("GET /presence returns self presence", async () => {
    const { app, service } = createApp();
    await service.markOnline("usr_1", "s1", {
      socketId: "s1",
      deviceType: "phone",
    });
    const res = await request(app).get("/api/presence").expect(200);
    expect(res.body.status).toBe("ONLINE");
    expect(res.body.deviceCount).toBe(1);
    expect(res.body.devices).toHaveLength(1);
  });

  it("GET /presence/:userId applies privacy", async () => {
    const { app, service, client } = createApp("usr_2");
    client.user.findUnique.mockImplementation(async () => ({
      presencePrivacy: "NOBODY",
      presencePreferredStatus: "ONLINE",
      lastSeenAt: new Date(),
    }));
    client.user.findFirst.mockResolvedValue({ id: "usr_1" });
    await service.markOnline("usr_1", "s1", {
      socketId: "s1",
      deviceType: "desktop",
    });
    const res = await request(app).get("/api/presence/usr_1").expect(200);
    expect(res.body.status).toBe("OFFLINE");
    expect(res.body.lastSeenAt).toBeNull();
    expect(res.body.deviceCount).toBeNull();
  });

  it("POST /presence/status updates preferred status", async () => {
    const { app, service } = createApp();
    await service.markOnline("usr_1", "s1", {
      socketId: "s1",
      deviceType: "browser",
    });
    const res = await request(app)
      .post("/api/presence/status")
      .send({ status: "AWAY" })
      .expect(200);
    expect(res.body.preferredStatus).toBe("AWAY");
    expect(res.body.status).toBe("AWAY");
  });

  it("POST /presence/privacy updates privacy", async () => {
    const { app } = createApp();
    const res = await request(app)
      .post("/api/presence/privacy")
      .send({ privacy: "CONTACTS" })
      .expect(200);
    expect(res.body.privacy).toBe("CONTACTS");
  });

  it("rejects invalid status body", async () => {
    const { app } = createApp();
    await request(app)
      .post("/api/presence/status")
      .send({ status: "BUSY" })
      .expect(400);
  });
});
