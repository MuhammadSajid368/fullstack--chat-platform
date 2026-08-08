import type { AuditAction } from "@prisma/client";
import type { UpdateMyProfileInput } from "@modules/users/dto/UserDto.js";

export type UserProfileRecord = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  phone: string | null;
  about: string | null;
  createdAt: Date;
};

export type UserListPage = {
  users: UserProfileRecord[];
  hasMore: boolean;
};

export type UserCursor = {
  createdAt: Date;
  id: string;
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

export interface IUserRepository {
  listActiveUsers(input: {
    limit: number;
    cursor?: UserCursor;
  }): Promise<UserListPage>;

  findActiveUserById(id: string): Promise<UserProfileRecord | null>;

  searchActiveUsers(input: {
    q: string;
    limit: number;
    cursor?: UserCursor;
  }): Promise<UserListPage>;

  updateProfile(
    userId: string,
    data: UpdateMyProfileInput,
    audit: CreateAuditLogInput
  ): Promise<UserProfileRecord>;
}
