import type { Redis } from "ioredis";
import { RedisStore } from "rate-limit-redis";
import type { Store } from "express-rate-limit";

/**
 * Creates an express-rate-limit store backed by Redis (multi-instance safe).
 * Returns null when Redis is unavailable so callers can fall back to memory.
 */
export function createRedisRateLimitStore(
  redis: Redis | null | undefined,
  prefix: string
): Store | null {
  if (!redis) {
    return null;
  }
  const status = redis.status;
  if (status === "end" || status === "close") {
    return null;
  }

  return new RedisStore({
    prefix,
    sendCommand: (...args: string[]) =>
      redis.call(args[0]!, ...args.slice(1)) as Promise<boolean | number | string>,
  });
}
