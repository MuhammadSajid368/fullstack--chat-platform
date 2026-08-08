import type {
  AuditAction,
  RefreshToken,
  Session,
  User,
} from "@prisma/client";

export type AuthUserRecord = Pick<
  User,
  "id" | "email" | "name" | "avatarUrl" | "passwordHash" | "deletedAt"
>;

export type CreateSessionInput = {
  userId: string;
  sessionTokenHash: string;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: Date;
};

export type CreateRefreshTokenInput = {
  userId: string;
  sessionId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
};

export type CreateAuditLogInput = {
  actorId?: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};

export type LoginPersistenceResult = {
  session: Session;
  refreshToken: RefreshToken;
};

export type RegisterPersistenceResult = {
  user: AuthUserRecord;
  session: Session;
  refreshToken: RefreshToken;
};

export type CreateRegisteredUserInput = {
  email: string;
  name: string;
  passwordHash: string;
};

export type RotateRefreshPersistenceResult = {
  session: Session;
  newRefreshToken: RefreshToken;
  previousRefreshToken: RefreshToken;
};

/**
 * Auth persistence contract. Repositories are the only Prisma accessors.
 */
export interface IAuthRepository {
  findActiveUserByEmail(email: string): Promise<AuthUserRecord | null>;

  findActiveUserById(id: string): Promise<AuthUserRecord | null>;

  /**
   * True when a non-deleted user already owns this email (active or suspended).
   */
  emailTakenByNonDeletedUser(email: string): Promise<boolean>;

  /**
   * Atomically create user + session + refresh + USER_REGISTER audit.
   * Throws on unique email race (caller maps to ConflictError).
   */
  registerUserWithSession(input: {
    user: CreateRegisteredUserInput;
    session: Omit<CreateSessionInput, "userId">;
    refreshToken: Omit<CreateRefreshTokenInput, "sessionId" | "userId">;
    audit: Omit<CreateAuditLogInput, "actorId" | "entityId">;
  }): Promise<RegisterPersistenceResult>;

  createLoginSession(input: {
    session: CreateSessionInput;
    refreshToken: Omit<CreateRefreshTokenInput, "sessionId">;
    audit: CreateAuditLogInput;
  }): Promise<LoginPersistenceResult>;

  findRefreshTokenByHash(
    tokenHash: string
  ): Promise<(RefreshToken & { session: Session | null }) | null>;

  findSessionById(sessionId: string): Promise<Session | null>;

  rotateRefreshToken(input: {
    previousTokenId: string;
    familyId: string;
    sessionId: string;
    userId: string;
    newTokenHash: string;
    newExpiresAt: Date;
    sessionExpiresAt: Date;
    audit: CreateAuditLogInput;
  }): Promise<RotateRefreshPersistenceResult | null>;

  revokeRefreshTokenFamily(input: {
    familyId: string;
    sessionId: string | null;
    audit: CreateAuditLogInput;
  }): Promise<void>;

  revokeSessionAndRefreshToken(input: {
    sessionId: string;
    refreshTokenId?: string;
    audit: CreateAuditLogInput;
  }): Promise<void>;

  touchSession(sessionId: string): Promise<void>;

  createAuditLog(input: CreateAuditLogInput): Promise<void>;
}
