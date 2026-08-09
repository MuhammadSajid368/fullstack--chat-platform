import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateEnv, type Env } from "./env.js";

type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};

export type AppConfig = DeepReadonly<{
  env: Env["NODE_ENV"];
  isProduction: boolean;
  isTest: boolean;
  host: string;
  port: number;
  apiPrefix: string;
  version: string;
  databaseUrl: string;
  redisUrl: string;
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessExpiresIn: string;
    refreshExpiresIn: string;
    issuer: string;
    audience: string;
  };
  cookie: {
    name: string;
    secure: boolean;
    sameSite: "strict" | "lax" | "none";
  };
  corsOrigin: string | string[];
  rateLimit: {
    windowMs: number;
    max: number;
  };
  logLevel: Env["LOG_LEVEL"];
  observability: {
    metricsEnabled: boolean;
    metricsRoute: string;
    metricsToken: string | null;
    defaultLabels: Record<string, string>;
    otelEnabled: boolean;
    otelServiceName: string;
    otelExporterUrl: string | null;
    otelExporterHeaders: Record<string, string>;
    otelSamplerRatio: number;
    startupTimeoutMs: number;
  };
}>;

function parseKeyValueList(input: string | undefined): Record<string, string> {
  if (!input) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const entry of input.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key.length > 0) {
      out[key] = value;
    }
  }
  return out;
}

/** One origin string, or a list when CORS_ORIGIN is comma-separated. */
function parseCorsOrigins(raw: string): string | string[] {
  const origins = raw
    .split(",")
    .map((part) => part.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  if (origins.length === 0) {
    return raw.replace(/\/+$/, "");
  }
  if (origins.length === 1) {
    return origins[0]!;
  }
  return origins;
}

let cached: AppConfig | null = null;

/**
 * Recursively freezes an object tree so runtime mutation throws in strict mode
 * and is a no-op otherwise — config must be treated as immutable after load.
 */
export function deepFreeze<T extends object>(value: T): DeepReadonly<T> {
  Reflect.ownKeys(value).forEach((key) => {
    const child = Reflect.get(value, key) as unknown;
    if (child && typeof child === "object" && !Object.isFrozen(child)) {
      deepFreeze(child);
    }
  });
  return Object.freeze(value) as DeepReadonly<T>;
}

function readPackageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(here, "../../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Loads and caches typed, deeply-frozen configuration from validated env vars.
 */
export function loadConfig(raw?: NodeJS.ProcessEnv): AppConfig {
  if (cached && !raw) {
    return cached;
  }

  const env = validateEnv(raw ?? process.env);

  if (env.NODE_ENV === "production" && env.COOKIE_SECURE !== true) {
    throw new Error(
      "COOKIE_SECURE must be true when NODE_ENV=production (refusing to boot with insecure session cookies)."
    );
  }

  if (env.NODE_ENV === "production" && !env.METRICS_TOKEN) {
    throw new Error(
      "METRICS_TOKEN must be set when NODE_ENV=production (protects /metrics and /health/queues)."
    );
  }

  const config = deepFreeze({
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === "production",
    isTest: env.NODE_ENV === "test",
    host: env.HOST,
    port: env.PORT,
    apiPrefix: env.API_PREFIX,
    version: readPackageVersion(),
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
      refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    },
    cookie: {
      name: env.COOKIE_NAME,
      secure: env.COOKIE_SECURE,
      sameSite: env.COOKIE_SAME_SITE,
    },
    corsOrigin: parseCorsOrigins(env.CORS_ORIGIN),
    rateLimit: {
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
    },
    logLevel: env.LOG_LEVEL,
    observability: {
      metricsEnabled: env.METRICS_ENABLED,
      metricsRoute: env.METRICS_ROUTE,
      metricsToken: env.METRICS_TOKEN ?? null,
      defaultLabels: parseKeyValueList(env.METRICS_DEFAULT_LABELS),
      otelEnabled:
        env.OTEL_ENABLED &&
        typeof env.OTEL_EXPORTER_OTLP_ENDPOINT === "string" &&
        env.OTEL_EXPORTER_OTLP_ENDPOINT.length > 0,
      otelServiceName: env.OTEL_SERVICE_NAME,
      otelExporterUrl: env.OTEL_EXPORTER_OTLP_ENDPOINT ?? null,
      otelExporterHeaders: parseKeyValueList(env.OTEL_EXPORTER_OTLP_HEADERS),
      otelSamplerRatio: env.OTEL_TRACES_SAMPLER_RATIO,
      startupTimeoutMs: env.OBSERVABILITY_STARTUP_TIMEOUT_MS,
    },
  });

  if (!raw) {
    cached = config;
  }

  return config;
}

/** Test helper: clear cached config between suites. */
export function resetConfigForTests(): void {
  cached = null;
}

export type { Env };
