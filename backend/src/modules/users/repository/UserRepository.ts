import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  CreateAuditLogInput,
  IUserRepository,
  UserCursor,
  UserListPage,
  UserProfileRecord,
} from "@modules/users/interfaces/IUserRepository.js";
import type { UpdateMyProfileInput } from "@modules/users/dto/UserDto.js";

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  phone: true,
  about: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

function toJson(
  value: Record<string, unknown> | undefined
): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value as Prisma.InputJsonValue;
}

function cursorWhere(cursor?: UserCursor): Prisma.UserWhereInput | undefined {
  if (!cursor) {
    return undefined;
  }
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      {
        AND: [{ createdAt: cursor.createdAt }, { id: { lt: cursor.id } }],
      },
    ],
  };
}

/**
 * User repository — Prisma access only. No business rules.
 */
export class UserRepository implements IUserRepository {
  constructor(protected readonly prisma: PrismaClient) {}

  async listActiveUsers(input: {
    limit: number;
    cursor?: UserCursor;
  }): Promise<UserListPage> {
    const cursorFilter = cursorWhere(input.cursor);
    const rows = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(cursorFilter ?? {}),
      },
      select: publicUserSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
    });

    const hasMore = rows.length > input.limit;
    const users = hasMore ? rows.slice(0, input.limit) : rows;
    return { users, hasMore };
  }

  async findActiveUserById(id: string): Promise<UserProfileRecord | null> {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: publicUserSelect,
    });
  }

  async searchActiveUsers(input: {
    q: string;
    limit: number;
    cursor?: UserCursor;
  }): Promise<UserListPage> {
    const cursorFilter = cursorWhere(input.cursor);
    const rows = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        AND: [
          {
            OR: [
              { name: { contains: input.q, mode: "insensitive" } },
              { email: { contains: input.q, mode: "insensitive" } },
            ],
          },
          ...(cursorFilter ? [cursorFilter] : []),
        ],
      },
      select: publicUserSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
    });

    const hasMore = rows.length > input.limit;
    const users = hasMore ? rows.slice(0, input.limit) : rows;
    return { users, hasMore };
  }

  async updateProfile(
    userId: string,
    data: UpdateMyProfileInput,
    audit: CreateAuditLogInput
  ): Promise<UserProfileRecord> {
    const updateData: Prisma.UserUpdateInput = {};
    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (data.avatarUrl !== undefined) {
      updateData.avatarUrl = data.avatarUrl;
    }
    if (data.phone !== undefined) {
      updateData.phone = data.phone;
    }
    if (data.about !== undefined) {
      updateData.about = data.about;
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: updateData,
        select: publicUserSelect,
      });

      await tx.auditLog.create({
        data: {
          actorId: audit.actorId,
          action: audit.action,
          entityType: audit.entityType,
          entityId: audit.entityId ?? userId,
          metadata: toJson(audit.metadata),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent,
        },
      });

      return user;
    });
  }
}
