import type { RequestHandler } from "express";
import type { AppConfig } from "@config/index.js";
import { asyncHandler } from "@common/utils/asyncHandler.js";
import type { IAuthService } from "@modules/auth/interfaces/IAuthService.js";
import {
  extractBearerToken,
  refreshCookieName,
} from "@modules/auth/utils/index.js";

/**
 * Requires an authenticated session via Bearer access JWT and/or refresh cookie.
 * Does not modify the auth module — reuses IAuthService.me for session restore.
 */
export function createAuthenticateMiddleware(
  authService: IAuthService,
  config: AppConfig
): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    const accessToken = extractBearerToken(
      req.get("authorization") ?? undefined
    );
    const rawCookie = req.cookies?.[refreshCookieName(config)];
    const refreshToken =
      typeof rawCookie === "string" && rawCookie.length > 0
        ? rawCookie
        : undefined;

    const user = await authService.me({ accessToken, refreshToken });
    req.user = {
      id: user.id,
      email: user.email,
    };
    next();
  });
}
