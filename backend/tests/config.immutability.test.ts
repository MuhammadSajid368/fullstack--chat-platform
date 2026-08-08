import { describe, expect, it, afterEach } from "vitest";
import { deepFreeze, loadConfig, resetConfigForTests } from "../src/config/index.js";

const testEnv = {
  NODE_ENV: "test",
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

describe("AppConfig immutability", () => {
  afterEach(() => {
    resetConfigForTests();
  });

  it("deepFreeze prevents nested mutation", () => {
    const obj = deepFreeze({
      a: 1,
      nested: { b: 2 },
    });

    expect(Object.isFrozen(obj)).toBe(true);
    expect(Object.isFrozen(obj.nested)).toBe(true);

    expect(() => {
      (obj as { a: number }).a = 99;
    }).toThrow();

    expect(() => {
      (obj.nested as { b: number }).b = 99;
    }).toThrow();
  });

  it("loadConfig returns frozen jwt/cookie/rateLimit trees", () => {
    const config = loadConfig(testEnv);

    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.jwt)).toBe(true);
    expect(Object.isFrozen(config.cookie)).toBe(true);
    expect(Object.isFrozen(config.rateLimit)).toBe(true);
    expect(config.version).toBeTypeOf("string");
  });
});
