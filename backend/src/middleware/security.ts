import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import type { Express } from "express";
import type { AppConfig } from "@config/index.js";

export function applySecurityMiddleware(
  app: Express,
  config: AppConfig
): void {
  app.disable("x-powered-by");

  app.use(
    helmet({
      contentSecurityPolicy: config.isProduction ? undefined : false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  app.use(compression());

  app.use(cookieParser());

  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Accept", "X-Request-Id", "Authorization"],
      exposedHeaders: ["X-Request-Id", "X-Response-Time"],
    })
  );
}
