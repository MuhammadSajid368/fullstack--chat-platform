/**
 * Users module request/response DTOs aligned with frontend `ApiUserDto`.
 */

export type PublicUserDto = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  phone: string | null;
  about: string | null;
};

export type UserListResponseDto = {
  users: PublicUserDto[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type UpdateMyProfileInput = {
  name?: string;
  avatarUrl?: string | null;
  phone?: string | null;
  about?: string | null;
};

export type UserClientContext = {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export type PaginationInput = {
  cursor?: string;
  limit: number;
};

export type SearchUsersInput = PaginationInput & {
  q: string;
};
