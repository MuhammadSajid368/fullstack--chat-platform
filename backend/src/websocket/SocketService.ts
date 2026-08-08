import type { IMessageRepository } from "@modules/messages/interfaces/IMessageRepository.js";
import type { IAuthService } from "@modules/auth/interfaces/IAuthService.js";
import type { Logger } from "pino";
import { ForbiddenError, UnauthorizedError } from "@common/errors/index.js";

/**
 * Socket domain service — room authorization and session re-validation.
 * No Prisma. Gateway remains transport-only.
 */
export class SocketService {
  constructor(
    private readonly messageRepository: IMessageRepository,
    private readonly authService: IAuthService,
    private readonly logger: Logger
  ) {}

  /**
   * Re-validate JWT/session (detects revoked sessions / soft-deleted users).
   */
  async assertSession(accessToken: string): Promise<{ userId: string }> {
    try {
      const user = await this.authService.me({ accessToken });
      return { userId: user.id };
    } catch {
      throw new UnauthorizedError("UNAUTHORIZED");
    }
  }

  async assertConversationMember(
    userId: string,
    conversationId: string
  ): Promise<void> {
    const membership = await this.messageRepository.findActiveMembership(
      userId,
      conversationId
    );
    if (!membership) {
      this.logger.info(
        { userId, conversationId },
        "Room authorization denied"
      );
      throw new ForbiddenError("FORBIDDEN");
    }
  }
}
