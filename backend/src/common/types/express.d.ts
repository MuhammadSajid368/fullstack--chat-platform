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

export type AuthedRequest = Request & {
  user: AuthenticatedUser;
};

export type AdminRequest = AuthedRequest & {
  admin: RequestAdminActor;
};
