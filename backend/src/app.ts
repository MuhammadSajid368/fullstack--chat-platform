import express, { type Express } from "express";
import type { Logger } from "pino";
import type { Redis } from "ioredis";
import type { AppConfig } from "@config/index.js";
import type { Container } from "@container/container.js";
import { TOKENS } from "@shared/constants/tokens.js";
import type { IHealthService } from "@shared/interfaces/IHealthService.js";
// Side-effect: ensure Express Request augmentation is in the typecheck graph (Vercel).
import "@common/types/express.js";
import {
  applySecurityMiddleware,
  createErrorHandler,
  createRateLimiter,
  createRequestLogger,
  notFoundHandler,
  registerOperationalProbePath,
  requestIdMiddleware,
  responseTimeMiddleware,
} from "@middleware/index.js";
import { createApiRouter } from "@routes/index.js";
import { createHealthRoutes } from "@routes/health.routes.js";
import type { QueueHealthProvider } from "@jobs/index.js";
import type { MetricsFacade } from "@observability/metrics/index.js";
import type { HealthMonitor } from "@observability/health/index.js";
import {
  createCorrelationMiddleware,
  createMonitoringMiddleware,
  createMetricsRouter,
  createObservabilityHealthRoutes,
} from "@observability/middleware/index.js";

export type CreateAppOptions = {
  config: AppConfig;
  logger: Logger;
  container: Container;
};

/**
 * Builds the Express application (no listen).
 *
 * Middleware order:
 * 1. Security
 * 2. Observability (request id, response time, request logging)
 * 3. Operational probes (/health, /ready) — before rate limiting
 * 4. Rate limiter (also skips probes)
 * 5. Body parsers + API routes
 * 6. 404 + global error handler
 *
 * Future auth middleware MUST be mounted after probes and must skip
 * paths matched by skipOperationalProbes().
 */
export function createApp(options: CreateAppOptions): Express {
  const { config, logger, container } = options;
  const app = express();

  app.set("trust proxy", 1);

  applySecurityMiddleware(app, config);

  const metrics = container.resolve<MetricsFacade>(TOKENS.MetricsRegistry);
  const healthMonitor = container.resolve<HealthMonitor>(TOKENS.HealthMonitor);
  registerOperationalProbePath(config.observability.metricsRoute);

  app.use(requestIdMiddleware);
  app.use(responseTimeMiddleware);
  app.use(createRequestLogger(logger));
  app.use(createCorrelationMiddleware({ logger }));

  if (config.observability.metricsEnabled) {
    app.use(
      createMetricsRouter(
        metrics,
        config.observability.metricsRoute,
        config.observability.metricsToken
      )
    );
  }

  const healthService = container.resolve<IHealthService>(TOKENS.HealthService);
  const redis = container.resolve<Redis>(TOKENS.Redis);
  app.use(
    createHealthRoutes(
      healthService,
      {
        getHealth: () =>
          container
            .resolve<QueueHealthProvider>(TOKENS.QueueHealthProvider)
            .getHealth(),
      },
      config
    )
  );
  app.use(createObservabilityHealthRoutes(healthMonitor));

  app.use(createMonitoringMiddleware({ metrics }));

  app.use(createRateLimiter(config, redis));

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use(config.apiPrefix, createApiRouter(container));

  app.use(notFoundHandler);
  app.use(createErrorHandler(config, logger));

  return app;
}
