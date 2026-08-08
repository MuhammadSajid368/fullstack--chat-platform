let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token?.trim() ? token.trim() : null;
}

export function clearAccessToken(): void {
  accessToken = null;
}

/**
 * Best-effort read from non-HttpOnly cookies (dev proxy still injects Bearer for HTTP/WS).
 */
export function readAccessTokenFromDocumentCookie(): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const name = trimmed.slice(0, eq);
    if (name === "chat_session_access" || name.endsWith("_access")) {
      const value = trimmed.slice(eq + 1);
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

export function syncAccessTokenFromDocumentCookie(): void {
  const token = readAccessTokenFromDocumentCookie();
  if (token) {
    setAccessToken(token);
  }
}
