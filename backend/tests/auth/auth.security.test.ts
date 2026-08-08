import { describe, expect, it, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { loadConfig, resetConfigForTests } from "../../src/config/index.js";
import { AuthService } from "../../src/modules/auth/service/AuthService.js";
import {
  BCRYPT_ROUNDS,
  getDummyPasswordHash,
  hashPassword,
  verifyPassword,
} from "../../src/modules/auth/utils/password.js";
import {
  hashToken,
  signAccessToken,
  verifyAccessToken,
} from "../../src/modules/auth/utils/tokens.js";
import { authCookiePath } from "../../src/modules/auth/utils/cookies.js";
import { UnauthorizedError } from "../../src/common/errors/index.js";
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
  JWT_ISSUER: "chat-api",
  JWT_AUDIENCE: "chat-web",
  COOKIE_NAME: "chat_session",
  COOKIE_SECURE: "false",
  COOKIE_SAME_SITE: "lax",
  CORS_ORIGIN: "http://localhost:5173",
  LOG_LEVEL: "silent",
} as NodeJS.ProcessEnv;

describe("Auth security hardening", () => {
  let repo: InMemoryAuthRepository;
  let service: AuthService;

  beforeEach(async () => {
    resetConfigForTests();
    const config = loadConfig(testEnv);
    repo = new InMemoryAuthRepository();
    service = new AuthService(repo, config);
    const passwordHash = await hashPassword("demo1234", true);
    repo.seedUser({
      id: "usr_1",
      email: "demo@chat.app",
      name: "Demo User",
      avatarUrl: null,
      passwordHash,
      deletedAt: null,
    });
  });

  it("compare-and-set rotation: only one concurrent refresh succeeds", async () => {
    const login = await service.login(
      { email: "demo@chat.app", password: "demo1234" },
      {}
    );

    const results = await Promise.allSettled([
      service.refresh(login.refreshToken, { requestId: "a" }),
      service.refresh(login.refreshToken, { requestId: "b" }),
      service.refresh(login.refreshToken, { requestId: "c" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(2);

    for (const r of rejected) {
      expect(r.status).toBe("rejected");
      if (r.status === "rejected") {
        expect(r.reason).toBeInstanceOf(UnauthorizedError);
      }
    }

    const winner = (fulfilled[0] as PromiseFulfilledResult<{
      refreshToken: string;
      sessionId: string;
    }>).value;

    const active = [...repo.refreshTokens.values()].filter(
      (t) => t.revokedAt == null && t.sessionId === winner.sessionId
    );
    expect(active).toHaveLength(1);
    expect(active[0]?.tokenHash).toBe(
      hashToken(winner.refreshToken, loadConfig(testEnv).jwt.refreshSecret)
    );

    // Winner's family was not burned by losers
    await expect(
      service.me({ refreshToken: winner.refreshToken })
    ).resolves.toMatchObject({ id: "usr_1" });
  });

  it("replay of rotated refresh token burns the family", async () => {
    const login = await service.login(
      { email: "demo@chat.app", password: "demo1234" },
      {}
    );

    const rotated = await service.refresh(login.refreshToken, {});

    await expect(
      service.refresh(login.refreshToken, {})
    ).rejects.toBeInstanceOf(UnauthorizedError);

    expect(
      repo.auditLogs.some((a) => a.action === "REFRESH_TOKEN_REPLAY")
    ).toBe(true);

    await expect(
      service.me({ refreshToken: rotated.refreshToken })
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("repository CAS returns null when previous token already revoked", async () => {
    const login = await service.login(
      { email: "demo@chat.app", password: "demo1234" },
      {}
    );
    const config = loadConfig(testEnv);
    const tokenHash = hashToken(login.refreshToken, config.jwt.refreshSecret);
    const existing = repo.refreshTokens.get(tokenHash)!;

    const first = await repo.rotateRefreshToken({
      previousTokenId: existing.id,
      familyId: existing.familyId,
      sessionId: login.sessionId,
      userId: "usr_1",
      newTokenHash: hashToken("new-one", config.jwt.refreshSecret),
      newExpiresAt: new Date(Date.now() + 60_000),
      sessionExpiresAt: new Date(Date.now() + 60_000),
      audit: {
        action: "REFRESH_TOKEN_ROTATE",
        entityType: "RefreshToken",
      },
    });
    expect(first).not.toBeNull();

    const second = await repo.rotateRefreshToken({
      previousTokenId: existing.id,
      familyId: existing.familyId,
      sessionId: login.sessionId,
      userId: "usr_1",
      newTokenHash: hashToken("new-two", config.jwt.refreshSecret),
      newExpiresAt: new Date(Date.now() + 60_000),
      sessionExpiresAt: new Date(Date.now() + 60_000),
      audit: {
        action: "REFRESH_TOKEN_ROTATE",
        entityType: "RefreshToken",
      },
    });
    expect(second).toBeNull();

    const active = [...repo.refreshTokens.values()].filter(
      (t) => t.revokedAt == null
    );
    expect(active).toHaveLength(1);
  });

  it("dummy password hash uses production bcrypt cost factor", async () => {
    const dummy = getDummyPasswordHash();
    expect(dummy.startsWith(`$2b$${String(BCRYPT_ROUNDS).padStart(2, "0")}$`)).toBe(
      true
    );

    const prodHash = await hashPassword("same-cost-check", false);
    expect(prodHash.startsWith(`$2b$${String(BCRYPT_ROUNDS).padStart(2, "0")}$`)).toBe(
      true
    );

    expect(await verifyPassword("x", null)).toBe(false);
    expect(await verifyPassword("x", undefined)).toBe(false);
  });

  it("rejects access tokens with wrong issuer or audience", () => {
    const config = loadConfig(testEnv);

    const wrongIss = jwt.sign(
      { sub: "usr_1", sid: "sess_1", jti: "j1", typ: "access" },
      config.jwt.accessSecret,
      {
        algorithm: "HS256",
        expiresIn: "15m",
        issuer: "other-api",
        audience: config.jwt.audience,
      }
    );
    expect(() => verifyAccessToken(wrongIss, config)).toThrow(UnauthorizedError);

    const wrongAud = jwt.sign(
      { sub: "usr_1", sid: "sess_1", jti: "j2", typ: "access" },
      config.jwt.accessSecret,
      {
        algorithm: "HS256",
        expiresIn: "15m",
        issuer: config.jwt.issuer,
        audience: "other-aud",
      }
    );
    expect(() => verifyAccessToken(wrongAud, config)).toThrow(UnauthorizedError);

    const valid = signAccessToken({ sub: "usr_1", sid: "sess_1" }, config);
    const claims = verifyAccessToken(valid, config);
    expect(claims.sub).toBe("usr_1");
    expect(claims.sid).toBe("sess_1");
  });

  it("rejects non-HS256 algorithms", () => {
    const config = loadConfig(testEnv);
    // Craft a token header claiming none / wrong alg — library must refuse
    const unsigned = [
      Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
      Buffer.from(
        JSON.stringify({
          sub: "usr_1",
          sid: "sess_1",
          jti: "j3",
          typ: "access",
          iss: config.jwt.issuer,
          aud: config.jwt.audience,
        })
      ).toString("base64url"),
      "",
    ].join(".");

    expect(() => verifyAccessToken(unsigned, config)).toThrow(UnauthorizedError);
  });

  it("scopes auth cookie path to / so APIs and sockets receive cookies", () => {
    const config = loadConfig(testEnv);
    expect(authCookiePath(config)).toBe("/");
  });

  it("GET /me style restore does not rotate refresh token", async () => {
    const login = await service.login(
      { email: "demo@chat.app", password: "demo1234" },
      {}
    );

    await service.me({ refreshToken: login.refreshToken });
    await service.me({ refreshToken: login.refreshToken });

    expect(
      repo.auditLogs.filter((a) => a.action === "REFRESH_TOKEN_ROTATE")
    ).toHaveLength(0);

    const still = await service.refresh(login.refreshToken, {});
    expect(still.refreshToken).not.toBe(login.refreshToken);
  });
});
