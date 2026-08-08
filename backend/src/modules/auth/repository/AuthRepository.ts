import type { Prisma, PrismaClient } from "@prisma/client";
import { Prisma as PrismaNS } from "@prisma/client";
import { DuplicateEmailError } from "@modules/auth/errors.js";
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
} from "@modules/auth/interfaces/IAuthRepository.js";

function toJson(
  value: Record<string, unknown> | undefined
): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value as Prisma.InputJsonValue;
}

/**
 * Auth repository — Prisma access only. No business rules.
 */
export class AuthRepository implements IAuthRepository {
  constructor(protected readonly prisma: PrismaClient) {}

  async findActiveUserByEmail(email: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findFirst({
      where: { email, deletedAt: null, suspendedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        passwordHash: true,
        deletedAt: true,
      },
    });
  }

  async findActiveUserById(id: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null, suspendedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        passwordHash: true,
        deletedAt: true,
      },
    });
  }

  async emailTakenByNonDeletedUser(email: string): Promise<boolean> {
    const existing = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true },
    });
    return Boolean(existing);
  }

  async registerUserWithSession(input: {
    user: CreateRegisteredUserInput;
    session: Omit<CreateSessionInput, "userId">;
    refreshToken: Omit<CreateRefreshTokenInput, "sessionId" | "userId">;
    audit: Omit<CreateAuditLogInput, "actorId" | "entityId">;
  }): Promise<RegisterPersistenceResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const taken = await tx.user.findFirst({
          where: { email: input.user.email, deletedAt: null },
          select: { id: true },
        });
        if (taken) {
          throw new DuplicateEmailError();
        }

        const user = await tx.user.create({
          data: {
            email: input.user.email,
            name: input.user.name,
            passwordHash: input.user.passwordHash,
            globalRole: "USER",
            suspendedAt: null,
            deletedAt: null,
          },
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
            passwordHash: true,
            deletedAt: true,
          },
        });

        const session = await tx.session.create({
          data: {
            userId: user.id,
            sessionTokenHash: input.session.sessionTokenHash,
            userAgent: input.session.userAgent,
            ipAddress: input.session.ipAddress,
            expiresAt: input.session.expiresAt,
          },
        });

        const refreshToken = await tx.refreshToken.create({
          data: {
            userId: user.id,
            sessionId: session.id,
            tokenHash: input.refreshToken.tokenHash,
            familyId: input.refreshToken.familyId,
            expiresAt: input.refreshToken.expiresAt,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: input.audit.action ?? "USER_REGISTER",
            entityType: input.audit.entityType,
            entityId: user.id,
            metadata: toJson(input.audit.metadata),
            ipAddress: input.audit.ipAddress,
            userAgent: input.audit.userAgent,
          },
        });

        return { user, session, refreshToken };
      });
    } catch (err) {
      if (err instanceof DuplicateEmailError) {
        throw err;
      }
      if (
        err instanceof PrismaNS.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new DuplicateEmailError();
      }
      throw err;
    }
  }

  async createLoginSession(input: {
    session: CreateSessionInput;
    refreshToken: Omit<CreateRefreshTokenInput, "sessionId">;
    audit: CreateAuditLogInput;
  }): Promise<LoginPersistenceResult> {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.session.create({
        data: {
          userId: input.session.userId,
          sessionTokenHash: input.session.sessionTokenHash,
          userAgent: input.session.userAgent,
          ipAddress: input.session.ipAddress,
          expiresAt: input.session.expiresAt,
        },
      });

      const refreshToken = await tx.refreshToken.create({
        data: {
          userId: input.refreshToken.userId,
          sessionId: session.id,
          tokenHash: input.refreshToken.tokenHash,
          familyId: input.refreshToken.familyId,
          expiresAt: input.refreshToken.expiresAt,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: input.audit.actorId,
          action: input.audit.action,
          entityType: input.audit.entityType,
          entityId: input.audit.entityId ?? session.id,
          metadata: toJson(input.audit.metadata),
          ipAddress: input.audit.ipAddress,
          userAgent: input.audit.userAgent,
        },
      });

      return { session, refreshToken };
    });
  }

  async findRefreshTokenByHash(tokenHash: string) {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { session: true },
    });
  }

  async findSessionById(sessionId: string) {
    return this.prisma.session.findUnique({
      where: { id: sessionId },
    });
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
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      // Compare-and-set: exactly one concurrent refresher wins.
      const cas = await tx.refreshToken.updateMany({
        where: {
          id: input.previousTokenId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });

      if (cas.count !== 1) {
        return null;
      }

      const newRefreshToken = await tx.refreshToken.create({
        data: {
          userId: input.userId,
          sessionId: input.sessionId,
          tokenHash: input.newTokenHash,
          familyId: input.familyId,
          expiresAt: input.newExpiresAt,
        },
      });

      const previousRefreshToken = await tx.refreshToken.update({
        where: { id: input.previousTokenId },
        data: {
          replacedById: newRefreshToken.id,
        },
      });

      const session = await tx.session.update({
        where: { id: input.sessionId },
        data: {
          expiresAt: input.sessionExpiresAt,
          lastSeenAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: input.audit.actorId,
          action: input.audit.action,
          entityType: input.audit.entityType,
          entityId: input.audit.entityId,
          metadata: toJson(input.audit.metadata),
          ipAddress: input.audit.ipAddress,
          userAgent: input.audit.userAgent,
        },
      });

      return { session, newRefreshToken, previousRefreshToken };
    });
  }

  async revokeRefreshTokenFamily(input: {
    familyId: string;
    sessionId: string | null;
    audit: CreateAuditLogInput;
  }): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.updateMany({
        where: {
          familyId: input.familyId,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });

      if (input.sessionId) {
        await tx.session.updateMany({
          where: {
            id: input.sessionId,
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: input.audit.actorId,
          action: input.audit.action,
          entityType: input.audit.entityType,
          entityId: input.audit.entityId,
          metadata: toJson(input.audit.metadata),
          ipAddress: input.audit.ipAddress,
          userAgent: input.audit.userAgent,
        },
      });
    });
  }

  async revokeSessionAndRefreshToken(input: {
    sessionId: string;
    refreshTokenId?: string;
    audit: CreateAuditLogInput;
  }): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: { id: input.sessionId, revokedAt: null },
        data: { revokedAt: now },
      });

      if (input.refreshTokenId) {
        await tx.refreshToken.updateMany({
          where: { id: input.refreshTokenId, revokedAt: null },
          data: { revokedAt: now },
        });
      } else {
        await tx.refreshToken.updateMany({
          where: { sessionId: input.sessionId, revokedAt: null },
          data: { revokedAt: now },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: input.audit.actorId,
          action: input.audit.action,
          entityType: input.audit.entityType,
          entityId: input.audit.entityId,
          metadata: toJson(input.audit.metadata),
          ipAddress: input.audit.ipAddress,
          userAgent: input.audit.userAgent,
        },
      });
    });
  }

  async touchSession(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { lastSeenAt: new Date() },
    });
  }

  async createAuditLog(input: CreateAuditLogInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: toJson(input.metadata),
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
  }
}
