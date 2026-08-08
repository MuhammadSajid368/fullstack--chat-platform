import type { CookieOptions } from "express";
import type { AppConfig } from "@config/index.js";
import { parseDurationToMs } from "./tokens.js";

export function accessCookieName(config: AppConfig): string {
  return `${config.cookie.name}_access`;
}

export function refreshCookieName(config: AppConfig): string {
  return config.cookie.name;
}

/**
 * Auth cookies are scoped to `/` so browsers send them on all same-origin
 * API and Socket.IO requests. Domain APIs authenticate via refresh cookie
 * and/or Bearer; sockets accept Bearer or the access cookie.
 */
export function authCookiePath(_config: AppConfig): string {
  return "/";
}

function baseCookieOptions(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    path: authCookiePath(config),
  };
}

export function refreshCookieOptions(config: AppConfig): CookieOptions {
  return {
    ...baseCookieOptions(config),
    maxAge: parseDurationToMs(config.jwt.refreshExpiresIn),
  };
}

export function accessCookieOptions(config: AppConfig): CookieOptions {
  return {
    ...baseCookieOptions(config),
    maxAge: parseDurationToMs(config.jwt.accessExpiresIn),
  };
}

/** Options for clearCookie — must match path/secure/sameSite used when setting. */
export function clearCookieOptions(config: AppConfig): CookieOptions {
  return baseCookieOptions(config);
}
