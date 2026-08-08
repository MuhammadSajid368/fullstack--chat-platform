import type pino from "pino";

/**
 * Redaction paths applied to every log record.
 *
 * Never log:
 *  - Passwords
 *  - JWTs (Authorization headers, access/refresh cookies, tokens in payloads)
 *  - Session cookies
 *  - Message content
 *  - Attachment storage keys / signed URLs
 */
export const REDACT_PATHS: string[] = [
  // Passwords
  "password",
  "*.password",
  "req.body.password",
  "req.body.currentPassword",
  "req.body.newPassword",
  "req.body.passwordConfirm",
  "res.body.password",
  "user.password",

  // Bearer tokens / JWTs
  'req.headers["authorization"]',
  'req.headers["Authorization"]',
  'req.headers["cookie"]',
  'req.headers["Cookie"]',
  'req.headers["set-cookie"]',
  'req.headers["x-refresh-token"]',
  'res.headers["set-cookie"]',
  'res.headers["Set-Cookie"]',
  "accessToken",
  "refreshToken",
  "req.body.accessToken",
  "req.body.refreshToken",
  "tokens.accessToken",
  "tokens.refreshToken",
  "session.accessToken",
  "session.refreshToken",

  // Session cookies
  "req.cookies",
  "cookies",

  // Message content
  "req.body.content",
  "message.content",
  "payload.content",

  // Attachment / storage secrets
  "req.body.storageKey",
  "attachment.storageKey",
  "attachment.signedUrl",
  "upload.storageKey",
  "upload.signedUrl",
];

/**
 * Extra properties that request-scoped child loggers should include.
 * The `traceparent` / trace/span ids are injected by the correlation middleware.
 */
export type CorrelationBindings = {
  requestId?: string;
  traceId?: string;
  spanId?: string;
  userId?: string;
  sessionId?: string;
};

/**
 * Applies redaction options to a pino config in-place-safe way.
 */
export function buildPinoRedaction(): pino.redactOptions {
  return {
    paths: REDACT_PATHS,
    censor: "[REDACTED]",
    remove: false,
  };
}

/**
 * Constructs a child logger enriched with correlation identifiers.
 * Never adds sensitive fields to the log context.
 */
export function withCorrelation(
  logger: pino.Logger,
  bindings: CorrelationBindings
): pino.Logger {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(bindings)) {
    if (typeof value === "string" && value.length > 0) {
      cleaned[key] = value;
    }
  }
  if (Object.keys(cleaned).length === 0) {
    return logger;
  }
  return logger.child(cleaned);
}
