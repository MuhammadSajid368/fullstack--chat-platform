import { AuditAction } from "@prisma/client";
import type { AppConfig } from "@config/index.js";
import { ConflictError, UnauthorizedError } from "@common/errors/index.js";
import type {
  AuthClientContext,
  AuthSessionIssued,
  AuthUserDto,
  LoginRequestDto,
  RegisterRequestDto,
} from "@modules/auth/dto/AuthDto.js";
import type { IAuthRepository } from "@modules/auth/interfaces/IAuthRepository.js";
import type { IAuthService } from "@modules/auth/interfaces/IAuthService.js";
import { AuthMapper } from "@modules/auth/mapper/AuthMapper.js";
import { DuplicateEmailError } from "@modules/auth/errors.js";
import {
  addDuration,
  generateFamilyId,
  generateOpaqueToken,
  hashPassword,
  hashToken,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
} from "@modules/auth/utils/index.js";

/**
 * Auth service — business logic for credential checks, sessions, and refresh rotation.
 * Controllers call this; this calls the auth repository only.
 */
export class AuthService implements IAuthService {
  constructor(
    protected readonly repository: IAuthRepository,
    protected readonly config: AppConfig
  ) {}

  async register(
    input: RegisterRequestDto,
    context: AuthClientContext
  ): Promise<AuthSessionIssued> {
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();

    if (await this.repository.emailTakenByNonDeletedUser(email)) {
      throw new ConflictError("Email already registered");
    }

    let passwordHash: string;
    try {
      passwordHash = await hashPassword(input.password, this.config.isTest);
    } catch {
      throw new UnauthorizedError("Unable to create account");
    }

    const now = new Date();
    const refreshExpiresAt = addDuration(now, this.config.jwt.refreshExpiresIn);
    const familyId = generateFamilyId();
    const refreshToken = generateOpaqueToken();
    const sessionOpaque = generateOpaqueToken();

    let persisted;
    try {
      persisted = await this.repository.registerUserWithSession({
        user: {
          email,
          name,
          passwordHash,
        },
        session: {
          sessionTokenHash: hashToken(
            sessionOpaque,
            this.config.jwt.refreshSecret
          ),
          userAgent: context.userAgent,
          ipAddress: context.ipAddress,
          expiresAt: refreshExpiresAt,
        },
        refreshToken: {
          tokenHash: hashToken(refreshToken, this.config.jwt.refreshSecret),
          familyId,
          expiresAt: refreshExpiresAt,
        },
        audit: {
          // String literal avoids stale Prisma client enums after migrate
          // (AuditAction.USER_REGISTER can be undefined until generate + restart).
          action: "USER_REGISTER" as typeof AuditAction.USER_REGISTER,
          entityType: "User",
          metadata: { requestId: context.requestId },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    } catch (err) {
      if (
        err instanceof DuplicateEmailError ||
        (err instanceof Error && err.name === "DuplicateEmailError")
      ) {
        throw new ConflictError("Email already registered");
      }
      throw err;
    }

    const accessToken = signAccessToken(
      { sub: persisted.user.id, sid: persisted.session.id },
      this.config
    );

    return {
      user: AuthMapper.toAuthUserDto(persisted.user),
      accessToken,
      refreshToken,
      sessionId: persisted.session.id,
    };
  }

  async login(
    input: LoginRequestDto,
    context: AuthClientContext
  ): Promise<AuthSessionIssued> {
    const user = await this.repository.findActiveUserByEmail(input.email);

    const passwordOk = await verifyPassword(
      input.password,
      user?.passwordHash
    );

    if (!user || !passwordOk) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const now = new Date();
    const refreshExpiresAt = addDuration(now, this.config.jwt.refreshExpiresIn);
    const familyId = generateFamilyId();
    const refreshToken = generateOpaqueToken();
    const sessionOpaque = generateOpaqueToken();

    const { session } = await this.repository.createLoginSession({
      session: {
        userId: user.id,
        sessionTokenHash: hashToken(
          sessionOpaque,
          this.config.jwt.refreshSecret
        ),
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
        expiresAt: refreshExpiresAt,
      },
      refreshToken: {
        userId: user.id,
        tokenHash: hashToken(refreshToken, this.config.jwt.refreshSecret),
        familyId,
        expiresAt: refreshExpiresAt,
      },
      audit: {
        actorId: user.id,
        action: AuditAction.USER_LOGIN,
        entityType: "Session",
        metadata: { requestId: context.requestId },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    const accessToken = signAccessToken(
      { sub: user.id, sid: session.id },
      this.config
    );

    return {
      user: AuthMapper.toAuthUserDto(user),
      accessToken,
      refreshToken,
      sessionId: session.id,
    };
  }

  async me(input: {
    accessToken?: string;
    refreshToken?: string;
  }): Promise<AuthUserDto> {
    const resolved = await this.resolveAuthenticatedSession(input);
    await this.repository.touchSession(resolved.sessionId);
    return AuthMapper.toAuthUserDto(resolved.user);
  }

  async refresh(
    refreshTokenRaw: string | undefined,
    context: AuthClientContext
  ): Promise<AuthSessionIssued> {
    if (!refreshTokenRaw) {
      throw new UnauthorizedError("Refresh token required");
    }

    const tokenHash = hashToken(
      refreshTokenRaw,
      this.config.jwt.refreshSecret
    );
    const existing = await this.repository.findRefreshTokenByHash(tokenHash);

    if (!existing) {
      throw new UnauthorizedError("Invalid refresh token");
    }

    // Replay detection: presenting a revoked/rotated token burns the family.
    if (existing.revokedAt) {
      await this.repository.revokeRefreshTokenFamily({
        familyId: existing.familyId,
        sessionId: existing.sessionId,
        audit: {
          actorId: existing.userId,
          action: AuditAction.REFRESH_TOKEN_REPLAY,
          entityType: "RefreshToken",
          entityId: existing.id,
          metadata: {
            reason: "refresh_replay_detected",
            familyId: existing.familyId,
            requestId: context.requestId,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
      throw new UnauthorizedError("Invalid refresh token");
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError("Refresh token expired");
    }

    const session = existing.session;
    if (!session) {
      throw new UnauthorizedError("Session not found");
    }

    this.assertSessionActive(session);

    const user = await this.repository.findActiveUserById(existing.userId);
    if (!user) {
      throw new UnauthorizedError("User not found");
    }

    const now = new Date();
    const newRefreshToken = generateOpaqueToken();
    const newExpiresAt = addDuration(now, this.config.jwt.refreshExpiresIn);

    const rotated = await this.repository.rotateRefreshToken({
      previousTokenId: existing.id,
      familyId: existing.familyId,
      sessionId: session.id,
      userId: existing.userId,
      newTokenHash: hashToken(newRefreshToken, this.config.jwt.refreshSecret),
      newExpiresAt,
      sessionExpiresAt: newExpiresAt,
      audit: {
        actorId: existing.userId,
        action: AuditAction.REFRESH_TOKEN_ROTATE,
        entityType: "RefreshToken",
        entityId: existing.id,
        metadata: {
          reason: "refresh_rotation",
          familyId: existing.familyId,
          requestId: context.requestId,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    // Lost the compare-and-set race — do not burn the winner's family.
    if (!rotated) {
      throw new UnauthorizedError("Invalid refresh token");
    }

    const accessToken = signAccessToken(
      { sub: user.id, sid: rotated.session.id },
      this.config
    );

    return {
      user: AuthMapper.toAuthUserDto(user),
      accessToken,
      refreshToken: newRefreshToken,
      sessionId: rotated.session.id,
    };
  }

  async logout(
    input: {
      accessToken?: string;
      refreshToken?: string;
    },
    context: AuthClientContext
  ): Promise<{ userId: string }> {
    const resolved = await this.resolveAuthenticatedSession(input);

    await this.repository.revokeSessionAndRefreshToken({
      sessionId: resolved.sessionId,
      refreshTokenId: resolved.refreshTokenId,
      audit: {
        actorId: resolved.user.id,
        action: AuditAction.USER_LOGOUT,
        entityType: "Session",
        entityId: resolved.sessionId,
        metadata: { requestId: context.requestId },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
    return { userId: resolved.user.id };
  }

  /**
   * Restore an authenticated session from access JWT and/or refresh cookie.
   * Refresh cookie is the browser source of truth (frontend contract).
   */
  private async resolveAuthenticatedSession(input: {
    accessToken?: string;
    refreshToken?: string;
  }): Promise<{
    user: NonNullable<Awaited<ReturnType<IAuthRepository["findActiveUserById"]>>>;
    sessionId: string;
    refreshTokenId?: string;
  }> {
    // Prefer refresh cookie path for browser session restore.
    if (input.refreshToken) {
      return this.resolveFromRefreshToken(input.refreshToken);
    }

    if (input.accessToken) {
      return this.resolveFromAccessToken(input.accessToken);
    }

    throw new UnauthorizedError("Authentication required");
  }

  private async resolveFromRefreshToken(refreshTokenRaw: string) {
    const tokenHash = hashToken(
      refreshTokenRaw,
      this.config.jwt.refreshSecret
    );
    const existing = await this.repository.findRefreshTokenByHash(tokenHash);

    if (!existing || existing.revokedAt) {
      throw new UnauthorizedError("Invalid or revoked refresh token");
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError("Refresh token expired");
    }

    const session = existing.session;
    if (!session) {
      throw new UnauthorizedError("Session not found");
    }

    this.assertSessionActive(session);

    const user = await this.repository.findActiveUserById(existing.userId);
    if (!user) {
      throw new UnauthorizedError("User not found");
    }

    return {
      user,
      sessionId: session.id,
      refreshTokenId: existing.id,
    };
  }

  private async resolveFromAccessToken(accessToken: string) {
    const claims = verifyAccessToken(accessToken, this.config);
    const session = await this.repository.findSessionById(claims.sid);

    if (!session) {
      throw new UnauthorizedError("Session not found");
    }

    this.assertSessionActive(session);

    if (session.userId !== claims.sub) {
      throw new UnauthorizedError("Invalid access token");
    }

    const user = await this.repository.findActiveUserById(claims.sub);
    if (!user) {
      throw new UnauthorizedError("User not found");
    }

    return {
      user,
      sessionId: session.id,
    };
  }

  private assertSessionActive(session: {
    revokedAt: Date | null;
    expiresAt: Date;
  }): void {
    if (session.revokedAt) {
      throw new UnauthorizedError("Session revoked");
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError("Session expired");
    }
  }
}
