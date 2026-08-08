import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  API_PREFIX: z.string().default("/api"),

  DATABASE_URL: z.string().url().or(z.string().startsWith("postgresql://")),

  REDIS_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  JWT_ISSUER: z.string().min(1).default("chat-api"),
  JWT_AUDIENCE: z.string().min(1).default("chat-web"),
  COOKIE_NAME: z.string().default("chat_session"),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).default("lax"),

  CORS_ORIGIN: z.string().min(1),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  // Observability
  METRICS_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  METRICS_ROUTE: z.string().default("/metrics"),
  /** When set, GET /metrics requires Authorization: Bearer <token> or X-Metrics-Token. */
  METRICS_TOKEN: z.string().min(8).optional(),
  METRICS_DEFAULT_LABELS: z.string().optional(),
  OTEL_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  OTEL_SERVICE_NAME: z.string().default("chat-backend"),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(),
  OTEL_TRACES_SAMPLER_RATIO: z.coerce
    .number()
    .min(0)
    .max(1)
    .default(0.1),
  OBSERVABILITY_STARTUP_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60_000),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates process.env once at boot.
 * Throws ZodError if required configuration is missing or invalid.
 */
export function validateEnv(
  raw: NodeJS.ProcessEnv = process.env
): Env {
  return envSchema.parse(raw);
}
