import type {
  PaginationInput,
  PublicUserDto,
  SearchUsersInput,
  UpdateMyProfileInput,
  UserClientContext,
  UserListResponseDto,
} from "@modules/users/dto/UserDto.js";

export interface IUserService {
  listUsers(pagination: PaginationInput): Promise<UserListResponseDto>;

  getUserById(id: string): Promise<PublicUserDto>;

  searchUsers(input: SearchUsersInput): Promise<UserListResponseDto>;

  updateMyProfile(
    userId: string,
    input: UpdateMyProfileInput,
    context: UserClientContext
  ): Promise<PublicUserDto>;
}
