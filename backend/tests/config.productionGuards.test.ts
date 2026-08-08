import { describe, expect, it, afterEach } from "vitest";
import { loadConfig, resetConfigForTests } from "../src/config/index.js";

const baseEnv = {
  PORT: "3099",
  HOST: "127.0.0.1",
  API_PREFIX: "/api",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/chat_test",
  REDIS_URL: "redis://localhost:6379/15",
  JWT_ACCESS_SECRET: "test-access-secret-min-32-characters!!",
  JWT_REFRESH_SECRET: "test-refresh-secret-min-32-characters!",
  CORS_ORIGIN: "http://localhost:5173",
  LOG_LEVEL: "silent",
} as NodeJS.ProcessEnv;

describe("production boot guards", () => {
  afterEach(() => {
    resetConfigForTests();
  });

  it("refuses production boot without METRICS_TOKEN", () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        NODE_ENV: "production",
        COOKIE_SECURE: "true",
      })
    ).toThrow(/METRICS_TOKEN/);
  });

  it("allows production boot with METRICS_TOKEN and COOKIE_SECURE", () => {
    const config = loadConfig({
      ...baseEnv,
      NODE_ENV: "production",
      COOKIE_SECURE: "true",
      METRICS_TOKEN: "metrics-secret-token",
    });
    expect(config.observability.metricsToken).toBe("metrics-secret-token");
  });
});
