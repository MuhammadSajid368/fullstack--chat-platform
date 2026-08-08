import { AuditAction, type Prisma } from "@prisma/client";
import type { Logger } from "pino";
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from "@common/errors/index.js";
import type {
  MessageClientContext,
  MessageDto,
  MessagesPageDto,
  SendDirectInput,
  SendMessageInput,
  SendMessageResult,
} from "@modules/messages/dto/MessageDto.js";
import {
  NotActiveMemberError,
  type IMessageRepository,
} from "@modules/messages/interfaces/IMessageRepository.js";
import type { IMessageService } from "@modules/messages/interfaces/IMessageService.js";
import { MessageMapper } from "@modules/messages/mapper/MessageMapper.js";
import {
  buildPreview,
  decodeMessageCursor,
  encodeMessageCursor,
} from "@modules/messages/validators/MessageValidators.js";
import {
  conversationRoom,
  RealtimeEvents,
  userRoom,
} from "@websocket/events.js";
import {
  NoOpEventPublisher,
  type IEventPublisher,
} from "@websocket/EventPublisher.js";
import type { INotificationService } from "@modules/notifications/interfaces/INotificationService.js";

function directPairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * Message service — authz, validation orchestration, DIRECT lazy-create, idempotency.
 */
export class MessageService implements IMessageService {
  constructor(
    protected readonly repository: IMessageRepository,
    protected readonly logger: Logger,
    protected readonly events: IEventPublisher = new NoOpEventPublisher(),
    protected readonly notifications: INotificationService | null = null
  ) {}

  async listMessages(
    userId: string,
    conversationId: string,
    query: { cursor?: string; limit: number }
  ): Promise<MessagesPageDto> {
    await this.requireMember(userId, conversationId);

    const cursor = query.cursor
      ? decodeMessageCursor(query.cursor)
      : undefined;

    const rows = await this.repository.listMessagesKeyset({
      conversationId,
      cursor,
      limit: query.limit,
    });

    const hasMore = rows.length > query.limit;
    const pageDesc = hasMore ? rows.slice(0, query.limit) : rows;
    const pageAsc = [...pageDesc].reverse();

    const messages = await this.hydrateMessages(userId, conversationId, pageAsc);

    const oldest = pageDesc[pageDesc.length - 1];
    const nextCursor =
      hasMore && oldest
        ? encodeMessageCursor(oldest.createdAt, oldest.id)
        : null;

    return { messages, nextCursor, hasMore };
  }

  async send(
    userId: string,
    conversationId: string,
    input: SendMessageInput,
    context: MessageClientContext
  ): Promise<SendMessageResult> {
    await this.requireMember(userId, conversationId);
    this.assertClientType(input.type);

    if (input.replyToMessageId) {
      const reply = await this.repository.findReplyInConversation(
        input.replyToMessageId,
        conversationId
      );
      if (!reply) {
        throw new ValidationError("replyToMessageId is invalid", {
          replyToMessageId: "Message not found in conversation",
        });
      }
    }

    const type = input.type ?? "text";
    const attachmentIds = input.attachmentIds ?? [];
    await this.assertAttachments(userId, type, attachmentIds, conversationId);

    let result;
    try {
      result = await this.repository.sendInConversation({
        data: {
          conversationId,
          senderId: userId,
          type: MessageMapper.toPrismaType(type),
          status: "SENT",
          content: (input.content ?? "").trim(),
          clientMessageId: input.clientMessageId,
          replyToMessageId: input.replyToMessageId ?? null,
          linkPreview: (input.linkPreview ?? null) as Prisma.InputJsonValue | null,
          metadata: (input.metadata ?? null) as Prisma.InputJsonValue | null,
        },
        attachmentIds,
        preview: buildPreview(type, input.content),
        audit: {
          actorId: userId,
          action: AuditAction.MESSAGE_SEND,
          entityType: "Message",
          metadata: {
            requestId: context.requestId,
            conversationId,
            type,
            idempotent: true,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    } catch (err) {
      if (err instanceof NotActiveMemberError) {
        throw new NotFoundError("Conversation not found");
      }
      throw err;
    }

    this.logger.info(
      {
        requestId: context.requestId,
        userId,
        conversationId,
        messageId: result.message.id,
        created: result.created,
      },
      "Message send"
    );

    const dto = await this.toDto(userId, result.message);
    if (result.created) {
      await this.publishMessageCreated({
        conversationId,
        actorUserId: userId,
        message: dto,
        messageId: result.message.id,
      });
    }
    return {
      message: dto,
      created: result.created,
      conversationId,
    };
  }

  async sendDirect(
    userId: string,
    input: SendDirectInput,
    context: MessageClientContext
  ): Promise<SendMessageResult> {
    if (input.peerUserId === userId) {
      throw new ValidationError("Cannot start a DIRECT chat with yourself", {
        peerUserId: "Invalid peer",
      });
    }

    const peer = await this.repository.findActiveUserById(input.peerUserId);
    if (!peer) {
      throw new NotFoundError("User not found");
    }

    this.assertClientType(input.type);
    const type = input.type ?? "text";
    const attachmentIds = input.attachmentIds ?? [];
    // Pending DIRECT: only unscoped (conversationId null) attachments.
    await this.assertAttachments(userId, type, attachmentIds, null);

    if (input.replyToMessageId) {
      throw new ValidationError(
        "replyToMessageId is not allowed on first DIRECT message",
        { replyToMessageId: "Not allowed" }
      );
    }

    const pairKey = directPairKey(userId, input.peerUserId);

    const result = await this.repository.sendDirectFirstMessage({
      senderId: userId,
      peerUserId: input.peerUserId,
      pairKey,
      data: {
        senderId: userId,
        type: MessageMapper.toPrismaType(type),
        status: "SENT",
        content: (input.content ?? "").trim(),
        clientMessageId: input.clientMessageId,
        replyToMessageId: null,
        linkPreview: (input.linkPreview ?? null) as Prisma.InputJsonValue | null,
        metadata: (input.metadata ?? null) as Prisma.InputJsonValue | null,
      },
      attachmentIds,
      preview: buildPreview(type, input.content),
      createConversationAudit: {
        actorId: userId,
        action: AuditAction.CONVERSATION_CREATE,
        entityType: "Conversation",
        metadata: {
          requestId: context.requestId,
          type: "DIRECT",
          pairKey,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      sendAudit: {
        actorId: userId,
        action: AuditAction.MESSAGE_SEND,
        entityType: "Message",
        metadata: {
          requestId: context.requestId,
          type,
          direct: true,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    this.logger.info(
      {
        requestId: context.requestId,
        userId,
        conversationId: result.conversationId,
        messageId: result.message.id,
        conversationCreated: result.conversationCreated,
        created: result.created,
      },
      "Direct message send"
    );

    const dto = await this.toDto(userId, result.message);
    if (result.conversationCreated) {
      this.events.publish({
        name: RealtimeEvents.CONVERSATION_CREATED,
        rooms: [
          conversationRoom(result.conversationId),
          userRoom(userId),
          userRoom(input.peerUserId),
        ],
        payload: {
          conversationId: result.conversationId,
          type: "direct",
        },
      });
    }
    if (result.created) {
      await this.publishMessageCreated({
        conversationId: result.conversationId,
        actorUserId: userId,
        message: dto,
        messageId: result.message.id,
        extraRooms: [userRoom(input.peerUserId)],
      });
    }
    return {
      message: dto,
      created: result.created,
      conversationId: result.conversationId,
    };
  }

  async retry(
    userId: string,
    messageId: string,
    context: MessageClientContext
  ): Promise<MessageDto> {
    const existing = await this.requireMessageMember(userId, messageId);

    const updated = await this.repository.retryFailedMessage({
      messageId,
      senderId: userId,
      audit: {
        actorId: userId,
        action: AuditAction.MESSAGE_RETRY,
        entityType: "Message",
        entityId: messageId,
        metadata: {
          requestId: context.requestId,
          conversationId: existing.conversationId,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    if (!updated) {
      throw new NotFoundError("Message not found");
    }

    const dto = await this.toDto(userId, updated);
    this.events.publish({
      name: RealtimeEvents.MESSAGE_RETRY,
      rooms: [conversationRoom(updated.conversationId)],
      payload: {
        conversationId: updated.conversationId,
        message: dto,
      },
    });
    this.events.publish({
      name: RealtimeEvents.MESSAGE_UPDATED,
      rooms: [conversationRoom(updated.conversationId)],
      payload: {
        conversationId: updated.conversationId,
        message: dto,
      },
    });
    return dto;
  }

  async softDelete(
    userId: string,
    messageId: string,
    context: MessageClientContext
  ): Promise<MessageDto> {
    const message = await this.repository.findMessageById(messageId);
    if (!message || message.deletedAt) {
      throw new NotFoundError("Message not found");
    }

    const membership = await this.repository.findActiveMembership(
      userId,
      message.conversationId
    );
    if (!membership) {
      throw new NotFoundError("Message not found");
    }

    const canDelete =
      message.senderId === userId ||
      membership.role === "OWNER" ||
      membership.role === "ADMIN";
    if (!canDelete) {
      throw new NotFoundError("Message not found");
    }

    const deleted = await this.repository.softDeleteMessage({
      messageId,
      audit: {
        actorId: userId,
        action: AuditAction.MESSAGE_DELETE,
        entityType: "Message",
        entityId: messageId,
        metadata: { requestId: context.requestId },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    if (!deleted) {
      throw new NotFoundError("Message not found");
    }

    const dto = await this.toDto(userId, deleted);
    this.events.publish({
      name: RealtimeEvents.MESSAGE_DELETED,
      rooms: [conversationRoom(deleted.conversationId)],
      payload: {
        conversationId: deleted.conversationId,
        messageId: deleted.id,
        message: dto,
      },
    });
    return dto;
  }

  async star(
    userId: string,
    messageId: string,
    context: MessageClientContext
  ): Promise<MessageDto> {
    const message = await this.requireMessageMember(userId, messageId);
    await this.repository.starMessage({
      userId,
      messageId,
      audit: {
        actorId: userId,
        action: AuditAction.MESSAGE_STAR,
        entityType: "Message",
        entityId: messageId,
        metadata: { requestId: context.requestId },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
    const dto = await this.toDto(userId, message, { starred: true });
    this.events.publish({
      name: RealtimeEvents.MESSAGE_STARRED,
      rooms: [userRoom(userId)],
      payload: {
        conversationId: message.conversationId,
        messageId: message.id,
        message: dto,
      },
    });
    return dto;
  }

  async unstar(
    userId: string,
    messageId: string,
    context: MessageClientContext
  ): Promise<MessageDto> {
    const message = await this.requireMessageMember(userId, messageId);
    await this.repository.unstarMessage({
      userId,
      messageId,
      audit: {
        actorId: userId,
        action: AuditAction.MESSAGE_UNSTAR,
        entityType: "Message",
        entityId: messageId,
        metadata: { requestId: context.requestId },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
    const dto = await this.toDto(userId, message, { starred: false });
    this.events.publish({
      name: RealtimeEvents.MESSAGE_UNSTARRED,
      rooms: [userRoom(userId)],
      payload: {
        conversationId: message.conversationId,
        messageId: message.id,
        message: dto,
      },
    });
    return dto;
  }

  async pin(
    userId: string,
    messageId: string,
    context: MessageClientContext
  ): Promise<MessageDto> {
    const message = await this.requireMessageMember(userId, messageId);
    if (message.deletedAt) {
      throw new NotFoundError("Message not found");
    }
    await this.repository.pinMessage({
      userId,
      messageId,
      conversationId: message.conversationId,
      audit: {
        actorId: userId,
        action: AuditAction.MESSAGE_PIN,
        entityType: "Message",
        entityId: messageId,
        metadata: { requestId: context.requestId },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
    const dto = await this.toDto(userId, message, { pinned: true });
    this.events.publish({
      name: RealtimeEvents.MESSAGE_PINNED,
      rooms: [conversationRoom(message.conversationId)],
      payload: {
        conversationId: message.conversationId,
        messageId: message.id,
        message: dto,
      },
    });
    return dto;
  }

  async unpin(
    userId: string,
    messageId: string,
    context: MessageClientContext
  ): Promise<MessageDto> {
    const message = await this.requireMessageMember(userId, messageId);
    await this.repository.unpinMessage({
      messageId,
      conversationId: message.conversationId,
      audit: {
        actorId: userId,
        action: AuditAction.MESSAGE_UNPIN,
        entityType: "Message",
        entityId: messageId,
        metadata: { requestId: context.requestId },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
    const dto = await this.toDto(userId, message, { pinned: false });
    this.events.publish({
      name: RealtimeEvents.MESSAGE_UNPINNED,
      rooms: [conversationRoom(message.conversationId)],
      payload: {
        conversationId: message.conversationId,
        messageId: message.id,
        message: dto,
      },
    });
    return dto;
  }

  private async publishMessageCreated(input: {
    conversationId: string;
    actorUserId: string;
    message: MessageDto;
    messageId: string;
    extraRooms?: string[];
  }): Promise<void> {
    const memberIds = await this.repository.listActiveMemberUserIds(
      input.conversationId
    );
    const rooms = Array.from(
      new Set([
        conversationRoom(input.conversationId),
        ...memberIds.map((id) => userRoom(id)),
        ...(input.extraRooms ?? []),
      ])
    );

    this.events.publish({
      name: RealtimeEvents.MESSAGE_CREATED,
      rooms,
      payload: {
        conversationId: input.conversationId,
        message: input.message,
      },
    });

    // Absolute unread counts so clients not in the conversation room still update.
    const unreadRows = await this.repository.listActiveMemberUnread(
      input.conversationId
    );
    for (const row of unreadRows) {
      if (row.userId === input.actorUserId) {
        continue;
      }
      this.events.publish({
        name: RealtimeEvents.CONVERSATION_UNREAD,
        rooms: [userRoom(row.userId)],
        payload: {
          conversationId: input.conversationId,
          userId: row.userId,
          unreadCount: row.unreadCount,
        },
      });
    }

    this.notifyMessageCreated({
      messageId: input.messageId,
      conversationId: input.conversationId,
      actorUserId: input.actorUserId,
    });
  }

  private notifyMessageCreated(input: {
    messageId: string;
    conversationId: string;
    actorUserId: string;
  }): void {
    if (!this.notifications) {
      return;
    }
    // In-process fan-out so in-app notifications work even when BullMQ jobs are
    // disabled (e.g. Redis < 5). JobDispatcher dedupes if queues are also running.
    void this.notifications
      .processJob({
        kind: "message.created",
        messageId: input.messageId,
        conversationId: input.conversationId,
        actorUserId: input.actorUserId,
      })
      .catch((err) => {
        this.logger.error(
          { err, messageId: input.messageId },
          "In-app notification fan-out failed"
        );
      });
  }

  private assertClientType(type: SendMessageInput["type"]): void {
    if (type === "system") {
      throw new ForbiddenError("SYSTEM messages cannot be sent by clients");
    }
  }

  private async assertAttachments(
    userId: string,
    type: string,
    attachmentIds: string[],
    conversationId: string | null
  ): Promise<void> {
    if (attachmentIds.length === 0) {
      return;
    }
    const ready = await this.repository.findReadyAttachmentsForSender({
      attachmentIds,
      uploaderId: userId,
      conversationId,
    });
    if (ready.length !== attachmentIds.length) {
      throw new ValidationError(
        "One or more attachments are invalid or not READY",
        { attachmentIds: "Invalid attachments" }
      );
    }

    if (type === "voice") {
      for (const a of ready) {
        if (!a.mimeType.startsWith("audio/") || !a.durationMs || a.durationMs < 1) {
          throw new ValidationError("VOICE requires audio attachment with duration", {
            attachmentIds: "Invalid voice attachment",
          });
        }
      }
    }
    if (type === "video") {
      for (const a of ready) {
        if (!a.mimeType.startsWith("video/")) {
          throw new ValidationError("VIDEO requires video attachment", {
            attachmentIds: "Invalid video attachment",
          });
        }
      }
    }
    if (type === "image" || type === "sticker") {
      for (const a of ready) {
        if (!a.mimeType.startsWith("image/")) {
          throw new ValidationError(`${type.toUpperCase()} requires image attachment`, {
            attachmentIds: "Invalid image attachment",
          });
        }
      }
    }
  }

  private async requireMember(userId: string, conversationId: string) {
    const membership = await this.repository.findActiveMembership(
      userId,
      conversationId
    );
    if (!membership) {
      throw new NotFoundError("Conversation not found");
    }
    return membership;
  }

  private async requireMessageMember(userId: string, messageId: string) {
    const message = await this.repository.findMessageById(messageId);
    if (!message) {
      throw new NotFoundError("Message not found");
    }
    await this.requireMember(userId, message.conversationId);
    return message;
  }

  private async hydrateMessages(
    userId: string,
    conversationId: string,
    messages: Awaited<ReturnType<IMessageRepository["listMessagesKeyset"]>>
  ): Promise<MessageDto[]> {
    const ids = messages.map((m) => m.id);
    const [stars, pins, attachments] = await Promise.all([
      this.repository.findViewerStars(userId, ids),
      this.repository.findPinnedMessageIds(conversationId, ids),
      this.repository.findAttachmentsByMessageIds(ids),
    ]);

    return messages.map((message) =>
      MessageMapper.toMessageDto({
        message,
        starred: stars.has(message.id),
        pinned: pins.has(message.id),
        attachments: attachments.get(message.id) ?? [],
      })
    );
  }

  private async toDto(
    userId: string,
    message: Awaited<ReturnType<IMessageRepository["findMessageById"]>> &
      object,
    overrides?: { starred?: boolean; pinned?: boolean }
  ): Promise<MessageDto> {
    const msg = message;
    const [stars, pins, attachments] = await Promise.all([
      this.repository.findViewerStars(userId, [msg.id]),
      this.repository.findPinnedMessageIds(msg.conversationId, [msg.id]),
      this.repository.findAttachmentsByMessageIds([msg.id]),
    ]);

    return MessageMapper.toMessageDto({
      message: msg,
      starred: overrides?.starred ?? stars.has(msg.id),
      pinned: overrides?.pinned ?? pins.has(msg.id),
      attachments: attachments.get(msg.id) ?? [],
    });
  }
}
