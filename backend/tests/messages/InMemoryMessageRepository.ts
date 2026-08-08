import { randomUUID } from "node:crypto";
import type {
  MessageStatus,
  MessageType,
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
} from "../../src/modules/messages/interfaces/IMessageRepository.js";
import { NotActiveMemberError } from "../../src/modules/messages/interfaces/IMessageRepository.js";

export type InMemoryConversation = {
  id: string;
  type: "DIRECT" | "GROUP";
  status: "ACTIVE" | "ARCHIVED";
  directPairKey: string | null;
  createdById: string | null;
  lastMessageId: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: Date | null;
  deletedAt: Date | null;
};

export type InMemoryMember = {
  id: string;
  conversationId: string;
  userId: string;
  role: string;
  unreadCount: number;
  leftAt: Date | null;
  deletedAt: Date | null;
};

export type InMemoryUser = {
  id: string;
  deletedAt: Date | null;
};

export type InMemoryStar = {
  id: string;
  messageId: string;
  userId: string;
  deletedAt: Date | null;
};

export type InMemoryPin = {
  id: string;
  conversationId: string;
  messageId: string;
  pinnedById: string;
};

function cloneMessage(m: MessageRecord): MessageRecord {
  return { ...m };
}

function cloneAttachment(a: AttachmentRecord): AttachmentRecord {
  return { ...a };
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
 * In-memory message repository for unit / HTTP / concurrency tests.
 * Mirrors Prisma uniqueness + DIRECT CAS compare-and-retry behaviour.
 */
export class InMemoryMessageRepository implements IMessageRepository {
  conversations = new Map<string, InMemoryConversation>();
  members = new Map<string, InMemoryMember>();
  users = new Map<string, InMemoryUser>();
  messages = new Map<string, MessageRecord>();
  attachments = new Map<string, AttachmentRecord>();
  stars = new Map<string, InMemoryStar>();
  pins = new Map<string, InMemoryPin>();
  auditLogs: CreateAuditLogInput[] = [];

  /** Simulates brief lock contention for concurrent DIRECT creates / idempotent sends. */
  private pairLocks = new Map<string, Promise<void>>();
  private idempotencyLocks = new Map<string, Promise<void>>();
  private conversationLocks = new Map<string, Promise<void>>();

  seedConversation(c: InMemoryConversation): void {
    this.conversations.set(c.id, { ...c });
  }

  seedMember(m: InMemoryMember): void {
    this.members.set(m.id, { ...m });
  }

  seedUser(user: InMemoryUser): void {
    this.users.set(user.id, { ...user });
  }

  seedMessage(m: MessageRecord): void {
    this.messages.set(m.id, cloneMessage(m));
  }

  seedAttachment(a: AttachmentRecord): void {
    this.attachments.set(a.id, cloneAttachment(a));
  }

  async findActiveMembership(
    userId: string,
    conversationId: string
  ): Promise<ActiveMembership | null> {
    const conversation = this.conversations.get(conversationId);
    if (
      !conversation ||
      conversation.deletedAt != null ||
      conversation.status !== "ACTIVE"
    ) {
      return null;
    }
    const member = [...this.members.values()].find(
      (m) =>
        m.userId === userId &&
        m.conversationId === conversationId &&
        m.leftAt == null &&
        m.deletedAt == null
    );
    return member
      ? {
          id: member.id,
          conversationId: member.conversationId,
          userId: member.userId,
          role: member.role,
          leftAt: member.leftAt,
          deletedAt: member.deletedAt,
        }
      : null;
  }

  async listActiveMemberUserIds(conversationId: string): Promise<string[]> {
    return [...this.members.values()]
      .filter(
        (m) =>
          m.conversationId === conversationId &&
          m.leftAt == null &&
          m.deletedAt == null
      )
      .map((m) => m.userId);
  }

  async listActiveMemberUnread(
    conversationId: string
  ): Promise<Array<{ userId: string; unreadCount: number }>> {
    return [...this.members.values()]
      .filter(
        (m) =>
          m.conversationId === conversationId &&
          m.leftAt == null &&
          m.deletedAt == null
      )
      .map((m) => ({
        userId: m.userId,
        unreadCount: m.unreadCount,
      }));
  }

  async findActiveUserById(userId: string): Promise<ActiveUserRecord | null> {
    const user = this.users.get(userId);
    if (!user || user.deletedAt != null) {
      return null;
    }
    return { id: user.id };
  }

  async findMessageById(messageId: string): Promise<MessageRecord | null> {
    const m = this.messages.get(messageId);
    return m ? cloneMessage(m) : null;
  }

  async findReplyInConversation(
    replyToMessageId: string,
    conversationId: string
  ): Promise<MessageRecord | null> {
    const m = this.messages.get(replyToMessageId);
    if (!m || m.conversationId !== conversationId || m.deletedAt) {
      return null;
    }
    return cloneMessage(m);
  }

  async listMessagesKeyset(input: {
    conversationId: string;
    cursor?: MessageCursor;
    limit: number;
  }): Promise<MessageRecord[]> {
    let rows = [...this.messages.values()].filter(
      (m) => m.conversationId === input.conversationId && m.deletedAt == null
    );

    if (input.cursor) {
      const { createdAt, id } = input.cursor;
      rows = rows.filter((m) => {
        if (m.createdAt.getTime() < createdAt.getTime()) {
          return true;
        }
        if (m.createdAt.getTime() === createdAt.getTime() && m.id < id) {
          return true;
        }
        return false;
      });
    }

    rows.sort((a, b) => {
      const t = b.createdAt.getTime() - a.createdAt.getTime();
      if (t !== 0) {
        return t;
      }
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    });

    return rows.slice(0, input.limit + 1).map(cloneMessage);
  }

  async findViewerStars(
    userId: string,
    messageIds: string[]
  ): Promise<Set<string>> {
    const set = new Set<string>();
    for (const s of this.stars.values()) {
      if (
        s.userId === userId &&
        s.deletedAt == null &&
        messageIds.includes(s.messageId)
      ) {
        set.add(s.messageId);
      }
    }
    return set;
  }

  async findPinnedMessageIds(
    conversationId: string,
    messageIds: string[]
  ): Promise<Set<string>> {
    const set = new Set<string>();
    for (const p of this.pins.values()) {
      if (
        p.conversationId === conversationId &&
        messageIds.includes(p.messageId)
      ) {
        set.add(p.messageId);
      }
    }
    return set;
  }

  async findAttachmentsByMessageIds(
    messageIds: string[]
  ): Promise<Map<string, AttachmentRecord[]>> {
    const map = new Map<string, AttachmentRecord[]>();
    for (const a of this.attachments.values()) {
      if (a.messageId && messageIds.includes(a.messageId) && a.deletedAt == null) {
        const list = map.get(a.messageId) ?? [];
        list.push(cloneAttachment(a));
        map.set(a.messageId, list);
      }
    }
    return map;
  }

  async findReadyAttachmentsForSender(input: {
    attachmentIds: string[];
    uploaderId: string;
    conversationId: string | null;
  }): Promise<AttachmentRecord[]> {
    return input.attachmentIds
      .map((id) => this.attachments.get(id))
      .filter((a): a is AttachmentRecord => {
        if (!a) {
          return false;
        }
        if (
          a.uploaderId !== input.uploaderId ||
          a.status !== "READY" ||
          (a.virusScanStatus !== "CLEAN" && a.virusScanStatus !== "SKIPPED") ||
          a.deletedAt != null ||
          a.messageId != null
        ) {
          return false;
        }
        if (input.conversationId == null) {
          return a.conversationId == null;
        }
        return (
          a.conversationId == null || a.conversationId === input.conversationId
        );
      })
      .map(cloneAttachment);
  }

  async sendInConversation(input: {
    data: InsertMessageData;
    attachmentIds: string[];
    preview: string;
    audit: CreateAuditLogInput;
  }): Promise<SendInConversationResult> {
    const lockKey = `${input.data.conversationId}:${input.data.clientMessageId}`;
    return this.withLock(this.idempotencyLocks, lockKey, () =>
      this.withLock(this.conversationLocks, input.data.conversationId, () => {
        const membershipActive = [...this.members.values()].some(
          (m) =>
            m.userId === input.data.senderId &&
            m.conversationId === input.data.conversationId &&
            m.leftAt == null &&
            m.deletedAt == null
        );
        const conversation = this.conversations.get(input.data.conversationId);
        if (
          !membershipActive ||
          !conversation ||
          conversation.deletedAt != null ||
          conversation.status !== "ACTIVE"
        ) {
          throw new NotActiveMemberError();
        }

        const existing = this.findByClientId(
          input.data.conversationId,
          input.data.clientMessageId
        );
        if (existing) {
          return { message: cloneMessage(existing), created: false };
        }

        const created = this.insertMessage(input.data);
        this.bindAttachments(
          created.id,
          input.data.conversationId,
          input.data.senderId,
          input.attachmentIds
        );
        this.applyLastMessageAndUnread(
          input.data.conversationId,
          created.id,
          input.preview,
          created.createdAt,
          input.data.senderId
        );
        this.auditLogs.push({ ...input.audit, entityId: created.id });
        return { message: cloneMessage(created), created: true };
      })
    );
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
        return await this.withLock(this.pairLocks, input.pairKey, async () => {
          let conversation = [...this.conversations.values()].find(
            (c) =>
              c.directPairKey === input.pairKey &&
              c.deletedAt == null &&
              c.type === "DIRECT"
          );

          let conversationCreated = false;

          if (!conversation) {
            conversation = {
              id: `conv_${randomUUID()}`,
              type: "DIRECT",
              status: "ACTIVE",
              directPairKey: input.pairKey,
              createdById: input.senderId,
              lastMessageId: null,
              lastMessagePreview: null,
              lastMessageAt: null,
              deletedAt: null,
            };
            this.conversations.set(conversation.id, conversation);
            conversationCreated = true;

            this.seedMember({
              id: `mem_${randomUUID()}`,
              conversationId: conversation.id,
              userId: input.senderId,
              role: "MEMBER",
              unreadCount: 0,
              leftAt: null,
              deletedAt: null,
            });
            this.seedMember({
              id: `mem_${randomUUID()}`,
              conversationId: conversation.id,
              userId: input.peerUserId,
              role: "MEMBER",
              unreadCount: 0,
              leftAt: null,
              deletedAt: null,
            });

            this.auditLogs.push({
              ...input.createConversationAudit,
              entityId: conversation.id,
            });
          }

          this.ensureDirectMemberships(
            conversation.id,
            input.senderId,
            input.peerUserId
          );

          const existing = this.findByClientId(
            conversation.id,
            input.data.clientMessageId
          );
          if (existing) {
            return {
              conversationId: conversation.id,
              message: cloneMessage(existing),
              created: false,
              conversationCreated,
            };
          }

          return this.withLock(
            this.conversationLocks,
            conversation.id,
            () => {
              const created = this.insertMessage({
                ...input.data,
                conversationId: conversation!.id,
              });
              this.bindAttachments(
                created.id,
                conversation!.id,
                input.data.senderId,
                input.attachmentIds
              );
              this.applyLastMessageAndUnread(
                conversation!.id,
                created.id,
                input.preview,
                created.createdAt,
                input.data.senderId
              );
              this.auditLogs.push({ ...input.sendAudit, entityId: created.id });

              return {
                conversationId: conversation!.id,
                message: cloneMessage(created),
                created: true,
                conversationCreated,
              };
            }
          );
        });
      } catch (err) {
        lastError = err;
        if (err instanceof Error && err.message === "PAIR_RACE") {
          continue;
        }
        throw err;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("DIRECT send failed after retries");
  }

  async retryFailedMessage(input: {
    messageId: string;
    senderId: string;
    audit: CreateAuditLogInput;
  }): Promise<MessageRecord | null> {
    const message = this.messages.get(input.messageId);
    if (
      !message ||
      message.senderId !== input.senderId ||
      message.status !== "FAILED" ||
      message.deletedAt
    ) {
      return null;
    }
    message.status = "SENT";
    message.updatedAt = new Date();
    this.auditLogs.push({ ...input.audit });
    return cloneMessage(message);
  }

  async softDeleteMessage(input: {
    messageId: string;
    audit: CreateAuditLogInput;
  }): Promise<MessageRecord | null> {
    const message = this.messages.get(input.messageId);
    if (!message || message.deletedAt) {
      return null;
    }

    return this.withLock(this.conversationLocks, message.conversationId, () => {
      const current = this.messages.get(input.messageId);
      if (!current || current.deletedAt) {
        return null;
      }

      current.deletedAt = new Date();
      current.content = "";
      current.updatedAt = new Date();

      const conversation = this.conversations.get(current.conversationId);
      if (conversation?.lastMessageId === current.id) {
        const previous = [...this.messages.values()]
          .filter(
            (m) =>
              m.conversationId === current.conversationId && m.deletedAt == null
          )
          .sort((a, b) => {
            const t = b.createdAt.getTime() - a.createdAt.getTime();
            if (t !== 0) {
              return t;
            }
            return a.id < b.id ? 1 : -1;
          })[0];

        if (previous) {
          conversation.lastMessageId = previous.id;
          conversation.lastMessagePreview =
            previous.content.slice(0, 280) || "Message";
          conversation.lastMessageAt = previous.createdAt;
        } else {
          conversation.lastMessageId = null;
          conversation.lastMessagePreview = null;
          conversation.lastMessageAt = null;
        }
      }

      this.auditLogs.push({ ...input.audit });
      return cloneMessage(current);
    });
  }

  async starMessage(input: {
    userId: string;
    messageId: string;
    audit: CreateAuditLogInput;
  }): Promise<boolean> {
    const key = `${input.messageId}:${input.userId}`;
    const existing = [...this.stars.values()].find(
      (s) => s.messageId === input.messageId && s.userId === input.userId
    );
    if (existing) {
      existing.deletedAt = null;
    } else {
      this.stars.set(key, {
        id: `star_${randomUUID()}`,
        messageId: input.messageId,
        userId: input.userId,
        deletedAt: null,
      });
    }
    this.auditLogs.push({ ...input.audit });
    return true;
  }

  async unstarMessage(input: {
    userId: string;
    messageId: string;
    audit: CreateAuditLogInput;
  }): Promise<boolean> {
    for (const s of this.stars.values()) {
      if (
        s.messageId === input.messageId &&
        s.userId === input.userId &&
        s.deletedAt == null
      ) {
        s.deletedAt = new Date();
      }
    }
    this.auditLogs.push({ ...input.audit });
    return true;
  }

  async pinMessage(input: {
    userId: string;
    messageId: string;
    conversationId: string;
    audit: CreateAuditLogInput;
  }): Promise<boolean> {
    const key = `${input.conversationId}:${input.messageId}`;
    const existing = this.pins.get(key);
    if (existing) {
      existing.pinnedById = input.userId;
    } else {
      this.pins.set(key, {
        id: `pin_${randomUUID()}`,
        conversationId: input.conversationId,
        messageId: input.messageId,
        pinnedById: input.userId,
      });
    }
    this.auditLogs.push({ ...input.audit });
    return true;
  }

  async unpinMessage(input: {
    messageId: string;
    conversationId: string;
    audit: CreateAuditLogInput;
  }): Promise<boolean> {
    this.pins.delete(`${input.conversationId}:${input.messageId}`);
    this.auditLogs.push({ ...input.audit });
    return true;
  }

  private findByClientId(
    conversationId: string,
    clientMessageId: string
  ): MessageRecord | undefined {
    return [...this.messages.values()].find(
      (m) =>
        m.conversationId === conversationId &&
        m.clientMessageId === clientMessageId
    );
  }

  private insertMessage(data: InsertMessageData): MessageRecord {
    const now = new Date();
    const message: MessageRecord = {
      id: `msg_${randomUUID()}`,
      conversationId: data.conversationId,
      senderId: data.senderId,
      type: data.type,
      status: data.status,
      content: data.content,
      clientMessageId: data.clientMessageId,
      replyToMessageId: data.replyToMessageId ?? null,
      linkPreview: (data.linkPreview as MessageRecord["linkPreview"]) ?? null,
      metadata: (data.metadata as MessageRecord["metadata"]) ?? null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.messages.set(message.id, message);
    return message;
  }

  private bindAttachments(
    messageId: string,
    conversationId: string,
    uploaderId: string,
    attachmentIds: string[]
  ): void {
    if (attachmentIds.length === 0) {
      return;
    }
    let bound = 0;
    for (const id of attachmentIds) {
      const a = this.attachments.get(id);
      if (
        a &&
        a.uploaderId === uploaderId &&
        a.status === "READY" &&
        (a.virusScanStatus === "CLEAN" || a.virusScanStatus === "SKIPPED") &&
        a.deletedAt == null &&
        (a.messageId == null || a.messageId === messageId) &&
        (a.conversationId == null || a.conversationId === conversationId)
      ) {
        a.messageId = messageId;
        a.conversationId = conversationId;
        bound += 1;
      }
    }
    if (bound !== attachmentIds.length) {
      throw new Error("ATTACHMENT_BIND_FAILED");
    }
  }

  private applyLastMessageAndUnread(
    conversationId: string,
    messageId: string,
    preview: string,
    createdAt: Date,
    senderId: string
  ): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return;
    }
    if (
      isNewerLastMessage(
        createdAt,
        messageId,
        conversation.lastMessageAt,
        conversation.lastMessageId
      )
    ) {
      conversation.lastMessageId = messageId;
      conversation.lastMessagePreview = preview.slice(0, 280);
      conversation.lastMessageAt = createdAt;
    }

    for (const m of this.members.values()) {
      if (
        m.conversationId === conversationId &&
        m.leftAt == null &&
        m.deletedAt == null &&
        m.userId !== senderId
      ) {
        m.unreadCount += 1;
      }
    }
  }

  private ensureDirectMemberships(
    conversationId: string,
    senderId: string,
    peerUserId: string
  ): void {
    for (const userId of [senderId, peerUserId]) {
      const active = [...this.members.values()].find(
        (m) =>
          m.conversationId === conversationId &&
          m.userId === userId &&
          m.leftAt == null &&
          m.deletedAt == null
      );
      if (!active) {
        this.seedMember({
          id: `mem_${randomUUID()}`,
          conversationId,
          userId,
          role: "MEMBER",
          unreadCount: 0,
          leftAt: null,
          deletedAt: null,
        });
      }
    }
  }

  private async withLock<T>(
    locks: Map<string, Promise<void>>,
    key: string,
    fn: () => Promise<T> | T
  ): Promise<T> {
    const prev = locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    locks.set(
      key,
      prev.then(() => gate)
    );
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export function makeMessage(
  overrides: Partial<MessageRecord> &
    Pick<MessageRecord, "id" | "conversationId" | "senderId">
): MessageRecord {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    type: "TEXT" as MessageType,
    status: "SENT" as MessageStatus,
    content: "hello",
    clientMessageId: null,
    replyToMessageId: null,
    linkPreview: null,
    metadata: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function makeAttachment(
  overrides: Partial<AttachmentRecord> & Pick<AttachmentRecord, "id" | "uploaderId">
): AttachmentRecord {
  return {
    conversationId: null,
    messageId: null,
    status: "READY",
    virusScanStatus: "CLEAN",
    storageKey: "k",
    bucket: "b",
    mimeType: "image/png",
    fileName: "a.png",
    byteSize: 10n,
    width: 100,
    height: 100,
    durationMs: null,
    thumbnailKey: null,
    deletedAt: null,
    ...overrides,
  };
}

export function makeConversation(
  overrides: Partial<InMemoryConversation> & Pick<InMemoryConversation, "id">
): InMemoryConversation {
  return {
    type: "DIRECT",
    status: "ACTIVE",
    directPairKey: null,
    createdById: null,
    lastMessageId: null,
    lastMessagePreview: null,
    lastMessageAt: null,
    deletedAt: null,
    ...overrides,
  };
}

export function makeMember(
  overrides: Partial<InMemoryMember> &
    Pick<InMemoryMember, "id" | "conversationId" | "userId">
): InMemoryMember {
  return {
    role: "MEMBER",
    unreadCount: 0,
    leftAt: null,
    deletedAt: null,
    ...overrides,
  };
}
