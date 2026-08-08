import type { Redis } from "ioredis";
import type { Logger } from "pino";

const KEY_PREFIX = "jobs:idempotency:";

/**
 * Redis-backed idempotency store — duplicate job runs become no-ops.
 */
export class IdempotencyStore {
  constructor(
    private readonly redis: Redis,
    private readonly logger: Logger,
    private readonly ttlSec: number
  ) {}

  async claim(key: string): Promise<boolean> {
    const redisKey = `${KEY_PREFIX}${key}`;
    const result = await this.redis.set(
      redisKey,
      "1",
      "EX",
      this.ttlSec,
      "NX"
    );
    const claimed = result === "OK";
    if (!claimed) {
      this.logger.debug({ key }, "Idempotency hit — skipping duplicate job");
    }
    return claimed;
  }

  async release(key: string): Promise<void> {
    await this.redis.del(`${KEY_PREFIX}${key}`);
  }

  async has(key: string): Promise<boolean> {
    const exists = await this.redis.exists(`${KEY_PREFIX}${key}`);
    return exists === 1;
  }
}
