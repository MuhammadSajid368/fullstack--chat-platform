export type GlobalRole = "USER" | "ADMIN" | "SUPER_ADMIN";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar: string;
  globalRole?: GlobalRole;
}

export interface RegisterCredentials {
  name: string;
  email: string;
  password: string;
}

export interface AuthSession {
  user: AuthUser;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * `idle` / `initializing` — used before session bootstrap completes (esp. REST `/auth/me`).
 * AuthGuard must wait until status leaves these states before redirecting.
 */
export type AuthStatus =
  | "idle"
  | "initializing"
  | "loading"
  | "authenticated"
  | "unauthenticated";

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  error: string | null;
  /** True after the first bootstrapAuth attempt finishes. */
  initialized: boolean;
}
