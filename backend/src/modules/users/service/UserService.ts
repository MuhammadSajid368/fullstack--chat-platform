import { AuditAction } from "@prisma/client";
import { NotFoundError, ValidationError } from "@common/errors/index.js";
import type {
  PaginationInput,
  PublicUserDto,
  SearchUsersInput,
  UpdateMyProfileInput,
  UserClientContext,
  UserListResponseDto,
} from "@modules/users/dto/UserDto.js";
import type { IUserRepository } from "@modules/users/interfaces/IUserRepository.js";
import type { IUserService } from "@modules/users/interfaces/IUserService.js";
import { UserMapper } from "@modules/users/mapper/UserMapper.js";
import {
  decodeUserCursor,
  encodeUserCursor,
} from "@modules/users/validators/UserValidators.js";

/**
 * User service — business logic for public profiles and self profile updates.
 */
export class UserService implements IUserService {
  constructor(protected readonly repository: IUserRepository) {}

  async listUsers(pagination: PaginationInput): Promise<UserListResponseDto> {
    const cursor = pagination.cursor
      ? decodeUserCursor(pagination.cursor)
      : undefined;

    const page = await this.repository.listActiveUsers({
      limit: pagination.limit,
      cursor,
    });

    return this.toListResponse(page.users, page.hasMore);
  }

  async getUserById(id: string): Promise<PublicUserDto> {
    const user = await this.repository.findActiveUserById(id);
    if (!user) {
      throw new NotFoundError("User not found");
    }
    return UserMapper.toPublicUserDto(user);
  }

  async searchUsers(input: SearchUsersInput): Promise<UserListResponseDto> {
    const cursor = input.cursor ? decodeUserCursor(input.cursor) : undefined;

    const page = await this.repository.searchActiveUsers({
      q: input.q,
      limit: input.limit,
      cursor,
    });

    return this.toListResponse(page.users, page.hasMore);
  }

  async updateMyProfile(
    userId: string,
    input: UpdateMyProfileInput,
    context: UserClientContext
  ): Promise<PublicUserDto> {
    const existing = await this.repository.findActiveUserById(userId);
    if (!existing) {
      throw new NotFoundError("User not found");
    }

    const patch: UpdateMyProfileInput = {};
    if (input.name !== undefined) {
      patch.name = input.name;
    }
    if (input.avatarUrl !== undefined) {
      patch.avatarUrl = input.avatarUrl;
    }
    if (input.phone !== undefined) {
      patch.phone = input.phone;
    }
    if (input.about !== undefined) {
      patch.about = input.about;
    }

    if (Object.keys(patch).length === 0) {
      throw new ValidationError("At least one editable field is required");
    }

    const updated = await this.repository.updateProfile(userId, patch, {
      actorId: userId,
      action: AuditAction.USER_UPDATE,
      entityType: "User",
      entityId: userId,
      metadata: {
        requestId: context.requestId,
        fields: Object.keys(patch),
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return UserMapper.toPublicUserDto(updated);
  }

  private toListResponse(
    users: Parameters<typeof UserMapper.toPublicUserDto>[0][],
    hasMore: boolean
  ): UserListResponseDto {
    const dtos = users.map((u) => UserMapper.toPublicUserDto(u));
    const last = users[users.length - 1];
    const nextCursor =
      hasMore && last ? encodeUserCursor(last.createdAt, last.id) : null;

    return {
      users: dtos,
      nextCursor,
      hasMore,
    };
  }
}
