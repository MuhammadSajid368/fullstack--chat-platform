import { randomUUID } from "node:crypto";
import type { AuditAction } from "@prisma/client";
import type { UpdateMyProfileInput } from "../../src/modules/users/dto/UserDto.js";
import type {
  CreateAuditLogInput,
  IUserRepository,
  UserCursor,
  UserListPage,
  UserProfileRecord,
} from "../../src/modules/users/interfaces/IUserRepository.js";

export type InMemoryUser = UserProfileRecord & {
  passwordHash: string;
  deletedAt: Date | null;
};

function compareDesc(a: UserProfileRecord, b: UserProfileRecord): number {
  const byDate = b.createdAt.getTime() - a.createdAt.getTime();
  if (byDate !== 0) {
    return byDate;
  }
  return b.id < a.id ? -1 : b.id > a.id ? 1 : 0;
}

function afterCursor(
  user: UserProfileRecord,
  cursor?: UserCursor
): boolean {
  if (!cursor) {
    return true;
  }
  if (user.createdAt.getTime() < cursor.createdAt.getTime()) {
    return true;
  }
  if (
    user.createdAt.getTime() === cursor.createdAt.getTime() &&
    user.id < cursor.id
  ) {
    return true;
  }
  return false;
}

/**
 * In-memory user repository for unit / HTTP tests.
 */
export class InMemoryUserRepository implements IUserRepository {
  users = new Map<string, InMemoryUser>();
  auditLogs: CreateAuditLogInput[] = [];

  seed(user: InMemoryUser): void {
    this.users.set(user.id, { ...user });
  }

  private active(): InMemoryUser[] {
    return [...this.users.values()]
      .filter((u) => u.deletedAt == null)
      .sort(compareDesc);
  }

  private toProfile(user: InMemoryUser): UserProfileRecord {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      about: user.about,
      createdAt: user.createdAt,
    };
  }

  async listActiveUsers(input: {
    limit: number;
    cursor?: UserCursor;
  }): Promise<UserListPage> {
    const filtered = this.active().filter((u) => afterCursor(u, input.cursor));
    const slice = filtered.slice(0, input.limit + 1);
    const hasMore = slice.length > input.limit;
    const users = (hasMore ? slice.slice(0, input.limit) : slice).map((u) =>
      this.toProfile(u)
    );
    return { users, hasMore };
  }

  async findActiveUserById(id: string): Promise<UserProfileRecord | null> {
    const user = this.users.get(id);
    if (!user || user.deletedAt != null) {
      return null;
    }
    return this.toProfile(user);
  }

  async searchActiveUsers(input: {
    q: string;
    limit: number;
    cursor?: UserCursor;
  }): Promise<UserListPage> {
    const q = input.q.toLowerCase();
    const filtered = this.active()
      .filter(
        (u) =>
          u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      )
      .filter((u) => afterCursor(u, input.cursor));

    const slice = filtered.slice(0, input.limit + 1);
    const hasMore = slice.length > input.limit;
    const users = (hasMore ? slice.slice(0, input.limit) : slice).map((u) =>
      this.toProfile(u)
    );
    return { users, hasMore };
  }

  async updateProfile(
    userId: string,
    data: UpdateMyProfileInput,
    audit: CreateAuditLogInput
  ): Promise<UserProfileRecord> {
    const user = this.users.get(userId);
    if (!user || user.deletedAt != null) {
      throw new Error("user missing");
    }
    if (data.name !== undefined) {
      user.name = data.name;
    }
    if (data.avatarUrl !== undefined) {
      user.avatarUrl = data.avatarUrl;
    }
    if (data.phone !== undefined) {
      user.phone = data.phone;
    }
    if (data.about !== undefined) {
      user.about = data.about;
    }
    this.auditLogs.push({
      ...audit,
      action: audit.action as AuditAction,
      entityId: audit.entityId ?? userId,
    });
    return this.toProfile(user);
  }

  static createId(): string {
    return randomUUID();
  }
}
