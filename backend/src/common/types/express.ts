import type { Request } from "express";
import type { Logger } from "pino";

export type AuthenticatedUser = {
  id: string;
  email: string;
  sessionId?: string;
};

export type RequestAdminActor = {
  id: string;
  globalRole: "ADMIN" | "SUPER_ADMIN";
};

/**
 * Augment Express Request so controllers/middleware can use requestId, user, etc.
 * Lives in a .ts module so Vercel’s backend typecheck includes it.
 *
 * Express documents `namespace Express` as the supported merge point; module
 * augmentation of express-serve-static-core conflicts with pino-http's `log`.
 */
/* eslint-disable @typescript-eslint/no-namespace -- Express Request merge API */
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: AuthenticatedUser;
      /** Set by requireAdmin middleware for ADMIN / SUPER_ADMIN. */
      admin?: RequestAdminActor;
      startTime?: number;
      /** Request-scoped pino logger attached by pino-http. */
      log?: Logger;
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

export type AuthedRequest = Request & {
  user: AuthenticatedUser;
};

export type AdminRequest = AuthedRequest & {
  admin: RequestAdminActor;
};
