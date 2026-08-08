import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import type { AppConfig } from "@config/index.js";
import { UnauthorizedError } from "@common/errors/index.js";

export type AccessTokenClaims = {
  sub: string;
  sid: string;
  jti: string;
  typ: "access";
};

const JWT_ALGORITHM = "HS256" as const;

export function parseDurationToMs(duration: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(duration.trim());
  if (!match) {
    throw new Error(`Invalid duration string: ${duration}`);
  }
  const value = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case "ms":
      return value;
    case "s":
      return value * 1_000;
    case "m":
      return value * 60_000;
    case "h":
      return value * 3_600_000;
    case "d":
      return value * 86_400_000;
    default:
      throw new Error(`Invalid duration unit: ${unit}`);
  }
}

export function addDuration(from: Date, duration: string): Date {
  return new Date(from.getTime() + parseDurationToMs(duration));
}

export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function generateFamilyId(): string {
  return generateOpaqueToken(16);
}

/**
 * Hash token material with SHA-256. Peppers with JWT refresh secret so DB leaks
 * alone are insufficient to forge cookie values.
 */
export function hashToken(rawToken: string, pepper: string): string {
  return createHash("sha256")
    .update(`${pepper}:${rawToken}`)
    .digest("hex");
}

export function signAccessToken(
  claims: Omit<AccessTokenClaims, "typ" | "jti"> & { jti?: string },
  config: AppConfig
): string {
  const payload: AccessTokenClaims = {
    sub: claims.sub,
    sid: claims.sid,
    jti: claims.jti ?? generateOpaqueToken(12),
    typ: "access",
  };
  return jwt.sign(payload, config.jwt.accessSecret, {
    algorithm: JWT_ALGORITHM,
    expiresIn: config.jwt.accessExpiresIn as jwt.SignOptions["expiresIn"],
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  });
}

export function verifyAccessToken(
  token: string,
  config: AppConfig
): AccessTokenClaims {
  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret, {
      algorithms: [JWT_ALGORITHM],
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    }) as jwt.JwtPayload;

    if (
      typeof decoded.sub !== "string" ||
      typeof decoded.sid !== "string" ||
      typeof decoded.jti !== "string" ||
      decoded.typ !== "access"
    ) {
      throw new UnauthorizedError("Invalid access token");
    }
    return {
      sub: decoded.sub,
      sid: decoded.sid,
      jti: decoded.jti,
      typ: "access",
    };
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      throw err;
    }
    throw new UnauthorizedError("Invalid or expired access token");
  }
}

export function extractBearerToken(
  authorizationHeader: string | undefined
): string | undefined {
  if (!authorizationHeader) {
    return undefined;
  }
  const [scheme, token] = authorizationHeader.split(/\s+/);
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return undefined;
  }
  return token;
}
