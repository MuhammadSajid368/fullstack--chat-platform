import { describe, expect, it, beforeEach } from "vitest";
import { loadConfig, resetConfigForTests } from "../../src/config/index.js";
import { AuthService } from "../../src/modules/auth/service/AuthService.js";
import { hashPassword } from "../../src/modules/auth/utils/password.js";
import { hashToken, signAccessToken } from "../../src/modules/auth/utils/tokens.js";
import { UnauthorizedError, ConflictError } from "../../src/common/errors/index.js";
import { InMemoryAuthRepository } from "./InMemoryAuthRepository.js";
import { verifyPassword } from "../../src/modules/auth/utils/password.js";

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
} as NodeJS.ProcessEnv;

describe("AuthService", () => {
  let repo: InMemoryAuthRepository;
  let service: AuthService;
  let passwordHash: string;

  beforeEach(async () => {
    resetConfigForTests();
    const config = loadConfig(testEnv);
    repo = new InMemoryAuthRepository();
    service = new AuthService(repo, config);
    passwordHash = await hashPassword("demo1234", true);
    repo.seedUser({
      id: "usr_1",
      email: "demo@chat.app",
      name: "Demo User",
      avatarUrl: null,
      passwordHash,
      deletedAt: null,
    });
  });

  it("successful login creates session, refresh token, and audit log", async () => {
    const result = await service.login(
      { email: "demo@chat.app", password: "demo1234" },
      { ipAddress: "127.0.0.1", userAgent: "vitest", requestId: "req_1" }
    );

    expect(result.user).toEqual({
      id: "usr_1",
      email: "demo@chat.app",
      name: "Demo User",
      avatarUrl: null,
    });
    expect(result.accessToken).toBeTypeOf("string");
    expect(result.refreshToken).toBeTypeOf("string");
    expect(result.sessionId).toBeTruthy();
    expect(repo.sessions.size).toBe(1);
    expect(repo.refreshTokens.size).toBe(1);
    expect(repo.auditLogs.some((a) => a.action === "USER_LOGIN")).toBe(true);
  });

  it("rejects invalid password", async () => {
    await expect(
      service.login(
        { email: "demo@chat.app", password: "wrong-password" },
        {}
      )
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects unknown user", async () => {
    await expect(
      service.login(
        { email: "nobody@chat.app", password: "demo1234" },
        {}
      )
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("restores session via refresh cookie (me)", async () => {
    const login = await service.login(
      { email: "demo@chat.app", password: "demo1234" },
      {}
    );

    const user = await service.me({ refreshToken: login.refreshToken });
    expect(user.id).toBe("usr_1");
  });

  it("logout revokes current session only", async () => {
    const first = await service.login(
      { email: "demo@chat.app", password: "demo1234" },
      {}
    );
    const second = await service.login(
      { email: "demo@chat.app", password: "demo1234" },
      {}
    );

    await service.logout({ refreshToken: first.refreshToken }, {});

    await expect(
      service.me({ refreshToken: first.refreshToken })
    ).rejects.toBeInstanceOf(UnauthorizedError);

    const stillActive = await service.me({ refreshToken: second.refreshToken });
    expect(stillActive.id).toBe("usr_1");
  });

  it("rotates refresh token and rejects the previous token as replay", async () => {
    const login = await service.login(
      { email: "demo@chat.app", password: "demo1234" },
      {}
    );

    const rotated = await service.refresh(login.refreshToken, {
      requestId: "req_refresh",
    });

    expect(rotated.refreshToken).not.toBe(login.refreshToken);
    expect(rotated.accessToken).not.toBe(login.accessToken);

    const me = await service.me({ refreshToken: rotated.refreshToken });
    expect(me.id).toBe("usr_1");

    await expect(
      service.refresh(login.refreshToken, {})
    ).rejects.toBeInstanceOf(UnauthorizedError);

    // Family burned after replay — new token also dead
    await expect(
      service.me({ refreshToken: rotated.refreshToken })
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects revoked refresh tokens", async () => {
    const login = await service.login(
      { email: "demo@chat.app", password: "demo1234" },
      {}
    );
    await service.logout({ refreshToken: login.refreshToken }, {});

    await expect(
      service.refresh(login.refreshToken, {})
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects expired refresh tokens", async () => {
    const login = await service.login(
      { email: "demo@chat.app", password: "demo1234" },
      {}
    );
    const config = loadConfig(testEnv);
    const tokenHash = hashToken(
      login.refreshToken,
      config.jwt.refreshSecret
    );
    const stored = repo.refreshTokens.get(tokenHash);
    expect(stored).toBeTruthy();
    stored!.expiresAt = new Date(Date.now() - 1_000);

    await expect(
      service.refresh(login.refreshToken, {})
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects expired sessions", async () => {
    const login = await service.login(
      { email: "demo@chat.app", password: "demo1234" },
      {}
    );
    const session = repo.sessions.get(login.sessionId);
    expect(session).toBeTruthy();
    session!.expiresAt = new Date(Date.now() - 1_000);

    await expect(
      service.me({ refreshToken: login.refreshToken })
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects expired access tokens", async () => {
    resetConfigForTests();
    const shortLived = loadConfig({
      ...testEnv,
      JWT_ACCESS_EXPIRES_IN: "1ms",
    });
    service = new AuthService(repo, shortLived);

    const login = await service.login(
      { email: "demo@chat.app", password: "demo1234" },
      {}
    );

    await new Promise((r) => setTimeout(r, 5));

    await expect(
      service.me({ accessToken: login.accessToken })
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects revoked sessions when using access token", async () => {
    const login = await service.login(
      { email: "demo@chat.app", password: "demo1234" },
      {}
    );
    const session = repo.sessions.get(login.sessionId)!;
    session.revokedAt = new Date();

    await expect(
      service.me({ accessToken: login.accessToken })
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("never returns password hashes on login", async () => {
    const result = await service.login(
      { email: "demo@chat.app", password: "demo1234" },
      {}
    );
    expect(JSON.stringify(result.user)).not.toContain(passwordHash);
    expect(result.user).not.toHaveProperty("passwordHash");
  });

  it("issues access tokens bound to the session id", async () => {
    await service.login(
      { email: "demo@chat.app", password: "demo1234" },
      {}
    );
    const config = loadConfig(testEnv);
    const forged = signAccessToken(
      { sub: "usr_1", sid: "other-session" },
      config
    );
    await expect(service.me({ accessToken: forged })).rejects.toBeInstanceOf(
      UnauthorizedError
    );
  });

  it("register creates user, hashes password, session, and USER_REGISTER audit", async () => {
    const result = await service.register(
      {
        name: "Jane Doe",
        email: "Jane@Chat.App",
        password: "StrongPassword123!",
      },
      { ipAddress: "127.0.0.1", userAgent: "vitest", requestId: "req_reg" }
    );

    expect(result.user).toEqual({
      id: expect.any(String),
      email: "jane@chat.app",
      name: "Jane Doe",
      avatarUrl: null,
    });
    expect(result.user).not.toHaveProperty("passwordHash");
    expect(result.accessToken).toBeTypeOf("string");
    expect(result.refreshToken).toBeTypeOf("string");
    expect(repo.sessions.size).toBe(1);
    expect(repo.refreshTokens.size).toBe(1);
    expect(repo.auditLogs.some((a) => a.action === "USER_REGISTER")).toBe(
      true
    );

    const stored = [...repo.users.values()].find(
      (u) => u.email === "jane@chat.app"
    );
    expect(stored?.passwordHash).toBeTruthy();
    expect(stored?.passwordHash).not.toBe("StrongPassword123!");
    expect(
      await verifyPassword("StrongPassword123!", stored!.passwordHash)
    ).toBe(true);

    const me = await service.me({ refreshToken: result.refreshToken });
    expect(me.id).toBe(result.user.id);
  });

  it("register rejects duplicate email including suspended accounts", async () => {
    await expect(
      service.register(
        {
          name: "Dup",
          email: "demo@chat.app",
          password: "StrongPassword123!",
        },
        {}
      )
    ).rejects.toBeInstanceOf(ConflictError);

    repo.markEmailSuspended("suspended@chat.app");
    await expect(
      service.register(
        {
          name: "Sus",
          email: "suspended@chat.app",
          password: "StrongPassword123!",
        },
        {}
      )
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("register concurrent duplicate emails: only one succeeds", async () => {
    const payload = {
      name: "Race",
      email: "race@chat.app",
      password: "StrongPassword123!",
    };

    const outcomes = await Promise.allSettled([
      service.register(payload, {}),
      service.register(payload, {}),
      service.register(payload, {}),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
    const rejected = outcomes.filter((o) => o.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(2);
    for (const r of rejected) {
      expect(r.status).toBe("rejected");
      if (r.status === "rejected") {
        expect(r.reason).toBeInstanceOf(ConflictError);
      }
    }

    const users = [...repo.users.values()].filter(
      (u) => u.email === "race@chat.app"
    );
    expect(users).toHaveLength(1);
  });
});
