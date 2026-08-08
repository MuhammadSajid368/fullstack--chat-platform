import pino from "pino";
import type { AppConfig } from "@config/index.js";
import { buildPinoRedaction } from "@observability/logging/index.js";

let logger: pino.Logger | null = null;

export function createLogger(config: AppConfig): pino.Logger {
  const instance = pino({
    level: config.logLevel,
    base: {
      service: "chat-backend",
      env: config.env,
      version: config.version,
    },
    redact: buildPinoRedaction(),
    transport:
      config.env === "development"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
  });

  logger = instance;
  return instance;
}

export function getLogger(): pino.Logger {
  if (!logger) {
    throw new Error("Logger not initialized. Call createLogger() during boot.");
  }
  return logger;
}

export function resetLoggerForTests(): void {
  logger = null;
}
