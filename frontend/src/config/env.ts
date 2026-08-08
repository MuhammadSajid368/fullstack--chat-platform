/**
 * Environment helpers for chat service mode and REST API configuration.
 *
 * Mock mode is always safe and does not require VITE_API_BASE_URL.
 * REST mode validates required variables at registry / http client init.
 */

export type ChatServiceMode = "mock" | "rest";

export function getChatServiceMode(): ChatServiceMode {
  const mode = import.meta.env.VITE_CHAT_SERVICE_MODE;
  if (mode === "rest") {
    return "rest";
  }
  return "mock";
}

export const isDevEnvironment = import.meta.env.DEV;

export function isRestMode(): boolean {
  return getChatServiceMode() === "rest";
}

export function isMockMode(): boolean {
  return getChatServiceMode() === "mock";
}

export class EnvConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvConfigError";
  }
}

/**
 * Returns the validated API base URL when REST mode is active.
 * Throws EnvConfigError with a user-facing message if misconfigured.
 */
export function getApiBaseUrl(): string {
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!baseUrl) {
    throw new EnvConfigError(
      "REST mode requires VITE_API_BASE_URL. Set it in your .env file or switch to VITE_CHAT_SERVICE_MODE=mock."
    );
  }
  return baseUrl.replace(/\/$/, "");
}

export function getRequestTimeoutMs(): number {
  const raw = import.meta.env.VITE_API_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 15000;
}

/**
 * Socket.IO server URL. Empty string means same-origin (recommended with Vite proxy).
 */
export function getSocketUrl(): string {
  const url = import.meta.env.VITE_SOCKET_URL?.trim();
  if (!url) {
    return "";
  }
  return url.replace(/\/$/, "");
}
