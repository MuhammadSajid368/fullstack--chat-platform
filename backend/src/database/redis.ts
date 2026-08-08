import { Redis } from "ioredis";
import type { Logger } from "pino";
import type { AppConfig } from "@config/index.js";

/**
 * True process-wide Redis singleton.
 * Independent of NODE_ENV — repeated getRedisClient() always returns the same instance.
 */
let redisClient: Redis | null = null;

export function getRedisClient(config: AppConfig, logger: Logger): Redis {
  if (redisClient) {
    return redisClient;
  }

  redisClient = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  redisClient.on("error", (err: Error) => {
    logger.error({ err }, "Redis client error");
  });

  return redisClient;
}

export async function connectRedis(
  client: Redis,
  logger: Logger
): Promise<void> {
  if (client.status === "wait") {
    await client.connect();
  }
  logger.info("Redis connected");
}

export async function disconnectRedis(
  client: Redis,
  logger: Logger
): Promise<void> {
  await client.quit();
  logger.info("Redis disconnected");
}

/** Test-only: reset singleton between suites. */
export function resetRedisClientForTests(): void {
  redisClient = null;
}
