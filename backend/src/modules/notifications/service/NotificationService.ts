import type { Logger } from "pino";
import type { NotificationType } from "@prisma/client";
import { NotFoundError, ValidationError } from "@common/errors/index.js";
import type {
  CreateNotificationJobInput,
  NotificationClientContext,
  NotificationDto,
  NotificationsPageDto,
  UnreadCountDto,
} from "@modules/notifications/dto/NotificationDto.js";
import type {
  CreateNotificationRow,
  INotificationRepository,
  MessageFanoutContext,
} from "@modules/notifications/interfaces/INotificationRepository.js";
import type { INotificationService } from "@modules/notifications/interfaces/INotificationService.js";
import { NotificationMapper } from "@modules/notifications/mapper/NotificationMapper.js";
import {
  decodeNotificationCursor,
  encodeNotificationCursor,
} from "@modules/notifications/validators/NotificationValidators.js";
import type {
  EmailProvider,
  PushProvider,
  SmsProvider,
} from "@modules/notifications/providers/NotificationProviders.js";
import {
  NoOpEmailProvider,
  NoOpPushProvider,
  NoOpSmsProvider,
} from "@modules/notifications/providers/NotificationProviders.js";
import {
  NoOpEventPublisher,
  type IEventPublisher,
} from "@websocket/EventPublisher.js";
import { RealtimeEvents, userRoom } from "@websocket/events.js";

/**
 * Notification service — fan-out rules, mute/self/dedupe, socket emit.
 * Push/email/SMS providers are no-op hooks only.
 */
export class NotificationService implements INotificationService {
  constructor(
    protected readonly repository: INotificationRepository,
    protected readonly logger: Logger,
    protected readonly events: IEventPublisher = new NoOpEventPublisher(),
    protected readonly pushProvider: PushProvider = new NoOpPushProvider(),
    protected readonly emailProvider: EmailProvider = new NoOpEmailProvider(),
    protected readonly smsProvider: SmsProvider = new NoOpSmsProvider()
  ) {}

  async list(
    userId: string,
    query: { cursor?: string; limit: number }
  ): Promise<NotificationsPageDto> {
    let cursor;
    if (query.cursor) {
      try {
        cursor = decodeNotificationCursor(query.cursor);
      } catch {
        throw new ValidationError("Invalid cursor", { cursor: "Invalid" });
      }
    }

    const rows = await this.repository.listForUser({
      userId,
      cursor,
      limit: query.limit,
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeNotificationCursor(last.createdAt, last.id)
        : null;

    return {
      notifications: page.map((r) => NotificationMapper.toDto(r)),
      nextCursor,
      hasMore,
    };
  }

  async unreadCount(userId: string): Promise<UnreadCountDto> {
    const count = await this.repository.countUnread(userId);
    return { count };
  }

  async markRead(
    userId: string,
    notificationId: string,
    context?: NotificationClientContext
  ): Promise<NotificationDto> {
    const updated = await this.repository.markRead(userId, notificationId);
    if (!updated) {
      throw new NotFoundError("Notification not found");
    }
    const dto = NotificationMapper.toDto(updated);
    this.events.publish({
      name: RealtimeEvents.NOTIFICATION_READ,
      rooms: [userRoom(userId)],
      payload: { notificationId, notification: dto },
    });
    this.logger.info(
      { requestId: context?.requestId, userId, notificationId },
      "Notification read"
    );
    return dto;
  }

  async markAllRead(
    userId: string,
    context?: NotificationClientContext
  ): Promise<{ updated: number }> {
    const updated = await this.repository.markAllRead(userId);
    this.events.publish({
      name: RealtimeEvents.NOTIFICATION_READ_ALL,
      rooms: [userRoom(userId)],
      payload: { userId, updated },
    });
    this.logger.info(
      { requestId: context?.requestId, userId, updated },
      "Notification read all"
    );
    return { updated };
  }

  async softDelete(
    userId: string,
    notificationId: string,
    context?: NotificationClientContext
  ): Promise<NotificationDto> {
    const deleted = await this.repository.softDelete(userId, notificationId);
    if (!deleted) {
      throw new NotFoundError("Notification not found");
    }
    const dto = NotificationMapper.toDto(deleted);
    this.events.publish({
      name: RealtimeEvents.NOTIFICATION_DELETED,
      rooms: [userRoom(userId)],
      payload: { notificationId, notification: dto },
    });
    this.logger.info(
      { requestId: context?.requestId, userId, notificationId },
      "Notification deleted"
    );
    return dto;
  }

  async processJob(
    input: CreateNotificationJobInput
  ): Promise<NotificationDto[]> {
    const started = Date.now();
    const rows = await this.buildRows(input);
    if (rows.length === 0) {
      this.logger.info(
        { kind: input.kind, durationMs: Date.now() - started },
        "Notification job produced zero rows"
      );
      return [];
    }

    // Dedupe filter (batch)
    const toInsert: CreateNotificationRow[] = [];
    for (const row of rows) {
      const exists = await this.repository.existsByDedupeKey(
        row.userId,
        row.dedupeKey
      );
      if (!exists) {
        toInsert.push(row);
      }
    }

    if (toInsert.length === 0) {
      this.logger.info(
        { kind: input.kind, durationMs: Date.now() - started },
        "Notification job skipped (duplicates)"
      );
      return [];
    }

    const created = await this.repository.createMany(toInsert);
    const dtos = created.map((r) => NotificationMapper.toDto(r));

    for (const dto of dtos) {
      const userId = created.find((c) => c.id === dto.id)!.userId;
      this.events.publish({
        name: RealtimeEvents.NOTIFICATION_CREATED,
        rooms: [userRoom(userId)],
        payload: { notification: dto },
      });
      // Future providers — never fail the in-app path.
      void this.pushProvider.send({
        userId,
        title: dto.title,
        body: dto.body,
        data: {
          notificationId: dto.id,
          type: dto.type,
        },
      });
    }

    this.logger.info(
      {
        kind: input.kind,
        created: dtos.length,
        durationMs: Date.now() - started,
      },
      "Notification created"
    );

    return dtos;
  }

  private async buildRows(
    input: CreateNotificationJobInput
  ): Promise<CreateNotificationRow[]> {
    switch (input.kind) {
      case "message.created":
        return this.buildMessageRows(input);
      case "message.reaction":
        return this.buildReactionRows(input);
      case "member.joined":
      case "group.invite":
        return this.buildMemberTargetRows(input, "GROUP_INVITE", "added");
      case "member.removed":
        return this.buildMemberTargetRows(input, "GROUP_UPDATE", "removed");
      case "member.left":
        return this.buildMemberLeftRows(input);
      case "role.changed":
        return this.buildMemberTargetRows(input, "GROUP_UPDATE", "role");
      case "ownership.transferred":
        return this.buildOwnershipRows(input);
      case "upload.completed":
        return this.buildUploadRows(input, true);
      case "upload.failed":
        return this.buildUploadRows(input, false);
      case "system":
        return this.buildSystemRows(input);
      default:
        return [];
    }
  }

  private async buildMessageRows(
    input: CreateNotificationJobInput
  ): Promise<CreateNotificationRow[]> {
    if (!input.messageId) {
      return [];
    }
    const ctx = await this.repository.findMessageFanoutContext(input.messageId);
    if (!ctx || !this.isConversationNotifiable(ctx)) {
      return [];
    }

    const rows: CreateNotificationRow[] = [];
    const mentionSet = new Set(ctx.mentionUserIds);

    for (const member of ctx.members) {
      if (!this.shouldNotifyMember(ctx.senderId, member)) {
        continue;
      }
      // Future blocked-users hook
      if (this.isBlocked(ctx.senderId, member.userId)) {
        continue;
      }

      const isMention = mentionSet.has(member.userId);
      const isReply = ctx.replyToSenderId === member.userId;

      let type: NotificationType = "MESSAGE";
      let title = "New message";
      let kind = "message";

      if (isMention) {
        type = "MENTION";
        title = `${ctx.senderName} mentioned you`;
        kind = "mention";
      } else if (isReply) {
        type = "MESSAGE";
        title = `${ctx.senderName} replied to you`;
        kind = "reply";
      } else if (ctx.conversationType === "DIRECT") {
        title = `Message from ${ctx.senderName}`;
        kind = "direct_message";
      } else {
        title = `New message from ${ctx.senderName}`;
        kind = "group_message";
      }

      rows.push({
        userId: member.userId,
        type,
        title,
        body: ctx.contentPreview || "New message",
        conversationId: ctx.conversationId,
        messageId: ctx.messageId,
        dedupeKey: `message:${ctx.messageId}:user:${member.userId}:${kind}`,
        payload: {
          kind,
          actorUserId: ctx.senderId,
        },
      });
    }

    return rows;
  }

  private async buildReactionRows(
    input: CreateNotificationJobInput
  ): Promise<CreateNotificationRow[]> {
    if (!input.messageId || !input.actorUserId || !input.targetUserId) {
      return [];
    }
    if (input.actorUserId === input.targetUserId) {
      return [];
    }
    if (this.isBlocked(input.actorUserId, input.targetUserId)) {
      return [];
    }

    const ctx = await this.repository.findMessageFanoutContext(input.messageId);
    if (!ctx || !this.isConversationNotifiable(ctx)) {
      return [];
    }

    const member = ctx.members.find((m) => m.userId === input.targetUserId);
    if (!member || !this.shouldNotifyMember(input.actorUserId, member)) {
      return [];
    }

    const actorName =
      (await this.repository.findActiveUserName(input.actorUserId)) ?? "Someone";

    return [
      {
        userId: input.targetUserId,
        type: "SYSTEM",
        title: `${actorName} reacted to your message`,
        body: "New reaction",
        conversationId: ctx.conversationId,
        messageId: ctx.messageId,
        dedupeKey: `reaction:${ctx.messageId}:actor:${input.actorUserId}:user:${input.targetUserId}`,
        payload: {
          kind: "reaction",
          actorUserId: input.actorUserId,
        },
      },
    ];
  }

  private async buildMemberTargetRows(
    input: CreateNotificationJobInput,
    type: NotificationType,
    mode: "added" | "removed" | "role"
  ): Promise<CreateNotificationRow[]> {
    const conversationId = input.conversationId;
    const targetUserId = input.targetUserId;
    if (!conversationId || !targetUserId) {
      return [];
    }
    if (input.actorUserId && input.actorUserId === targetUserId) {
      return [];
    }

    const ctx = await this.repository.findMemberFanoutContext(conversationId);
    if (!ctx || !this.isConversationActive(ctx)) {
      return [];
    }

    // Target may already be removed — still notify them for removed/role if user active.
    const targetNameOk = await this.repository.findActiveUserName(targetUserId);
    if (!targetNameOk) {
      return [];
    }

    // For "added"/invite: respect mute of target if they are still a member.
    const membership = ctx.members.find((m) => m.userId === targetUserId);
    if (mode === "added" && membership?.muted) {
      return [];
    }

    const groupLabel = ctx.conversationName ?? "a group";
    const actorName = input.actorUserId
      ? ((await this.repository.findActiveUserName(input.actorUserId)) ??
        "Someone")
      : "Someone";

    let title = "Group update";
    let body = "Your group membership was updated";
    if (mode === "added") {
      title = `Added to ${groupLabel}`;
      body = `${actorName} added you to the group`;
    } else if (mode === "removed") {
      title = `Removed from ${groupLabel}`;
      body = `${actorName} removed you from the group`;
    } else {
      title = `Role updated in ${groupLabel}`;
      body = `${actorName} changed your role${input.role ? ` to ${input.role}` : ""}`;
    }

    return [
      {
        userId: targetUserId,
        type,
        title,
        body,
        conversationId,
        dedupeKey: `group:${conversationId}:${mode}:user:${targetUserId}:actor:${input.actorUserId ?? "system"}`,
        payload: {
          kind: mode,
          actorUserId: input.actorUserId,
          role: input.role,
        },
      },
    ];
  }

  private async buildMemberLeftRows(
    input: CreateNotificationJobInput
  ): Promise<CreateNotificationRow[]> {
    const conversationId = input.conversationId;
    const leftUserId = input.targetUserId ?? input.actorUserId;
    if (!conversationId || !leftUserId) {
      return [];
    }

    const ctx = await this.repository.findMemberFanoutContext(conversationId);
    if (!ctx || !this.isConversationActive(ctx)) {
      return [];
    }

    const leftName =
      (await this.repository.findActiveUserName(leftUserId)) ?? "A member";
    const groupLabel = ctx.conversationName ?? "the group";

    const rows: CreateNotificationRow[] = [];
    for (const member of ctx.members) {
      if (!this.shouldNotifyMember(leftUserId, member)) {
        continue;
      }
      rows.push({
        userId: member.userId,
        type: "GROUP_UPDATE",
        title: `${leftName} left ${groupLabel}`,
        body: "Member left the group",
        conversationId,
        dedupeKey: `group:${conversationId}:left:${leftUserId}:user:${member.userId}`,
        payload: { kind: "member.left", actorUserId: leftUserId },
      });
    }
    return rows;
  }

  private async buildOwnershipRows(
    input: CreateNotificationJobInput
  ): Promise<CreateNotificationRow[]> {
    const conversationId = input.conversationId;
    const toUserId = input.toUserId ?? input.targetUserId;
    const fromUserId = input.fromUserId ?? input.actorUserId;
    if (!conversationId || !toUserId) {
      return [];
    }

    const ctx = await this.repository.findMemberFanoutContext(conversationId);
    if (!ctx || !this.isConversationActive(ctx)) {
      return [];
    }

    const groupLabel = ctx.conversationName ?? "the group";
    const rows: CreateNotificationRow[] = [];

    for (const member of ctx.members) {
      if (member.userDeletedAt) {
        continue;
      }
      if (member.muted) {
        continue;
      }
      // New owner gets a notice; former owner too; others get group update.
      // Suppress only if somehow "self-transfer" (already validated upstream).
      const isNewOwner = member.userId === toUserId;
      const isFormer = member.userId === fromUserId;
      const title = isNewOwner
        ? `You are now owner of ${groupLabel}`
        : isFormer
          ? `Ownership of ${groupLabel} transferred`
          : `Ownership changed in ${groupLabel}`;

      rows.push({
        userId: member.userId,
        type: "GROUP_UPDATE",
        title,
        body: "Group ownership was transferred",
        conversationId,
        dedupeKey: `group:${conversationId}:ownership:${fromUserId}:${toUserId}:user:${member.userId}`,
        payload: {
          kind: "ownership.transferred",
          fromUserId,
          toUserId,
        },
      });
    }
    return rows;
  }

  private async buildUploadRows(
    input: CreateNotificationJobInput,
    completed: boolean
  ): Promise<CreateNotificationRow[]> {
    if (!input.attachmentId) {
      return [];
    }
    const attachment = await this.repository.findAttachmentContext(
      input.attachmentId
    );
    if (!attachment || attachment.uploaderDeletedAt) {
      return [];
    }

    // Async lifecycle result for the uploader (not a live chat action).
    return [
      {
        userId: attachment.uploaderId,
        type: "SYSTEM",
        title: completed ? "Upload completed" : "Upload failed",
        body: attachment.fileName,
        conversationId: attachment.conversationId,
        dedupeKey: `upload:${attachment.id}:${completed ? "ok" : "fail"}`,
        payload: {
          kind: completed ? "upload.completed" : "upload.failed",
          attachmentId: attachment.id,
        },
      },
    ];
  }

  private async buildSystemRows(
    input: CreateNotificationJobInput
  ): Promise<CreateNotificationRow[]> {
    const recipients = input.recipientUserIds ?? [];
    if (recipients.length === 0 || !input.title) {
      return [];
    }
    return recipients.map((userId) => ({
      userId,
      type: "SYSTEM" as const,
      title: input.title!,
      body: input.body ?? "",
      conversationId: input.conversationId ?? null,
      messageId: input.messageId ?? null,
      dedupeKey: `system:${userId}:${input.title}:${input.body ?? ""}`,
      payload: { kind: "system" },
    }));
  }

  private isConversationNotifiable(
    ctx: Pick<
      MessageFanoutContext,
      "conversationStatus" | "conversationDeletedAt"
    >
  ): boolean {
    if (ctx.conversationDeletedAt) {
      return false;
    }
    if (ctx.conversationStatus === "ARCHIVED") {
      return false;
    }
    return true;
  }

  private isConversationActive(ctx: {
    conversationStatus: string;
    conversationDeletedAt: Date | null;
  }): boolean {
    return this.isConversationNotifiable(ctx);
  }

  private shouldNotifyMember(
    actorUserId: string,
    member: {
      userId: string;
      muted: boolean;
      leftAt: Date | null;
      deletedAt: Date | null;
      userDeletedAt: Date | null;
    }
  ): boolean {
    if (member.userId === actorUserId) {
      return false;
    }
    if (member.leftAt || member.deletedAt || member.userDeletedAt) {
      return false;
    }
    if (member.muted) {
      return false;
    }
    return true;
  }

  /** Future hook for block lists — currently always false. */
  protected isBlocked(_actorUserId: string, _recipientUserId: string): boolean {
    return false;
  }
}
