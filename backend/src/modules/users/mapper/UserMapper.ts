import type { UserProfileRecord } from "@modules/users/interfaces/IUserRepository.js";
import type { PublicUserDto } from "@modules/users/dto/UserDto.js";

/**
 * Maps persistence models ↔ API DTOs. Never expose passwordHash or auth fields.
 */
export class UserMapper {
  static toPublicUserDto(user: UserProfileRecord): PublicUserDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      about: user.about,
    };
  }
}
