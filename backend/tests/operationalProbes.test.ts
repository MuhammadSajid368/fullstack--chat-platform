import { afterEach, describe, expect, it } from "vitest";
import {
  isOperationalProbePath,
  skipOperationalProbes,
} from "../src/middleware/operationalProbes.js";

describe("operational probes", () => {
  it("identifies /health, /ready, and /health/queues", () => {
    expect(isOperationalProbePath("/health")).toBe(true);
    expect(isOperationalProbePath("/ready")).toBe(true);
    expect(isOperationalProbePath("/health/queues")).toBe(true);
    expect(isOperationalProbePath("/api/health")).toBe(false);
    expect(isOperationalProbePath("/auth/login")).toBe(false);
  });

  it("skipOperationalProbes matches Express req.path", () => {
    expect(skipOperationalProbes({ path: "/health" })).toBe(true);
    expect(skipOperationalProbes({ path: "/ready" })).toBe(true);
    expect(skipOperationalProbes({ path: "/api/conversations" })).toBe(false);
  });
});

describe("singletons", () => {
  afterEach(async () => {
    const { resetPrismaClientForTests, resetRedisClientForTests } =
      await import("../src/database/index.js");
    resetPrismaClientForTests();
    resetRedisClientForTests();
  });

  it("getPrismaClient always returns the same instance", async () => {
    const { getPrismaClient } = await import("../src/database/index.js");
    const { loadConfig, resetConfigForTests } = await import(
      "../src/config/index.js"
    );
    resetConfigForTests();

    const config = loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/chat_test",
      REDIS_URL: "redis://localhost:6379/15",
      JWT_ACCESS_SECRET: "test-access-secret-min-32-characters!!",
      JWT_REFRESH_SECRET: "test-refresh-secret-min-32-characters!",
      CORS_ORIGIN: "http://localhost:5173",
      LOG_LEVEL: "silent",
    } as NodeJS.ProcessEnv);

    const a = getPrismaClient(config);
    const b = getPrismaClient(config);
    expect(a).toBe(b);
  });

  it("getRedisClient always returns the same instance", async () => {
    const { getRedisClient } = await import("../src/database/index.js");
    const { loadConfig, resetConfigForTests } = await import(
      "../src/config/index.js"
    );
    const { createLogger, resetLoggerForTests } = await import(
      "../src/common/utils/logger.js"
    );
    resetConfigForTests();
    resetLoggerForTests();

    const config = loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/chat_test",
      REDIS_URL: "redis://127.0.0.1:6379/15",
      JWT_ACCESS_SECRET: "test-access-secret-min-32-characters!!",
      JWT_REFRESH_SECRET: "test-refresh-secret-min-32-characters!",
      CORS_ORIGIN: "http://localhost:5173",
      LOG_LEVEL: "silent",
    } as NodeJS.ProcessEnv);

    const logger = createLogger(config);
    const a = getRedisClient(config, logger);
    const b = getRedisClient(config, logger);
    expect(a).toBe(b);
    a.disconnect();
  });
});
