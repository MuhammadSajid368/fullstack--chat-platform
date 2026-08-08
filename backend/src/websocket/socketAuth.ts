import type { Socket } from "socket.io";
import type { AppConfig } from "@config/index.js";
import type { IAuthService } from "@modules/auth/interfaces/IAuthService.js";
import {
  accessCookieName,
  refreshCookieName,
} from "@modules/auth/utils/cookies.js";
import {
  extractBearerToken,
  verifyAccessToken,
} from "@modules/auth/utils/tokens.js";

export type AuthenticatedSocketData = {
  userId: string;
  sessionId: string;
  accessToken: string;
};

function parseCookieHeader(
  header: string | undefined
): Record<string, string> {
  if (!header) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (name) {
      try {
        out[name] = decodeURIComponent(value);
      } catch {
        out[name] = value;
      }
    }
  }
  return out;
}

/**
 * Socket.IO handshake auth — Bearer / auth.token / access cookie JWT,
 * validated via AuthService.me (session + soft-delete rejection).
 *
 * Important: browsers often send both access + refresh cookies. `me()` prefers
 * refresh and can succeed even when the access JWT is expired. Do not fail the
 * handshake solely because verifyAccessToken(access) throws in that case.
 */
export function createSocketAuthMiddleware(
  authService: IAuthService,
  config: AppConfig
) {
  return async (socket: Socket, next: (err?: Error) => void): Promise<void> => {
    try {
      const fromAuth =
        typeof socket.handshake.auth?.token === "string"
          ? socket.handshake.auth.token
          : undefined;
      const fromHeader = extractBearerToken(
        socket.handshake.headers.authorization
      );
      const cookies = parseCookieHeader(socket.handshake.headers.cookie);
      const fromAccessCookie = cookies[accessCookieName(config)];
      const accessToken = fromAuth ?? fromHeader ?? fromAccessCookie ?? undefined;
      const refreshToken = cookies[refreshCookieName(config)];

      if (!accessToken && !refreshToken) {
        next(new Error("UNAUTHORIZED"));
        return;
      }

      const user = await authService.me({ accessToken, refreshToken });
      const data = socket.data as AuthenticatedSocketData;
      data.userId = user.id;

      if (accessToken) {
        try {
          const claims = verifyAccessToken(accessToken, config);
          data.sessionId = claims.sid;
          data.accessToken = accessToken;
        } catch {
          // Access JWT expired/invalid but refresh (via me) already proved the session.
          data.sessionId = user.id;
          data.accessToken = "";
        }
      } else {
        data.sessionId = user.id;
        data.accessToken = "";
      }

      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  };
}

export function getSocketUserId(socket: Socket): string {
  return (socket.data as AuthenticatedSocketData).userId;
}

export function getSocketAccessToken(socket: Socket): string {
  return (socket.data as AuthenticatedSocketData).accessToken;
}

export function getSocketSessionId(socket: Socket): string {
  return (socket.data as AuthenticatedSocketData).sessionId;
}
