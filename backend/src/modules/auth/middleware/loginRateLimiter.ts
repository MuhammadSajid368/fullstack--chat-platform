import rateLimit from "express-rate-limit";
import type { Redis } from "ioredis";
import type { AppConfig } from "@config/index.js";
import { ErrorCode } from "@common/errors/index.js";
import { createRedisRateLimitStore } from "@middleware/redisRateLimitStore.js";

/**
 * Stricter limiter for credential endpoints (brute-force mitigation).
 * Independent of the global API rate limiter. Uses Redis when available
 * so limits apply across all backend instances.
 */
export function createLoginRateLimiter(
  config: AppConfig,
  redis?: Redis | null
) {
  const windowMs = Math.max(config.rateLimit.windowMs, 60_000);
  const max = Math.min(20, Math.max(5, Math.floor(config.rateLimit.max / 5)));
  const store = createRedisRateLimitStore(redis, "rl:auth:");

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    ...(store ? { store } : {}),
    message: {
      error: {
        code: ErrorCode.RATE_LIMITED,
        message: "Too many login attempts. Please try again later.",
        retryable: true,
      },
    },
  });
}
