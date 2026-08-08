import type { AuthUserRecord } from "@modules/auth/interfaces/IAuthRepository.js";
import type { AuthUserDto } from "@modules/auth/dto/AuthDto.js";

/**
 * Maps persistence models <-> API DTOs for the auth module.
 * Never expose passwordHash or token material.
 */
export class AuthMapper {
  static toAuthUserDto(user: AuthUserRecord): AuthUserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    };
  }
}
