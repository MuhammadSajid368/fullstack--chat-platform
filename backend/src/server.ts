import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Required so Vercel Express detection picks this entry (not a factory module).
import express from "express";
import type { Express } from "express";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import type { Logger } from "pino";
import { loadConfig } from "@config/index.js";
import { createLogger } from "@common/utils/logger.js";
import {
  connectPrisma,
  connectRedis,
  disconnectPrisma,
  disconnectRedis,
  getPrismaClient,
  getRedisClient,
} from "@database/index.js";
import { createContainer } from "@container/index.js";
import { TOKENS } from "@shared/constants/tokens.js";
import { createApp } from "./createApp.js";
import {
  initWebSocketGateway,
  type WebSocketGatewayHandle,
} from "@websocket/index.js";
import {
  initJobScheduler,
  type JobSchedulerHandle,
} from "@jobs/index.js";
import {
  initObservability,
  instrumentBullMQ,
  instrumentPrisma,
  instrumentRedis,
  instrumentSocketIO,
  makeNotificationWorkerCheck,
  makePrismaCheck,
  makeQueueBacklogCheck,
  makeQueueCheck,
  makeRedisCheck,
  makeSocketGatewayCheck,
  type BullMQInstrumentationHandle,
  type ObservabilityHandle,
  type SocketInstrumentationHandle,
} from "@observability/index.js";
import type { QueueHealthProvider } from "@jobs/index.js";
import type { SocketHealthProvider } from "@observability/health/index.js";

// Keep a reference so tree-shakers / detectors see an express import side-effect.
void express;

export type BootstrapOptions = {
  /** When false, skips server.listen (Vercel invokes the default export). Default true. */
  listen?: boolean;
};

export type BootstrappedServer = {
  app: Express;
  server: Server;
  prisma: PrismaClient;
  redis: Redis;
  logger: Logger;
  websocket: WebSocketGatewayHandle;
  jobs: JobSchedulerHandle | null;
  observability: ObservabilityHandle;
  shutdown: (signal?: string) => Promise<void>;
};

let bootPromise: Promise<BootstrappedServer> | null = null;

export async function bootstrap(
  options: BootstrapOptions = {}
): Promise<BootstrappedServer> {
  if (bootPromise) {
    return bootPromise;
  }

  bootPromise = runBootstrap(options).catch((err) => {
    bootPromise = null;
    throw err;
  });
  return bootPromise;
}

async function runBootstrap(
  options: BootstrapOptions
): Promise<BootstrappedServer> {
  const shouldListen = options.listen ?? !process.env.VERCEL;
  const config = loadConfig();
  const logger = createLogger(config);

  const observability = await initObservability(config, logger);

  const rawPrisma = getPrismaClient(config);
  const prisma = instrumentPrisma(rawPrisma, observability.metrics.db, logger);
  const redis = getRedisClient(config, logger);
  instrumentRedis(redis, observability.metrics.redis, logger);

  await connectPrisma(prisma, logger);
  await connectRedis(redis, logger);

  const container = createContainer({
    config,
    logger,
    prisma,
    redis,
    observability,
  });
  const app = createApp({ config, logger, container });
  const server = http.createServer(app);

  observability.health.registerCheck({
    name: "postgres",
    check: makePrismaCheck(prisma),
    critical: true,
    includeIn: ["startup", "readiness"],
  });
  observability.health.registerCheck({
    name: "redis",
    check: makeRedisCheck(redis),
    critical: true,
    includeIn: ["startup", "readiness"],
  });

  const websocket = await initWebSocketGateway(server, container, logger);
  const socketInstrumentation: SocketInstrumentationHandle = instrumentSocketIO({
    io: websocket.io,
    metrics: observability.metrics.socket,
    logger,
  });
  container.registerValue<SocketHealthProvider>(
    TOKENS.SocketHealthProvider,
    socketInstrumentation.provider
  );
  observability.health.registerCheck({
    name: "socket_gateway",
    check: makeSocketGatewayCheck(socketInstrumentation.provider),
    critical: false,
    includeIn: ["readiness"],
  });

  const jobs = await initJobScheduler(container, logger);
  const queueHealthProvider = container.resolve<QueueHealthProvider>(
    TOKENS.QueueHealthProvider
  );
  observability.health.registerCheck({
    name: "bullmq_workers",
    check: makeQueueCheck(queueHealthProvider),
    critical: false,
    includeIn: ["readiness"],
  });
  observability.health.registerCheck({
    name: "notification_workers",
    check: makeNotificationWorkerCheck(queueHealthProvider),
    critical: false,
    includeIn: ["readiness"],
  });
  observability.health.registerCheck({
    name: "queue_backlog",
    check: makeQueueBacklogCheck(queueHealthProvider, 1000),
    critical: false,
    includeIn: ["readiness"],
  });

  let bullmqInstrumentation: BullMQInstrumentationHandle | null = null;
  if (jobs) {
    bullmqInstrumentation = instrumentBullMQ({
      queueManager: jobs.queueManager,
      metrics: observability.metrics.queue,
      logger,
    });
  }

  let shuttingDown = false;

  const shutdown = async (signal = "SIGTERM"): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, "Graceful shutdown started");

    const forceTimer = setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 15_000);
    forceTimer.unref();

    try {
      bullmqInstrumentation?.stop();
    } catch (err) {
      logger.error({ err }, "Error stopping BullMQ instrumentation");
    }

    try {
      if (jobs) {
        await jobs.stop();
      }
    } catch (err) {
      logger.error({ err }, "Error stopping job scheduler");
    }

    try {
      socketInstrumentation.stop();
    } catch (err) {
      logger.error({ err }, "Error stopping socket instrumentation");
    }

    try {
      await websocket.close();
    } catch (err) {
      logger.error({ err }, "Error closing WebSocket gateway");
    }

    if (server.listening) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }

    try {
      await disconnectRedis(redis, logger);
    } catch (err) {
      logger.error({ err }, "Error disconnecting Redis");
    }

    try {
      await disconnectPrisma(prisma, logger);
    } catch (err) {
      logger.error({ err }, "Error disconnecting Prisma");
    }

    try {
      await observability.shutdown();
    } catch (err) {
      logger.error({ err }, "Error shutting down observability");
    }

    logger.info("Graceful shutdown complete");
    clearTimeout(forceTimer);

    if (!config.isTest) {
      process.exit(0);
    }
  };

  if (shouldListen) {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.port, config.host, () => {
        logger.info(
          { host: config.host, port: config.port, prefix: config.apiPrefix },
          "HTTP server listening"
        );
        resolve();
      });
    });

    process.on("SIGTERM", () => {
      void shutdown("SIGTERM");
    });
    process.on("SIGINT", () => {
      void shutdown("SIGINT");
    });

    process.on("unhandledRejection", (reason) => {
      logger.error({ reason }, "Unhandled promise rejection");
    });

    process.on("uncaughtException", (err) => {
      logger.fatal({ err }, "Uncaught exception");
      void shutdown("uncaughtException");
    });
  } else {
    logger.info(
      { prefix: config.apiPrefix },
      "HTTP app ready (serverless / no listen)"
    );
  }

  observability.health.markStartupComplete();

  return {
    app,
    server,
    prisma,
    redis,
    logger,
    websocket,
    jobs,
    observability,
    shutdown,
  };
}

function isExecutedAsMain(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  const current = fileURLToPath(import.meta.url);
  return path.resolve(entry) === path.resolve(current);
}

/**
 * Vercel Express entry: default export must be a function (request handler)
 * or a Node http.Server. Lazy-bootstraps on first request.
 */
export default function vercelHandler(
  req: IncomingMessage,
  res: ServerResponse
): void {
  void bootstrap({ listen: false })
    .then(({ app: expressApp }) => {
      expressApp(req, res);
    })
    .catch((err) => {
      console.error("Failed to bootstrap backend", err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "Server failed to start" }));
      }
    });
}

if (isExecutedAsMain()) {
  void bootstrap({ listen: true }).catch((err) => {
    console.error("Failed to start server", err);
    process.exit(1);
  });
}
