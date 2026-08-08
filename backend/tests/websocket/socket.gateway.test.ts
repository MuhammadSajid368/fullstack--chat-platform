import http from "node:http";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import pino from "pino";
import { loadConfig, resetConfigForTests } from "../../src/config/index.js";
import { signAccessToken } from "../../src/modules/auth/utils/tokens.js";
import { EventPublisher } from "../../src/websocket/EventPublisher.js";
import { SocketGateway } from "../../src/websocket/SocketGateway.js";
import { RealtimeEvents } from "../../src/websocket/events.js";
import type { IAuthService } from "../../src/modules/auth/interfaces/IAuthService.js";
import type { IMessageRepository } from "../../src/modules/messages/interfaces/IMessageRepository.js";
import type { IPresenceService } from "../../src/modules/presence/interfaces/IPresenceService.js";
import { createFakeRedis } from "./fakeRedis.js";

const testEnv = {
  NODE_ENV: "test",
  PORT: "3098",
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

function waitForEvent(
  socket: ClientSocket,
  event: string,
  timeoutMs = 3_000
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout waiting for ${event}`)),
      timeoutMs
    );
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function connectClient(
  port: number,
  token?: string
): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`http://127.0.0.1:${port}`, {
      path: "/socket.io",
      transports: ["websocket"],
      forceNew: true,
      auth: token ? { token } : {},
      reconnection: false,
    });
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (err) => reject(err));
  });
}

describe("SocketGateway", () => {
  let server: http.Server;
  let gateway: SocketGateway;
  let port: number;
  let config: ReturnType<typeof loadConfig>;
  let authService: IAuthService;
  let messageRepository: IMessageRepository;
  let presenceService: IPresenceService;
  let eventPublisher: EventPublisher;
  let memberships: Set<string>;

  beforeEach(async () => {
    resetConfigForTests();
    config = loadConfig(testEnv);
    memberships = new Set(["u1:conv_1"]);

    authService = {
      me: vi.fn(async ({ accessToken }: { accessToken?: string }) => {
        if (!accessToken) {
          throw new Error("UNAUTHORIZED");
        }
        // Decode via verify path: token must be valid JWT signed for tests.
        const jwt = await import("jsonwebtoken");
        const decoded = jwt.default.verify(
          accessToken,
          config.jwt.accessSecret
        ) as { sub: string };
        if (decoded.sub === "deleted") {
          throw new Error("UNAUTHORIZED");
        }
        return {
          id: decoded.sub,
          email: `${decoded.sub}@test.app`,
          name: "Test",
          avatarUrl: null,
        };
      }),
    } as unknown as IAuthService;

    messageRepository = {
      findActiveMembership: vi.fn(
        async (userId: string, conversationId: string) => {
          if (memberships.has(`${userId}:${conversationId}`)) {
            return {
              id: "m1",
              conversationId,
              userId,
              role: "MEMBER",
              leftAt: null,
              deletedAt: null,
            };
          }
          return null;
        }
      ),
    } as unknown as IMessageRepository;

    eventPublisher = new EventPublisher();

    presenceService = {
      markOnline: vi.fn(async (userId: string, _socketId: string) => ({
        userId,
        status: "ONLINE" as const,
        lastSeenAt: null,
        privacy: "EVERYONE" as const,
        preferredStatus: "ONLINE" as const,
        deviceCount: 1,
        devices: [],
      })),
      markOffline: vi.fn(async (userId: string, _socketId: string) => ({
        userId,
        status: "OFFLINE" as const,
        lastSeenAt: new Date().toISOString(),
        privacy: "EVERYONE" as const,
        preferredStatus: "ONLINE" as const,
        deviceCount: 0,
        devices: [],
      })),
      heartbeat: vi.fn(async () => undefined),
      getMyPresence: vi.fn(),
      getPresenceForViewer: vi.fn(),
      setStatus: vi.fn(),
      setPrivacy: vi.fn(),
      subscribe: vi.fn(async () => ({
        allowed: true,
        presence: {
          userId: "u1",
          status: "ONLINE",
          lastSeenAt: null,
          privacy: "EVERYONE",
          preferredStatus: "ONLINE",
          deviceCount: null,
          devices: null,
        },
      })),
      startTyping: vi.fn(
        async (
          userId: string,
          conversationId: string,
          exceptSocketId?: string
        ) => {
          eventPublisher.publish({
            name: RealtimeEvents.TYPING_STARTED,
            rooms: [`conversation:${conversationId}`],
            payload: { conversationId, userId },
            exceptSocketId,
          });
          return { published: true };
        }
      ),
      stopTyping: vi.fn(async () => ({ published: true })),
      assertConversationMember: vi.fn(
        async (userId: string, conversationId: string) => {
          if (!memberships.has(`${userId}:${conversationId}`)) {
            const { ForbiddenError } = await import(
              "../../src/common/errors/index.js"
            );
            throw new ForbiddenError("FORBIDDEN");
          }
        }
      ),
      getManyForViewer: vi.fn(),
    };

    server = http.createServer((_req, res) => {
      res.writeHead(200);
      res.end("ok");
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      throw new Error("Failed to bind test server");
    }
    port = addr.port;

    gateway = new SocketGateway({
      httpServer: server,
      config,
      logger: pino({ level: "silent" }),
      redis: createFakeRedis(),
      authService,
      messageRepository,
      presenceService,
      eventPublisher,
      enableRedisAdapter: false,
    });
    await gateway.start();
  });

  afterEach(async () => {
    if (gateway) {
      await gateway.close();
    }
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  function tokenFor(userId: string): string {
    return signAccessToken({ sub: userId, sid: `sess_${userId}` }, config);
  }

  it("rejects unauthenticated connections", async () => {
    await expect(connectClient(port)).rejects.toThrow();
  });

  it("connects with auth.token JWT and joins user room", async () => {
    const socket = await connectClient(port, tokenFor("u1"));
    expect(socket.connected).toBe(true);
    expect(presenceService.markOnline).toHaveBeenCalledWith(
      "u1",
      expect.any(String),
      expect.objectContaining({ deviceType: expect.any(String) })
    );

    const received = waitForEvent(socket, RealtimeEvents.MESSAGE_CREATED);
    eventPublisher.publish({
      name: RealtimeEvents.MESSAGE_CREATED,
      rooms: [`user:u1`],
      payload: { conversationId: "conv_1", messageId: "msg_1" },
    });
    await expect(received).resolves.toMatchObject({ messageId: "msg_1" });
    socket.disconnect();
  });

  it("supports multiple devices for the same user", async () => {
    const a = await connectClient(port, tokenFor("u1"));
    const b = await connectClient(port, tokenFor("u1"));
    expect(gateway.connections.getDeviceCount("u1")).toBe(2);

    const gotA = waitForEvent(a, RealtimeEvents.PRESENCE_ONLINE);
    const gotB = waitForEvent(b, RealtimeEvents.PRESENCE_ONLINE);
    eventPublisher.publish({
      name: RealtimeEvents.PRESENCE_ONLINE,
      rooms: ["user:u1"],
      payload: { userId: "u1", status: "online" },
    });
    await Promise.all([gotA, gotB]);
    a.disconnect();
    b.disconnect();
  });

  it("authorizes conversation join and denies non-members", async () => {
    const member = await connectClient(port, tokenFor("u1"));
    const outsider = await connectClient(port, tokenFor("u2"));

    const ok = await new Promise<{ ok: boolean }>((resolve) => {
      member.emit(
        "conversation:join",
        { conversationId: "conv_1" },
        (ack: { ok: boolean }) => resolve(ack)
      );
    });
    expect(ok.ok).toBe(true);

    const denied = await new Promise<{ ok: boolean; error?: string }>(
      (resolve) => {
        outsider.emit(
          "conversation:join",
          { conversationId: "conv_1" },
          (ack: { ok: boolean; error?: string }) => resolve(ack)
        );
      }
    );
    expect(denied.ok).toBe(false);
    expect(denied.error).toBe("FORBIDDEN");

    member.disconnect();
    outsider.disconnect();
  });

  it("broadcasts typing within conversation room excluding sender", async () => {
    const a = await connectClient(port, tokenFor("u1"));
    memberships.add("u2:conv_1");
    const b = await connectClient(port, tokenFor("u2"));

    await Promise.all([
      new Promise<void>((resolve) => {
        a.emit("conversation:join", { conversationId: "conv_1" }, () =>
          resolve()
        );
      }),
      new Promise<void>((resolve) => {
        b.emit("conversation:join", { conversationId: "conv_1" }, () =>
          resolve()
        );
      }),
    ]);

    const typingPromise = waitForEvent(b, RealtimeEvents.TYPING_STARTED);
    a.emit("typing.start", { conversationId: "conv_1" });
    await expect(typingPromise).resolves.toMatchObject({
      conversationId: "conv_1",
      userId: "u1",
    });

    a.disconnect();
    b.disconnect();
  });

  it("cleans up presence on disconnect", async () => {
    const socket = await connectClient(port, tokenFor("u1"));
    const socketId = socket.id!;
    socket.disconnect();
    await vi.waitFor(() => {
      expect(presenceService.markOffline).toHaveBeenCalledWith("u1", socketId);
    });
    expect(gateway.connections.getDeviceCount("u1")).toBe(0);
  });

  it("reconnects after disconnect", async () => {
    const first = await connectClient(port, tokenFor("u1"));
    first.disconnect();
    await new Promise((r) => setTimeout(r, 50));
    const second = await connectClient(port, tokenFor("u1"));
    expect(second.connected).toBe(true);
    expect(presenceService.markOnline).toHaveBeenCalledTimes(2);
    second.disconnect();
  });

  it("starts without Redis adapter when disabled (distributed optional)", async () => {
    expect(gateway.io).toBeDefined();
    // Adapter off — still publishes in-process via EventPublisher bind.
    const socket = await connectClient(port, tokenFor("u1"));
    const got = waitForEvent(socket, RealtimeEvents.CONVERSATION_UPDATED);
    eventPublisher.publish({
      name: RealtimeEvents.CONVERSATION_UPDATED,
      rooms: ["user:u1"],
      payload: { conversationId: "x" },
    });
    await expect(got).resolves.toMatchObject({ conversationId: "x" });
    socket.disconnect();
  });
});
