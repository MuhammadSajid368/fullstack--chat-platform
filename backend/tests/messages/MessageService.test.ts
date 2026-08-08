import { describe, expect, it, beforeEach } from "vitest";
import pino from "pino";
import { MessageService } from "../../src/modules/messages/service/MessageService.js";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../src/common/errors/index.js";
import {
  InMemoryMessageRepository,
  makeAttachment,
  makeConversation,
  makeMember,
  makeMessage,
} from "./InMemoryMessageRepository.js";
import {
  encodeMessageCursor,
  sendMessageBodySchema,
} from "../../src/modules/messages/validators/MessageValidators.js";

const ctx = { requestId: "req_1", ipAddress: "127.0.0.1" };

describe("MessageService", () => {
  let repo: InMemoryMessageRepository;
  let service: MessageService;
  const logger = pino({ level: "silent" });

  beforeEach(() => {
    repo = new InMemoryMessageRepository();
    service = new MessageService(repo, logger);

    repo.seedUser({ id: "usr_1", deletedAt: null });
    repo.seedUser({ id: "usr_2", deletedAt: null });
    repo.seedUser({ id: "usr_8", deletedAt: null });
    repo.seedUser({ id: "usr_9", deletedAt: null });

    repo.seedConversation(
      makeConversation({
        id: "conv_1",
        type: "DIRECT",
        directPairKey: "usr_1:usr_2",
      })
    );
    repo.seedMember(
      makeMember({ id: "m1", conversationId: "conv_1", userId: "usr_1" })
    );
    repo.seedMember(
      makeMember({
        id: "m2",
        conversationId: "conv_1",
        userId: "usr_2",
        unreadCount: 0,
      })
    );
  });

  describe("send", () => {
    it("sends a text message and updates lastMessage + unread", async () => {
      const result = await service.send(
        "usr_1",
        "conv_1",
        { content: "Hello", clientMessageId: "c1" },
        ctx
      );

      expect(result.created).toBe(true);
      expect(result.message.content).toBe("Hello");
      expect(result.message.status).toBe("sent");
      expect(result.message.clientMessageId).toBe("c1");

      const conversation = repo.conversations.get("conv_1")!;
      expect(conversation.lastMessageId).toBe(result.message.id);
      expect(conversation.lastMessagePreview).toBe("Hello");
      expect(repo.members.get("m2")!.unreadCount).toBe(1);
      expect(repo.auditLogs.some((a) => a.action === "MESSAGE_SEND")).toBe(
        true
      );
    });

    it("returns existing message for duplicate clientMessageId", async () => {
      const first = await service.send(
        "usr_1",
        "conv_1",
        { content: "Hello", clientMessageId: "dup" },
        ctx
      );
      const second = await service.send(
        "usr_1",
        "conv_1",
        { content: "Hello again", clientMessageId: "dup" },
        ctx
      );

      expect(second.created).toBe(false);
      expect(second.message.id).toBe(first.message.id);
      expect([...repo.messages.values()]).toHaveLength(1);
      expect(repo.members.get("m2")!.unreadCount).toBe(1);
    });

    it("rejects SYSTEM type from clients", async () => {
      await expect(
        service.send(
          "usr_1",
          "conv_1",
          { type: "system", content: "x", clientMessageId: "s1" },
          ctx
        )
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("validates replyToMessageId in conversation", async () => {
      await expect(
        service.send(
          "usr_1",
          "conv_1",
          {
            content: "Reply",
            clientMessageId: "r1",
            replyToMessageId: "missing",
          },
          ctx
        )
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("binds READY attachments for IMAGE", async () => {
      repo.seedAttachment(
        makeAttachment({ id: "att_1", uploaderId: "usr_1" })
      );
      const result = await service.send(
        "usr_1",
        "conv_1",
        {
          type: "image",
          clientMessageId: "img1",
          attachmentIds: ["att_1"],
        },
        ctx
      );
      expect(result.created).toBe(true);
      expect(result.message.attachments).toHaveLength(1);
      expect(repo.attachments.get("att_1")!.messageId).toBe(result.message.id);
    });

    it("rejects non-READY attachments", async () => {
      repo.seedAttachment(
        makeAttachment({
          id: "att_bad",
          uploaderId: "usr_1",
          status: "PENDING",
        })
      );
      await expect(
        service.send(
          "usr_1",
          "conv_1",
          {
            type: "image",
            clientMessageId: "img2",
            attachmentIds: ["att_bad"],
          },
          ctx
        )
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe("authorization", () => {
    it("returns 404 NotFound for non-member list", async () => {
      await expect(
        service.listMessages("usr_x", "conv_1", { limit: 30 })
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("returns 404 NotFound for non-member send", async () => {
      await expect(
        service.send(
          "usr_x",
          "conv_1",
          { content: "Hi", clientMessageId: "x1" },
          ctx
        )
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("pagination", () => {
    it("returns keyset page with nextCursor and hasMore", async () => {
      for (let i = 0; i < 5; i++) {
        repo.seedMessage(
          makeMessage({
            id: `msg_${i}`,
            conversationId: "conv_1",
            senderId: "usr_1",
            content: `m${i}`,
            createdAt: new Date(`2026-01-0${i + 1}T00:00:00.000Z`),
            clientMessageId: `c_${i}`,
          })
        );
      }

      const page1 = await service.listMessages("usr_1", "conv_1", {
        limit: 2,
      });
      expect(page1.messages).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toBeTruthy();
      // chronological ascending within page
      expect(page1.messages[0].content).toBe("m3");
      expect(page1.messages[1].content).toBe("m4");

      const page2 = await service.listMessages("usr_1", "conv_1", {
        limit: 2,
        cursor: page1.nextCursor!,
      });
      expect(page2.messages).toHaveLength(2);
      expect(page2.hasMore).toBe(true);
      expect(page2.messages.map((m) => m.content)).toEqual(["m1", "m2"]);
    });

    it("encodes opaque base64url cursors", () => {
      const cursor = encodeMessageCursor(
        new Date("2026-01-01T00:00:00.000Z"),
        "msg_1"
      );
      expect(cursor).not.toContain("|");
      expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe("retry", () => {
    it("retries FAILED message for sender", async () => {
      repo.seedMessage(
        makeMessage({
          id: "msg_fail",
          conversationId: "conv_1",
          senderId: "usr_1",
          status: "FAILED",
        })
      );
      const dto = await service.retry("usr_1", "msg_fail", ctx);
      expect(dto.status).toBe("sent");
      expect(repo.messages.get("msg_fail")!.status).toBe("SENT");
    });

    it("rejects retry when sender is no longer a member", async () => {
      repo.seedMessage(
        makeMessage({
          id: "msg_fail_out",
          conversationId: "conv_1",
          senderId: "usr_1",
          status: "FAILED",
        })
      );
      const member = repo.members.get("m1")!;
      member.leftAt = new Date();
      await expect(
        service.retry("usr_1", "msg_fail_out", ctx)
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("404 when not failed or wrong sender", async () => {
      repo.seedMessage(
        makeMessage({
          id: "msg_ok",
          conversationId: "conv_1",
          senderId: "usr_1",
          status: "SENT",
        })
      );
      await expect(service.retry("usr_1", "msg_ok", ctx)).rejects.toBeInstanceOf(
        NotFoundError
      );
    });
  });

  describe("delete", () => {
    it("soft-deletes own message and recomputes lastMessage", async () => {
      repo.seedMessage(
        makeMessage({
          id: "msg_old",
          conversationId: "conv_1",
          senderId: "usr_1",
          content: "old",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        })
      );
      repo.seedMessage(
        makeMessage({
          id: "msg_new",
          conversationId: "conv_1",
          senderId: "usr_1",
          content: "new",
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
        })
      );
      repo.conversations.get("conv_1")!.lastMessageId = "msg_new";

      const dto = await service.softDelete("usr_1", "msg_new", ctx);
      expect(dto.deleted).toBe(true);
      expect(repo.messages.get("msg_new")!.deletedAt).toBeTruthy();
      expect(repo.conversations.get("conv_1")!.lastMessageId).toBe("msg_old");
    });

    it("404 when non-sender member without admin role tries delete", async () => {
      repo.seedMessage(
        makeMessage({
          id: "msg_peer",
          conversationId: "conv_1",
          senderId: "usr_1",
        })
      );
      await expect(
        service.softDelete("usr_2", "msg_peer", ctx)
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("star and pin", () => {
    beforeEach(() => {
      repo.seedMessage(
        makeMessage({
          id: "msg_sp",
          conversationId: "conv_1",
          senderId: "usr_1",
        })
      );
    });

    it("stars and unstars", async () => {
      const starred = await service.star("usr_1", "msg_sp", ctx);
      expect(starred.starred).toBe(true);
      const unstarred = await service.unstar("usr_1", "msg_sp", ctx);
      expect(unstarred.starred).toBe(false);
    });

    it("pins and unpins", async () => {
      const pinned = await service.pin("usr_1", "msg_sp", ctx);
      expect(pinned.pinned).toBe(true);
      const unpinned = await service.unpin("usr_1", "msg_sp", ctx);
      expect(unpinned.pinned).toBe(false);
    });
  });

  describe("DIRECT creation", () => {
    it("creates conversation, memberships, and first message", async () => {
      const result = await service.sendDirect(
        "usr_1",
        {
          peerUserId: "usr_9",
          content: "Hi peer",
          clientMessageId: "d1",
        },
        ctx
      );

      expect(result.created).toBe(true);
      expect(result.conversationId).toBeTruthy();
      const conversation = repo.conversations.get(result.conversationId)!;
      expect(conversation.type).toBe("DIRECT");
      expect(conversation.directPairKey).toBe("usr_1:usr_9");
      expect(conversation.lastMessagePreview).toBe("Hi peer");

      const members = [...repo.members.values()].filter(
        (m) => m.conversationId === result.conversationId
      );
      expect(members.map((m) => m.userId).sort()).toEqual(["usr_1", "usr_9"]);
      expect(
        members.find((m) => m.userId === "usr_9")!.unreadCount
      ).toBe(1);
    });

    it("rejects self-chat", async () => {
      await expect(
        service.sendDirect(
          "usr_1",
          { peerUserId: "usr_1", content: "x", clientMessageId: "s" },
          ctx
        )
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("reuses existing DIRECT conversation", async () => {
      const first = await service.sendDirect(
        "usr_1",
        {
          peerUserId: "usr_8",
          content: "one",
          clientMessageId: "d_a",
        },
        ctx
      );
      const second = await service.sendDirect(
        "usr_1",
        {
          peerUserId: "usr_8",
          content: "two",
          clientMessageId: "d_b",
        },
        ctx
      );
      expect(second.conversationId).toBe(first.conversationId);
      expect(
        [...repo.conversations.values()].filter(
          (c) => c.directPairKey === "usr_1:usr_8"
        )
      ).toHaveLength(1);
    });
  });
});

describe("MessageValidators", () => {
  it("requires content for TEXT", () => {
    const result = sendMessageBodySchema.safeParse({
      clientMessageId: "c1",
      content: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("requires attachments for IMAGE", () => {
    const result = sendMessageBodySchema.safeParse({
      type: "image",
      clientMessageId: "c1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects SYSTEM at zod layer", () => {
    const result = sendMessageBodySchema.safeParse({
      type: "system",
      content: "x",
      clientMessageId: "c1",
    });
    expect(result.success).toBe(false);
  });

  it("validates LOCATION metadata", () => {
    expect(
      sendMessageBodySchema.safeParse({
        type: "location",
        clientMessageId: "c1",
        metadata: { lat: 10, lng: 20 },
      }).success
    ).toBe(true);
    expect(
      sendMessageBodySchema.safeParse({
        type: "location",
        clientMessageId: "c1",
        metadata: { lat: 999, lng: 20 },
      }).success
    ).toBe(false);
  });

  it("validates LINK URL", () => {
    expect(
      sendMessageBodySchema.safeParse({
        type: "link",
        clientMessageId: "c1",
        content: "https://example.com",
      }).success
    ).toBe(true);
    expect(
      sendMessageBodySchema.safeParse({
        type: "link",
        clientMessageId: "c1",
        content: "ftp://example.com",
      }).success
    ).toBe(false);
  });
});

describe("MessageService concurrency", () => {
  it("parallel DIRECT creation yields a single conversation", async () => {
    const repo = new InMemoryMessageRepository();
    const service = new MessageService(repo, pino({ level: "silent" }));
    repo.seedUser({ id: "usr_a", deletedAt: null });
    repo.seedUser({ id: "usr_b", deletedAt: null });

    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        service.sendDirect(
          "usr_a",
          {
            peerUserId: "usr_b",
            content: `hi-${i}`,
            clientMessageId: `parallel-${i}`,
          },
          ctx
        )
      )
    );

    const conversationIds = new Set(results.map((r) => r.conversationId));
    expect(conversationIds.size).toBe(1);
    expect(
      [...repo.conversations.values()].filter(
        (c) => c.directPairKey === "usr_a:usr_b"
      )
    ).toHaveLength(1);
    expect(results.every((r) => r.created)).toBe(true);
    expect([...repo.messages.values()]).toHaveLength(12);
  });

  it("parallel duplicate clientMessageId yields one persisted message", async () => {
    const repo = new InMemoryMessageRepository();
    const service = new MessageService(repo, pino({ level: "silent" }));

    repo.seedConversation(
      makeConversation({
        id: "conv_race",
        type: "DIRECT",
        directPairKey: "usr_1:usr_2",
      })
    );
    repo.seedMember(
      makeMember({ id: "m1", conversationId: "conv_race", userId: "usr_1" })
    );
    repo.seedMember(
      makeMember({ id: "m2", conversationId: "conv_race", userId: "usr_2" })
    );

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        service.send(
          "usr_1",
          "conv_race",
          { content: "same", clientMessageId: "same-id" },
          ctx
        )
      )
    );

    const createdCount = results.filter((r) => r.created).length;
    expect(createdCount).toBe(1);
    expect([...repo.messages.values()]).toHaveLength(1);
    expect(new Set(results.map((r) => r.message.id)).size).toBe(1);
    expect(repo.members.get("m2")!.unreadCount).toBe(1);
  });

  it("concurrent sends keep newest lastMessage*", async () => {
    const repo = new InMemoryMessageRepository();
    const service = new MessageService(repo, pino({ level: "silent" }));
    repo.seedConversation(
      makeConversation({
        id: "conv_lm",
        type: "DIRECT",
        directPairKey: "usr_1:usr_2",
      })
    );
    repo.seedMember(
      makeMember({ id: "m1", conversationId: "conv_lm", userId: "usr_1" })
    );
    repo.seedMember(
      makeMember({ id: "m2", conversationId: "conv_lm", userId: "usr_2" })
    );

    await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        service.send(
          "usr_1",
          "conv_lm",
          { content: `msg-${i}`, clientMessageId: `lm-${i}` },
          ctx
        )
      )
    );

    const conversation = repo.conversations.get("conv_lm")!;
    const last = repo.messages.get(conversation.lastMessageId!);
    expect(last).toBeTruthy();
    const all = [...repo.messages.values()];
    const newest = all.sort((a, b) => {
      const t = b.createdAt.getTime() - a.createdAt.getTime();
      if (t !== 0) {
        return t;
      }
      return a.id < b.id ? 1 : -1;
    })[0];
    expect(conversation.lastMessageId).toBe(newest.id);
    expect(conversation.lastMessagePreview).toBe(newest.content);
  });
});

describe("MessageService production hardening", () => {
  let repo: InMemoryMessageRepository;
  let service: MessageService;
  const logger = pino({ level: "silent" });

  beforeEach(() => {
    repo = new InMemoryMessageRepository();
    service = new MessageService(repo, logger);
    repo.seedUser({ id: "usr_1", deletedAt: null });
    repo.seedUser({ id: "usr_2", deletedAt: null });
    repo.seedConversation(
      makeConversation({
        id: "conv_1",
        type: "DIRECT",
        directPairKey: "usr_1:usr_2",
      })
    );
    repo.seedMember(
      makeMember({ id: "m1", conversationId: "conv_1", userId: "usr_1" })
    );
    repo.seedMember(
      makeMember({ id: "m2", conversationId: "conv_1", userId: "usr_2" })
    );
  });

  it("rejects send when membership removed (ex-member)", async () => {
    const left = repo.members.get("m1")!;
    left.leftAt = new Date();

    await expect(
      service.send(
        "usr_1",
        "conv_1",
        { content: "nope", clientMessageId: "toctou-1" },
        ctx
      )
    ).rejects.toBeInstanceOf(NotFoundError);
    expect([...repo.messages.values()]).toHaveLength(0);
  });

  it("enforces membership inside send transaction", async () => {
    const left = repo.members.get("m1")!;
    left.leftAt = new Date();

    await expect(
      repo.sendInConversation({
        data: {
          conversationId: "conv_1",
          senderId: "usr_1",
          type: "TEXT",
          status: "SENT",
          content: "x",
          clientMessageId: "tx-member-1",
        },
        attachmentIds: [],
        preview: "x",
        audit: {
          action: "MESSAGE_SEND",
          entityType: "Message",
        },
      })
    ).rejects.toMatchObject({ name: "NotActiveMemberError" });
  });

  it("rejects attachment scoped to another conversation", async () => {
    repo.seedAttachment(
      makeAttachment({
        id: "att_other",
        uploaderId: "usr_1",
        conversationId: "conv_other",
      })
    );

    await expect(
      service.send(
        "usr_1",
        "conv_1",
        {
          type: "image",
          clientMessageId: "img-x",
          attachmentIds: ["att_other"],
        },
        ctx
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects missing/deleted DIRECT peer", async () => {
    await expect(
      service.sendDirect(
        "usr_1",
        {
          peerUserId: "usr_missing",
          content: "hi",
          clientMessageId: "peer-1",
        },
        ctx
      )
    ).rejects.toBeInstanceOf(NotFoundError);

    repo.seedUser({ id: "usr_gone", deletedAt: new Date() });
    await expect(
      service.sendDirect(
        "usr_1",
        {
          peerUserId: "usr_gone",
          content: "hi",
          clientMessageId: "peer-2",
        },
        ctx
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("DTO never exposes storage keys", async () => {
    repo.seedAttachment(
      makeAttachment({
        id: "att_safe",
        uploaderId: "usr_1",
        storageKey: "secret/path",
        bucket: "private-bucket",
        thumbnailKey: "secret/thumb",
      })
    );

    const result = await service.send(
      "usr_1",
      "conv_1",
      {
        type: "image",
        clientMessageId: "img-safe",
        attachmentIds: ["att_safe"],
      },
      ctx
    );

    const json = JSON.stringify(result.message);
    expect(json).not.toContain("secret/path");
    expect(json).not.toContain("private-bucket");
    expect(json).not.toContain("secret/thumb");
    expect(json).not.toContain("thumbnailKey");
    expect(json).not.toContain("storageKey");
    expect(result.message.attachments[0].id).toBe("att_safe");
  });
});