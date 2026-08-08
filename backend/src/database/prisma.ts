import { PrismaClient } from "@prisma/client";
import type { Logger } from "pino";
import type { AppConfig } from "@config/index.js";

/**
 * True process-wide Prisma singleton.
 * Independent of NODE_ENV — repeated getPrismaClient() always returns the same instance.
 */
let prismaClient: PrismaClient | null = null;

export function getPrismaClient(config: AppConfig): PrismaClient {
  if (prismaClient) {
    return prismaClient;
  }

  prismaClient = new PrismaClient({
    log:
      config.env === "development"
        ? [{ emit: "event", level: "query" }, "warn", "error"]
        : ["error"],
  });

  return prismaClient;
}

export async function connectPrisma(
  client: PrismaClient,
  logger: Logger
): Promise<void> {
  await client.$connect();
  logger.info("Prisma connected");
}

export async function disconnectPrisma(
  client: PrismaClient,
  logger: Logger
): Promise<void> {
  await client.$disconnect();
  logger.info("Prisma disconnected");
}

/** Test-only: reset singleton between suites. */
export function resetPrismaClientForTests(): void {
  prismaClient = null;
}
