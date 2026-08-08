/**
 * Auth request/response DTOs aligned with frontend `ApiAuthUserDto` /
 * `ApiLoginResponse` / `ApiMeResponse`.
 */

export type AuthUserDto = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
};

export type LoginRequestDto = {
  email: string;
  password: string;
};

export type RegisterRequestDto = {
  name: string;
  email: string;
  password: string;
};

export type LoginResponseDto = {
  user: AuthUserDto;
};

export type MeResponseDto = {
  user: AuthUserDto;
};

export type RefreshResponseDto = {
  user: AuthUserDto;
};

/** Service-layer result that includes secrets for the controller to set cookies. */
export type AuthSessionIssued = {
  user: AuthUserDto;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
};

export type AuthClientContext = {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};
