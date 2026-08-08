/**
 * Auth session lifecycle hooks for the REST http client.
 *
 * Uses credentials/session cookies — no access tokens in localStorage.
 * 401 handling is registered from the app shell to avoid circular imports
 * between httpClient and Redux.
 */

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;
let handlingUnauthorized = false;

export function registerUnauthorizedHandler(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler;
}

export function clearUnauthorizedHandler(): void {
  unauthorizedHandler = null;
  handlingUnauthorized = false;
}

/**
 * Invoked once per 401 flood; subsequent calls are no-ops until reset.
 * Avoids redirect loops between AuthGuard and interceptor.
 */
export function handleUnauthorizedResponse(): void {
  if (handlingUnauthorized) {
    return;
  }
  handlingUnauthorized = true;
  try {
    unauthorizedHandler?.();
  } finally {
    window.setTimeout(() => {
      handlingUnauthorized = false;
    }, 1500);
  }
}

export function isHandlingUnauthorized(): boolean {
  return handlingUnauthorized;
}
