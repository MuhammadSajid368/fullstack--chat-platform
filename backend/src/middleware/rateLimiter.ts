import rateLimit from "express-rate-limit";
import type { Request } from "express";
import type { Redis } from "ioredis";
import type { AppConfig } from "@config/index.js";
import { ErrorCode } from "@common/errors/index.js";
import { skipOperationalProbes } from "./operationalProbes.js";
import { createRedisRateLimitStore } from "./redisRateLimitStore.js";

/**
 * Best-effort subject from JWT (no signature check) — used only to bucket
 * rate limits per user so shared IPs / multi-browser local testing don't collide.
 */
function decodeJwtSub(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2 || !parts[1]) {
      return null;
    }
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(json) as { sub?: unknown };
    return typeof payload.sub === "string" && payload.sub.length > 0
      ? payload.sub
      : null;
  } catch {
    return null;
  }
}

function clientKey(req: Request, cookieBaseName: string): string {
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }

  const accessCookie = req.cookies?.[`${cookieBaseName}_access`];
  const bearer =
    typeof req.headers.authorization === "string" &&
    req.headers.authorization.toLowerCase().startsWith("bearer ")
      ? req.headers.authorization.slice(7).trim()
      : "";
  const sub = decodeJwtSub(
    typeof accessCookie === "string" && accessCookie
      ? accessCookie
      : bearer
  );
  if (sub) {
    return `user:${sub}`;
  }

  return req.ip || req.socket.remoteAddress || "unknown";
}

export function createRateLimiter(config: AppConfig, redis?: Redis | null) {
  const store = createRedisRateLimitStore(redis, "rl:api:");
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => clientKey(req, config.cookie.name),
    // Custom keyGenerator — disable IP-fallback validation noise.
    validate: false,
    skip: skipOperationalProbes,
    ...(store ? { store } : {}),
    message: {
      error: {
        code: ErrorCode.RATE_LIMITED,
        message: "Too many requests. Please try again later.",
        retryable: true,
      },
    },
  });
}
