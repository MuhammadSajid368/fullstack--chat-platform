import {
  Prisma,
  type PrismaClient,
  type MessageType,
  type MessageStatus,
} from "@prisma/client";
import type {
  ActiveMembership,
  ActiveUserRecord,
  AttachmentRecord,
  CreateAuditLogInput,
  DirectSendResult,
  IMessageRepository,
  InsertMessageData,
  MessageCursor,
  MessageRecord,
  SendInConversationResult,
} from "@modules/messages/interfaces/IMessageRepository.js";
import { NotActiveMemberError } from "@modules/messages/interfaces/IMessageRepository.js";

const messageSelect = {
  id: true,
  conversationId: true,
  senderId: true,
  type: true,
  status: true,
  content: true,
  clientMessageId: true,
  replyToMessageId: true,
  linkPreview: true,
  metadata: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MessageSelect;

const attachmentSelect = {
  id: true,
  conversationId: true,
  messageId: true,
  uploaderId: true,
  status: true,
  virusScanStatus: true,
  storageKey: true,
  bucket: true,
  mimeType: true,
  fileName: true,
  byteSize: true,
  width: true,
  height: true,
  durationMs: true,
  thumbnailKey: true,
  deletedAt: true,
} satisfies Prisma.FutureAttachmentSelect;

function toJson(
  value: Record<string, unknown> | undefined
): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value as Prisma.InputJsonValue;
}

function mapMessage(
  row: Prisma.MessageGetPayload<{ select: typeof messageSelect }>
): MessageRecord {
  return { ...row };
}

function mapAttachment(
  row: Prisma.FutureAttachmentGetPayload<{ select: typeof attachmentSelect }>
): AttachmentRecord {
  return {
    ...row,
    status: String(row.status),
    virusScanStatus: String(row.virusScanStatus),
  };
}

function isNewerLastMessage(
  candidateAt: Date,
  candidateId: string,
  currentAt: Date | null,
  currentId: string | null
): boolean {
  if (currentAt == null) {
    return true;
  }
  const candidateMs = candidateAt.getTime();
  const currentMs = currentAt.getTime();
  if (candidateMs > currentMs) {
    return true;
  }
  if (candidateMs < currentMs) {
    return false;
  }
  return candidateId > (currentId ?? "");
}

/**
 * Message repository — Prisma only.
 */
export class MessageRepository implements IMessageRepository {
  constructor(protected readonly prisma: PrismaClient) {}

  async findActiveMembership(
    userId: string,
    conversationId: string
  ): Promise<ActiveMembership | null> {
    return this.prisma.conversationMember.findFirst({
      where: {
        userId,
        conversationId,
        leftAt: null,
        deletedAt: null,
        conversation: {
          deletedAt: null,
          status: "ACTIVE",
        },
      },
      select: {
        id: true,
        conversationId: true,
        userId: true,
        role: true,
        leftAt: true,
        deletedAt: true,
      },
    });
  }

  async listActiveMemberUserIds(conversationId: string): Promise<string[]> {
    const rows = await this.prisma.conversationMember.findMany({
      where: {
        conversationId,
        leftAt: null,
        deletedAt: null,
      },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  async listActiveMemberUnread(
    conversationId: string
  ): Promise<Array<{ userId: string; unreadCount: number }>> {
    const rows = await this.prisma.conversationMember.findMany({
      where: {
        conversationId,
        leftAt: null,
        deletedAt: null,
      },
      select: { userId: true, unreadCount: true },
    });
    return rows.map((row) => ({
      userId: row.userId,
      unreadCount: row.unreadCount,
    }));
  }

  async findActiveUserById(userId: string): Promise<ActiveUserRecord | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
      select: { id: true },
    });
    return user;
  }

  async findMessageById(messageId: string): Promise<MessageRecord | null> {
    const row = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: messageSelect,
    });
    return row ? mapMessage(row) : null;
  }

  async findReplyInConversation(
    replyToMessageId: string,
    conversationId: string
  ): Promise<MessageRecord | null> {
    const row = await this.prisma.message.findFirst({
      where: {
        id: replyToMessageId,
        conversationId,
        deletedAt: null,
      },
      select: messageSelect,
    });
    return row ? mapMessage(row) : null;
  }

  async listMessagesKeyset(input: {
    conversationId: string;
    cursor?: MessageCursor;
    limit: number;
  }): Promise<MessageRecord[]> {
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId: input.conversationId,
        deletedAt: null,
        ...(input.cursor
          ? {
              OR: [
                { createdAt: { lt: input.cursor.createdAt } },
                {
                  AND: [
                    { createdAt: input.cursor.createdAt },
                    { id: { lt: input.cursor.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      select: messageSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
    });
    return rows.map(mapMessage);
  }

  async findViewerStars(
    userId: string,
    messageIds: string[]
  ): Promise<Set<string>> {
    if (messageIds.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.starredMessage.findMany({
      where: {
        userId,
        messageId: { in: messageIds },
        deletedAt: null,
      },
      select: { messageId: true },
    });
    return new Set(rows.map((r) => r.messageId));
  }

  async findPinnedMessageIds(
    conversationId: string,
    messageIds: string[]
  ): Promise<Set<string>> {
    if (messageIds.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.pinnedMessage.findMany({
      where: {
        conversationId,
        messageId: { in: messageIds },
      },
      select: { messageId: true },
    });
    return new Set(rows.map((r) => r.messageId));
  }

  async findAttachmentsByMessageIds(
    messageIds: string[]
  ): Promise<Map<string, AttachmentRecord[]>> {
    const map = new Map<string, AttachmentRecord[]>();
    if (messageIds.length === 0) {
      return map;
    }
    const rows = await this.prisma.futureAttachment.findMany({
      where: {
        messageId: { in: messageIds },
        deletedAt: null,
      },
      select: attachmentSelect,
    });
    for (const row of rows) {
      if (!row.messageId) {
        continue;
      }
      const list = map.get(row.messageId) ?? [];
      list.push(mapAttachment(row));
      map.set(row.messageId, list);
    }
    return map;
  }

  async findReadyAttachmentsForSender(input: {
    attachmentIds: string[];
    uploaderId: string;
    conversationId: string | null;
  }): Promise<AttachmentRecord[]> {
    if (input.attachmentIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.futureAttachment.findMany({
      where: {
        id: { in: input.attachmentIds },
        uploaderId: input.uploaderId,
        status: "READY",
        virusScanStatus: { in: ["CLEAN", "SKIPPED"] },
        deletedAt: null,
        messageId: null,
        ...(input.conversationId == null
          ? { conversationId: null }
          : {
              OR: [
                { conversationId: null },
                { conversationId: input.conversationId },
              ],
            }),
      },
      select: attachmentSelect,
    });
    return rows.map(mapAttachment);
  }

  async sendInConversation(input: {
    data: InsertMessageData;
    attachmentIds: string[];
    preview: string;
    audit: CreateAuditLogInput;
  }): Promise<SendInConversationResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertActiveMemberInTx(
          tx,
          input.data.senderId,
          input.data.conversationId
        );

        const existing = await tx.message.findFirst({
          where: {
            conversationId: input.data.conversationId,
            clientMessageId: input.data.clientMessageId,
          },
          select: messageSelect,
        });
        if (existing) {
          return { message: mapMessage(existing), created: false };
        }

        const created = await tx.message.create({
          data: {
            conversationId: input.data.conversationId,
            senderId: input.data.senderId,
            type: input.data.type,
            status: input.data.status,
            content: input.data.content,
            clientMessageId: input.data.clientMessageId,
            replyToMessageId: input.data.replyToMessageId ?? null,
            linkPreview: input.data.linkPreview ?? undefined,
            metadata: input.data.metadata ?? undefined,
          },
          select: messageSelect,
        });

        await this.bindAttachments(
          tx,
          created.id,
          input.data.conversationId,
          input.data.senderId,
          input.attachmentIds
        );

        await this.applyLastMessageAndUnread(
          tx,
          input.data.conversationId,
          created.id,
          input.preview,
          created.createdAt,
          input.data.senderId
        );

        await tx.auditLog.create({
          data: {
            actorId: input.audit.actorId,
            action: input.audit.action,
            entityType: input.audit.entityType,
            entityId: input.audit.entityId ?? created.id,
            metadata: toJson(input.audit.metadata),
            ipAddress: input.audit.ipAddress,
            userAgent: input.audit.userAgent,
          },
        });

        return { message: mapMessage(created), created: true };
      });
    } catch (err) {
      if (err instanceof NotActiveMemberError) {
        throw err;
      }
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const existing = await this.prisma.message.findFirst({
          where: {
            conversationId: input.data.conversationId,
            clientMessageId: input.data.clientMessageId,
          },
          select: messageSelect,
        });
        if (existing) {
          return { message: mapMessage(existing), created: false };
        }
      }
      throw err;
    }
  }

  async sendDirectFirstMessage(input: {
    senderId: string;
    peerUserId: string;
    pairKey: string;
    data: Omit<InsertMessageData, "conversationId">;
    attachmentIds: string[];
    preview: string;
    createConversationAudit: CreateAuditLogInput;
    sendAudit: CreateAuditLogInput;
  }): Promise<DirectSendResult> {
    const maxAttempts = 3;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          let conversation = await tx.conversation.findFirst({
            where: {
              directPairKey: input.pairKey,
              deletedAt: null,
              type: "DIRECT",
            },
          });

          let conversationCreated = false;

          if (!conversation) {
            // Never catch P2002 and continue in this TX — Postgres aborts the TX.
            conversation = await tx.conversation.create({
              data: {
                type: "DIRECT",
                status: "ACTIVE",
                directPairKey: input.pairKey,
                createdById: input.senderId,
              },
            });
            conversationCreated = true;

            await tx.conversationMember.createMany({
              data: [
                {
                  conversationId: conversation.id,
                  userId: input.senderId,
                  role: "MEMBER",
                },
                {
                  conversationId: conversation.id,
                  userId: input.peerUserId,
                  role: "MEMBER",
                },
              ],
            });

            await tx.auditLog.create({
              data: {
                actorId: input.createConversationAudit.actorId,
                action: input.createConversationAudit.action,
                entityType: input.createConversationAudit.entityType,
                entityId: conversation.id,
                metadata: toJson(input.createConversationAudit.metadata),
                ipAddress: input.createConversationAudit.ipAddress,
                userAgent: input.createConversationAudit.userAgent,
              },
            });
          }

          await this.ensureDirectMemberships(
            tx,
            conversation.id,
            input.senderId,
            input.peerUserId
          );

          const existing = await tx.message.findFirst({
            where: {
              conversationId: conversation.id,
              clientMessageId: input.data.clientMessageId,
            },
            select: messageSelect,
          });
          if (existing) {
            return {
              conversationId: conversation.id,
              message: mapMessage(existing),
              created: false,
              conversationCreated,
            };
          }

          // Never catch P2002 and continue in this TX.
          const created = await tx.message.create({
            data: {
              conversationId: conversation.id,
              senderId: input.data.senderId,
              type: input.data.type,
              status: input.data.status,
              content: input.data.content,
              clientMessageId: input.data.clientMessageId,
              replyToMessageId: input.data.replyToMessageId ?? null,
              linkPreview: input.data.linkPreview ?? undefined,
              metadata: input.data.metadata ?? undefined,
            },
            select: messageSelect,
          });

          await this.bindAttachments(
            tx,
            created.id,
            conversation.id,
            input.data.senderId,
            input.attachmentIds
          );

          await this.applyLastMessageAndUnread(
            tx,
            conversation.id,
            created.id,
            input.preview,
            created.createdAt,
            input.data.senderId
          );

          await tx.auditLog.create({
            data: {
              actorId: input.sendAudit.actorId,
              action: input.sendAudit.action,
              entityType: input.sendAudit.entityType,
              entityId: created.id,
              metadata: toJson(input.sendAudit.metadata),
              ipAddress: input.sendAudit.ipAddress,
              userAgent: input.sendAudit.userAgent,
            },
          });

          return {
            conversationId: conversation.id,
            message: mapMessage(created),
            created: true,
            conversationCreated,
          };
        });
      } catch (err) {
        lastError = err;
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          // Rolled-back TX — recover in a NEW query path outside that TX.
          const recovered = await this.recoverDirectAfterUniqueConflict(input);
          if (recovered) {
            return recovered;
          }
          continue;
        }
        throw err;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("DIRECT send failed after retries");
  }

  /**
   * Post-P2002 recovery outside the aborted transaction.
   * Returns existing message if present; otherwise null to retry create path.
   */
  private async recoverDirectAfterUniqueConflict(input: {
    pairKey: string;
    data: Omit<InsertMessageData, "conversationId">;
  }): Promise<DirectSendResult | null> {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        directPairKey: input.pairKey,
        deletedAt: null,
        type: "DIRECT",
      },
    });
    if (!conversation) {
      return null;
    }

    const existing = await this.prisma.message.findFirst({
      where: {
        conversationId: conversation.id,
        clientMessageId: input.data.clientMessageId,
      },
      select: messageSelect,
    });
    if (existing) {
      return {
        conversationId: conversation.id,
        message: mapMessage(existing),
        created: false,
        conversationCreated: false,
      };
    }

    return null;
  }

  async retryFailedMessage(input: {
    messageId: string;
    senderId: string;
    audit: CreateAuditLogInput;
  }): Promise<MessageRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.message.findFirst({
        where: {
          id: input.messageId,
          senderId: input.senderId,
          status: "FAILED",
          deletedAt: null,
        },
        select: messageSelect,
      });
      if (!message) {
        return null;
      }

      const updated = await tx.message.update({
        where: { id: message.id },
        data: { status: "SENT" },
        select: messageSelect,
      });

      await tx.auditLog.create({
        data: {
          actorId: input.audit.actorId,
          action: input.audit.action,
          entityType: input.audit.entityType,
          entityId: input.audit.entityId ?? message.id,
          metadata: toJson(input.audit.metadata),
          ipAddress: input.audit.ipAddress,
          userAgent: input.audit.userAgent,
        },
      });

      return mapMessage(updated);
    });
  }

  async softDeleteMessage(input: {
    messageId: string;
    audit: CreateAuditLogInput;
  }): Promise<MessageRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.message.findUnique({
        where: { id: input.messageId },
        select: messageSelect,
      });
      if (!message || message.deletedAt) {
        return null;
      }

      const updated = await tx.message.update({
        where: { id: message.id },
        data: {
          deletedAt: new Date(),
          content: "",
        },
        select: messageSelect,
      });

      // Lock conversation so concurrent send/delete cannot corrupt lastMessage*.
      const locked = await tx.$queryRaw<
        Array<{
          id: string;
          lastMessageId: string | null;
        }>
      >`
        SELECT id, "lastMessageId"
        FROM conversations
        WHERE id = ${message.conversationId}
        FOR UPDATE
      `;

      const conversation = locked[0];
      if (conversation?.lastMessageId === message.id) {
        const previous = await tx.message.findFirst({
          where: {
            conversationId: message.conversationId,
            deletedAt: null,
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: messageSelect,
        });

        await tx.conversation.update({
          where: { id: message.conversationId },
          data: previous
            ? {
                lastMessageId: previous.id,
                lastMessagePreview: previous.content.slice(0, 280) || "Message",
                lastMessageAt: previous.createdAt,
              }
            : {
                lastMessageId: null,
                lastMessagePreview: null,
                lastMessageAt: null,
              },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: input.audit.actorId,
          action: input.audit.action,
          entityType: input.audit.entityType,
          entityId: input.audit.entityId ?? message.id,
          metadata: toJson(input.audit.metadata),
          ipAddress: input.audit.ipAddress,
          userAgent: input.audit.userAgent,
        },
      });

      return mapMessage(updated);
    });
  }

  async starMessage(input: {
    userId: string;
    messageId: string;
    audit: CreateAuditLogInput;
  }): Promise<boolean> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.starredMessage.findUnique({
        where: {
          messageId_userId: {
            messageId: input.messageId,
            userId: input.userId,
          },
        },
      });

      if (existing) {
        if (existing.deletedAt) {
          await tx.starredMessage.update({
            where: { id: existing.id },
            data: { deletedAt: null },
          });
        }
      } else {
        await tx.starredMessage.create({
          data: {
            messageId: input.messageId,
            userId: input.userId,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: input.audit.actorId,
          action: input.audit.action,
          entityType: input.audit.entityType,
          entityId: input.audit.entityId ?? input.messageId,
          metadata: toJson(input.audit.metadata),
          ipAddress: input.audit.ipAddress,
          userAgent: input.audit.userAgent,
        },
      });
    });
    return true;
  }

  async unstarMessage(input: {
    userId: string;
    messageId: string;
    audit: CreateAuditLogInput;
  }): Promise<boolean> {
    await this.prisma.$transaction(async (tx) => {
      await tx.starredMessage.updateMany({
        where: {
          messageId: input.messageId,
          userId: input.userId,
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          actorId: input.audit.actorId,
          action: input.audit.action,
          entityType: input.audit.entityType,
          entityId: input.audit.entityId ?? input.messageId,
          metadata: toJson(input.audit.metadata),
          ipAddress: input.audit.ipAddress,
          userAgent: input.audit.userAgent,
        },
      });
    });
    return true;
  }

  async pinMessage(input: {
    userId: string;
    messageId: string;
    conversationId: string;
    audit: CreateAuditLogInput;
  }): Promise<boolean> {
    await this.prisma.$transaction(async (tx) => {
      await tx.pinnedMessage.upsert({
        where: {
          conversationId_messageId: {
            conversationId: input.conversationId,
            messageId: input.messageId,
          },
        },
        create: {
          conversationId: input.conversationId,
          messageId: input.messageId,
          pinnedById: input.userId,
          position: 0,
        },
        update: {
          pinnedById: input.userId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: input.audit.actorId,
          action: input.audit.action,
          entityType: input.audit.entityType,
          entityId: input.audit.entityId ?? input.messageId,
          metadata: toJson(input.audit.metadata),
          ipAddress: input.audit.ipAddress,
          userAgent: input.audit.userAgent,
        },
      });
    });
    return true;
  }

  async unpinMessage(input: {
    messageId: string;
    conversationId: string;
    audit: CreateAuditLogInput;
  }): Promise<boolean> {
    await this.prisma.$transaction(async (tx) => {
      await tx.pinnedMessage.deleteMany({
        where: {
          conversationId: input.conversationId,
          messageId: input.messageId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: input.audit.actorId,
          action: input.audit.action,
          entityType: input.audit.entityType,
          entityId: input.audit.entityId ?? input.messageId,
          metadata: toJson(input.audit.metadata),
          ipAddress: input.audit.ipAddress,
          userAgent: input.audit.userAgent,
        },
      });
    });
    return true;
  }

  private async assertActiveMemberInTx(
    tx: Prisma.TransactionClient,
    userId: string,
    conversationId: string
  ): Promise<void> {
    const membership = await tx.conversationMember.findFirst({
      where: {
        userId,
        conversationId,
        leftAt: null,
        deletedAt: null,
        conversation: {
          deletedAt: null,
          status: "ACTIVE",
        },
      },
      select: { id: true },
    });
    if (!membership) {
      throw new NotActiveMemberError();
    }
  }

  private async bindAttachments(
    tx: Prisma.TransactionClient,
    messageId: string,
    conversationId: string,
    uploaderId: string,
    attachmentIds: string[]
  ): Promise<void> {
    if (attachmentIds.length === 0) {
      return;
    }

    const updated = await tx.futureAttachment.updateMany({
      where: {
        id: { in: attachmentIds },
        uploaderId,
        status: "READY",
        virusScanStatus: { in: ["CLEAN", "SKIPPED"] },
        deletedAt: null,
        OR: [{ messageId: null }, { messageId }],
        AND: [
          {
            OR: [{ conversationId: null }, { conversationId }],
          },
        ],
      },
      data: {
        messageId,
        conversationId,
      },
    });

    if (updated.count !== attachmentIds.length) {
      throw new Error("ATTACHMENT_BIND_FAILED");
    }
  }

  /**
   * Lock conversation row, then CAS lastMessage* so the newest message wins.
   */
  private async applyLastMessageAndUnread(
    tx: Prisma.TransactionClient,
    conversationId: string,
    messageId: string,
    preview: string,
    createdAt: Date,
    senderId: string
  ): Promise<void> {
    const locked = await tx.$queryRaw<
      Array<{
        id: string;
        lastMessageAt: Date | null;
        lastMessageId: string | null;
      }>
    >`
      SELECT id, "lastMessageAt", "lastMessageId"
      FROM conversations
      WHERE id = ${conversationId}
      FOR UPDATE
    `;

    const current = locked[0];
    if (!current) {
      throw new Error("CONVERSATION_MISSING");
    }

    if (
      isNewerLastMessage(
        createdAt,
        messageId,
        current.lastMessageAt,
        current.lastMessageId
      )
    ) {
      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageId: messageId,
          lastMessagePreview: preview.slice(0, 280),
          lastMessageAt: createdAt,
        },
      });
    }

    await tx.conversationMember.updateMany({
      where: {
        conversationId,
        leftAt: null,
        deletedAt: null,
        userId: { not: senderId },
      },
      data: {
        unreadCount: { increment: 1 },
      },
    });
  }

  private async ensureDirectMemberships(
    tx: Prisma.TransactionClient,
    conversationId: string,
    senderId: string,
    peerUserId: string
  ): Promise<void> {
    for (const userId of [senderId, peerUserId]) {
      const active = await tx.conversationMember.findFirst({
        where: {
          conversationId,
          userId,
          leftAt: null,
          deletedAt: null,
        },
      });
      if (!active) {
        await tx.conversationMember.create({
          data: {
            conversationId,
            userId,
            role: "MEMBER",
          },
        });
      }
    }
  }
}

// silence unused type imports if tree-shaken oddly
export type { MessageType, MessageStatus };
