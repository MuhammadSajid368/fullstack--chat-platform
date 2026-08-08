import type {
  AuthClientContext,
  AuthSessionIssued,
  AuthUserDto,
  LoginRequestDto,
  RegisterRequestDto,
} from "@modules/auth/dto/AuthDto.js";

/**
 * Auth service contract — business logic for login / session / refresh.
 */
export interface IAuthService {
  register(
    input: RegisterRequestDto,
    context: AuthClientContext
  ): Promise<AuthSessionIssued>;

  login(
    input: LoginRequestDto,
    context: AuthClientContext
  ): Promise<AuthSessionIssued>;

  me(input: {
    accessToken?: string;
    refreshToken?: string;
  }): Promise<AuthUserDto>;

  refresh(
    refreshToken: string | undefined,
    context: AuthClientContext
  ): Promise<AuthSessionIssued>;

  logout(input: {
    accessToken?: string;
    refreshToken?: string;
  }, context: AuthClientContext): Promise<{ userId: string }>;
}
