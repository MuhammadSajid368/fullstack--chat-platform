import { AuditAction } from "@prisma/client";
import type { Logger } from "pino";
import { NotFoundError } from "@common/errors/index.js";
import type {
  ConversationClientContext,
  ConversationDto,
  ConversationsListResponseDto,
  MuteConversationInput,
} from "@modules/conversations/dto/ConversationDto.js";
import type {
  AccessibleConversationResult,
  ConversationUserRecord,
  IConversationRepository,
} from "@modules/conversations/interfaces/IConversationRepository.js";
import type { IConversationService } from "@modules/conversations/interfaces/IConversationService.js";
import { ConversationMapper } from "@modules/conversations/mapper/ConversationMapper.js";
import { INBOX_SAFETY_LIMIT } from "@modules/conversations/validators/ConversationValidators.js";
import {
  conversationRoom,
  RealtimeEvents,
  userRoom,
} from "@websocket/events.js";
import {
  NoOpEventPublisher,
  type IEventPublisher,
} from "@websocket/EventPublisher.js";

/**
 * Conversation service — membership authz, DTO shaping, mute, mark-read.
 */
export class ConversationService implements IConversationService {
  constructor(
    protected readonly repository: IConversationRepository,
    protected readonly logger: Logger,
    protected readonly events: IEventPublisher = new NoOpEventPublisher()
  ) {}

  async listInbox(userId: string): Promise<ConversationsListResponseDto> {
    const { items, truncated } = await this.repository.findInboxForUser(
      userId,
      INBOX_SAFETY_LIMIT
    );

    if (truncated) {
      this.logger.warn(
        {
          userId,
          limit: INBOX_SAFETY_LIMIT,
        },
        "Conversation inbox safety limit reached"
      );
    }

    const conversationIds = items.map((i) => i.conversation.id);
    const allMembers =
      await this.repository.findActiveMembersByConversationIds(conversationIds);

    const membersByConversation = new Map<string, typeof allMembers>();
    for (const member of allMembers) {
      const list = membersByConversation.get(member.conversationId) ?? [];
      list.push(member);
      membersByConversation.set(member.conversationId, list);
    }

    const userIds = new Set<string>();
    for (const member of allMembers) {
      userIds.add(member.userId);
    }

    const users = await this.repository.findUsersByIds([...userIds]);
    const usersById = new Map(users.map((u) => [u.id, u]));

    const conversations = items.map((item) =>
      ConversationMapper.toConversationDto({
        conversation: item.conversation,
        viewerMembership: item.membership,
        members: membersByConversation.get(item.conversation.id) ?? [
          item.membership,
        ],
        usersById,
        viewerUserId: userId,
      })
    );

    const sidecarUsers = this.buildSidecarUsers(
      conversations,
      usersById,
      userId
    );

    return { conversations, users: sidecarUsers };
  }

  async getConversation(
    userId: string,
    conversationId: string
  ): Promise<ConversationDto> {
    const accessible = await this.repository.findAccessibleConversation(
      userId,
      conversationId
    );
    if (!accessible) {
      throw new NotFoundError("Conversation not found");
    }
    return this.shapeAccessible(userId, accessible);
  }

  async muteConversation(
    userId: string,
    conversationId: string,
    input: MuteConversationInput,
    context: ConversationClientContext
  ): Promise<ConversationDto> {
    const updated = await this.repository.updateMute({
      userId,
      conversationId,
      muted: input.muted,
      audit: {
        actorId: userId,
        action: AuditAction.CONVERSATION_UPDATE,
        entityType: "Conversation",
        entityId: conversationId,
        metadata: {
          requestId: context.requestId,
          muted: input.muted,
          reason: "mute_toggle",
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    if (!updated) {
      throw new NotFoundError("Conversation not found");
    }

    const dto = await this.shapeAccessible(userId, updated);
    this.events.publish({
      name: RealtimeEvents.CONVERSATION_UPDATED,
      rooms: [conversationRoom(conversationId), userRoom(userId)],
      payload: {
        conversationId,
        conversation: dto,
      },
    });
    return dto;
  }

  async markRead(
    userId: string,
    conversationId: string,
    context: ConversationClientContext
  ): Promise<void> {
    const accessible = await this.repository.findAccessibleConversation(
      userId,
      conversationId
    );
    if (!accessible) {
      throw new NotFoundError("Conversation not found");
    }

    const ok = await this.repository.markRead({
      userId,
      conversationId,
      audit: {
        actorId: userId,
        action: AuditAction.OTHER,
        entityType: "Conversation",
        entityId: conversationId,
        metadata: {
          requestId: context.requestId,
          reason: "mark_read",
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    if (!ok) {
      throw new NotFoundError("Conversation not found");
    }

    await this.repository.markPeerMessagesRead({
      conversationId,
      readerUserId: userId,
    });

    // Notify every member via user rooms so senders get read receipts even when
    // they are not currently joined to the conversation socket room.
    const memberRooms = accessible.members.map((member) =>
      userRoom(member.userId)
    );

    this.events.publish({
      name: RealtimeEvents.MESSAGE_READ,
      rooms: [conversationRoom(conversationId), ...memberRooms],
      payload: {
        conversationId,
        userId,
      },
    });
    this.events.publish({
      name: RealtimeEvents.CONVERSATION_UNREAD,
      rooms: [userRoom(userId)],
      payload: {
        conversationId,
        userId,
        unreadCount: 0,
      },
    });
  }

  private async shapeAccessible(
    userId: string,
    accessible: AccessibleConversationResult
  ): Promise<ConversationDto> {
    const userIds = accessible.members.map((m) => m.userId);
    const users = await this.repository.findUsersByIds(userIds);
    const usersById = new Map(users.map((u) => [u.id, u]));

    return ConversationMapper.toConversationDto({
      conversation: accessible.conversation,
      viewerMembership: accessible.membership,
      members: accessible.members,
      usersById,
      viewerUserId: userId,
    });
  }

  private buildSidecarUsers(
    conversations: ConversationDto[],
    usersById: Map<string, ConversationUserRecord>,
    viewerUserId: string
  ) {
    const needed = new Set<string>();
    for (const conversation of conversations) {
      for (const memberId of conversation.memberIds) {
        if (memberId !== viewerUserId) {
          needed.add(memberId);
        }
      }
    }

    return [...needed]
      .map((id) => usersById.get(id))
      .filter((u): u is ConversationUserRecord => Boolean(u))
      .map((u) => ConversationMapper.toUserDto(u));
  }
}
