import { randomUUID } from "node:crypto";
import type {
  RefreshToken,
  Session,
} from "@prisma/client";
import { DuplicateEmailError } from "../../src/modules/auth/errors.js";
import type {
  AuthUserRecord,
  CreateAuditLogInput,
  CreateRefreshTokenInput,
  CreateRegisteredUserInput,
  CreateSessionInput,
  IAuthRepository,
  LoginPersistenceResult,
  RegisterPersistenceResult,
  RotateRefreshPersistenceResult,
} from "../../src/modules/auth/interfaces/IAuthRepository.js";

/**
 * In-memory auth repository for unit / HTTP tests (no Prisma / DB required).
 */
export class InMemoryAuthRepository implements IAuthRepository {
  users = new Map<string, AuthUserRecord>();
  /** Tracks suspended non-deleted emails for registration conflict checks. */
  suspendedUserEmails = new Set<string>();
  sessions = new Map<string, Session>();
  refreshTokens = new Map<string, RefreshToken & { session: Session | null }>();
  auditLogs: CreateAuditLogInput[] = [];

  seedUser(user: AuthUserRecord): void {
    this.users.set(user.id, user);
  }

  markEmailSuspended(email: string): void {
    this.suspendedUserEmails.add(email);
  }

  async findActiveUserByEmail(email: string): Promise<AuthUserRecord | null> {
    for (const user of this.users.values()) {
      if (
        user.email === email &&
        user.deletedAt == null &&
        !this.suspendedUserEmails.has(email)
      ) {
        return user;
      }
    }
    return null;
  }

  async findActiveUserById(id: string): Promise<AuthUserRecord | null> {
    const user = this.users.get(id);
    if (!user || user.deletedAt != null) {
      return null;
    }
    if (this.suspendedUserEmails.has(user.email)) {
      return null;
    }
    return user;
  }

  async emailTakenByNonDeletedUser(email: string): Promise<boolean> {
    if (this.suspendedUserEmails.has(email)) {
      return true;
    }
    for (const user of this.users.values()) {
      if (user.email === email && user.deletedAt == null) {
        return true;
      }
    }
    return false;
  }

  async registerUserWithSession(input: {
    user: CreateRegisteredUserInput;
    session: Omit<CreateSessionInput, "userId">;
    refreshToken: Omit<CreateRefreshTokenInput, "sessionId" | "userId">;
    audit: Omit<CreateAuditLogInput, "actorId" | "entityId">;
  }): Promise<RegisterPersistenceResult> {
    if (await this.emailTakenByNonDeletedUser(input.user.email)) {
      throw new DuplicateEmailError();
    }

    const now = new Date();
    const user: AuthUserRecord = {
      id: randomUUID(),
      email: input.user.email,
      name: input.user.name,
      avatarUrl: null,
      passwordHash: input.user.passwordHash,
      deletedAt: null,
    };
    this.users.set(user.id, user);

    const session: Session = {
      id: randomUUID(),
      userId: user.id,
      sessionTokenHash: input.session.sessionTokenHash,
      userAgent: input.session.userAgent ?? null,
      ipAddress: input.session.ipAddress ?? null,
      expiresAt: input.session.expiresAt,
      revokedAt: null,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(session.id, session);

    const refreshToken: RefreshToken & { session: Session | null } = {
      id: randomUUID(),
      userId: user.id,
      sessionId: session.id,
      tokenHash: input.refreshToken.tokenHash,
      familyId: input.refreshToken.familyId,
      expiresAt: input.refreshToken.expiresAt,
      revokedAt: null,
      replacedById: null,
      createdAt: now,
      updatedAt: now,
      session,
    };
    this.refreshTokens.set(refreshToken.tokenHash, refreshToken);

    this.auditLogs.push({
      ...input.audit,
      actorId: user.id,
      entityId: user.id,
    });

    return { user, session, refreshToken };
  }

  async createLoginSession(input: {
    session: CreateSessionInput;
    refreshToken: Omit<CreateRefreshTokenInput, "sessionId">;
    audit: CreateAuditLogInput;
  }): Promise<LoginPersistenceResult> {
    const now = new Date();
    const session: Session = {
      id: randomUUID(),
      userId: input.session.userId,
      sessionTokenHash: input.session.sessionTokenHash,
      userAgent: input.session.userAgent ?? null,
      ipAddress: input.session.ipAddress ?? null,
      expiresAt: input.session.expiresAt,
      revokedAt: null,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(session.id, session);

    const refreshToken: RefreshToken & { session: Session | null } = {
      id: randomUUID(),
      userId: input.refreshToken.userId,
      sessionId: session.id,
      tokenHash: input.refreshToken.tokenHash,
      familyId: input.refreshToken.familyId,
      expiresAt: input.refreshToken.expiresAt,
      revokedAt: null,
      replacedById: null,
      createdAt: now,
      updatedAt: now,
      session,
    };
    this.refreshTokens.set(refreshToken.tokenHash, refreshToken);

    this.auditLogs.push({
      ...input.audit,
      entityId: input.audit.entityId ?? session.id,
    });

    return { session, refreshToken };
  }

  async findRefreshTokenByHash(tokenHash: string) {
    return this.refreshTokens.get(tokenHash) ?? null;
  }

  async findSessionById(sessionId: string) {
    return this.sessions.get(sessionId) ?? null;
  }

  async rotateRefreshToken(input: {
    previousTokenId: string;
    familyId: string;
    sessionId: string;
    userId: string;
    newTokenHash: string;
    newExpiresAt: Date;
    sessionExpiresAt: Date;
    audit: CreateAuditLogInput;
  }): Promise<RotateRefreshPersistenceResult | null> {
    const now = new Date();
    const previous = [...this.refreshTokens.values()].find(
      (t) => t.id === input.previousTokenId
    );
    if (!previous || previous.revokedAt != null) {
      return null;
    }

    const session = this.sessions.get(input.sessionId);
    if (!session) {
      throw new Error("session missing");
    }

    // Compare-and-set: revoke previous only while still active.
    previous.revokedAt = now;
    previous.updatedAt = now;

    const newRefreshToken: RefreshToken & { session: Session | null } = {
      id: randomUUID(),
      userId: input.userId,
      sessionId: input.sessionId,
      tokenHash: input.newTokenHash,
      familyId: input.familyId,
      expiresAt: input.newExpiresAt,
      revokedAt: null,
      replacedById: null,
      createdAt: now,
      updatedAt: now,
      session,
    };
    this.refreshTokens.set(newRefreshToken.tokenHash, newRefreshToken);

    previous.replacedById = newRefreshToken.id;
    this.refreshTokens.set(previous.tokenHash, previous);

    session.expiresAt = input.sessionExpiresAt;
    session.lastSeenAt = now;
    session.updatedAt = now;
    this.sessions.set(session.id, session);
    newRefreshToken.session = session;

    this.auditLogs.push(input.audit);

    return { session, newRefreshToken, previousRefreshToken: previous };
  }

  async revokeRefreshTokenFamily(input: {
    familyId: string;
    sessionId: string | null;
    audit: CreateAuditLogInput;
  }): Promise<void> {
    const now = new Date();
    for (const token of this.refreshTokens.values()) {
      if (token.familyId === input.familyId && token.revokedAt == null) {
        token.revokedAt = now;
      }
    }
    if (input.sessionId) {
      const session = this.sessions.get(input.sessionId);
      if (session && session.revokedAt == null) {
        session.revokedAt = now;
      }
    }
    this.auditLogs.push(input.audit);
  }

  async revokeSessionAndRefreshToken(input: {
    sessionId: string;
    refreshTokenId?: string;
    audit: CreateAuditLogInput;
  }): Promise<void> {
    const now = new Date();
    const session = this.sessions.get(input.sessionId);
    if (session && session.revokedAt == null) {
      session.revokedAt = now;
    }
    for (const token of this.refreshTokens.values()) {
      if (token.sessionId !== input.sessionId) {
        continue;
      }
      if (input.refreshTokenId && token.id !== input.refreshTokenId) {
        continue;
      }
      if (token.revokedAt == null) {
        token.revokedAt = now;
      }
    }
    this.auditLogs.push(input.audit);
  }

  async touchSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastSeenAt = new Date();
    }
  }

  async createAuditLog(input: CreateAuditLogInput): Promise<void> {
    this.auditLogs.push(input);
  }
}
