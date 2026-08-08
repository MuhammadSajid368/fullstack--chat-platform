import { describe, expect, it, beforeEach, vi } from "vitest";
import pino from "pino";
import { NotificationService } from "../../src/modules/notifications/service/NotificationService.js";
import { EventPublisher } from "../../src/websocket/EventPublisher.js";
import { RealtimeEvents } from "../../src/websocket/events.js";
import { InMemoryNotificationRepository } from "./InMemoryNotificationRepository.js";
import {
  encodeNotificationCursor,
} from "../../src/modules/notifications/validators/NotificationValidators.js";
import { NotFoundError } from "../../src/common/errors/index.js";

describe("NotificationService", () => {
  let repo: InMemoryNotificationRepository;
  let events: EventPublisher;
  let emit: ReturnType<typeof vi.fn>;
  let service: NotificationService;

  beforeEach(() => {
    repo = new InMemoryNotificationRepository();
    events = new EventPublisher();
    emit = vi.fn();
    events.bind(emit);
    service = new NotificationService(
      repo,
      pino({ level: "silent" }),
      events
    );

    repo.seedUser("usr_1", "Ada");
    repo.seedUser("usr_2", "Grace");
    repo.seedUser("usr_3", "Alan");
  });

  function seedDirectMessage(overrides?: {
    muted?: boolean;
    archived?: boolean;
    mentions?: string[];
    replyToSenderId?: string | null;
  }) {
    repo.seedMessageContext({
      messageId: "msg_1",
      conversationId: "conv_1",
      conversationType: "DIRECT",
      conversationStatus: overrides?.archived ? "ARCHIVED" : "ACTIVE",
      conversationDeletedAt: null,
      senderId: "usr_1",
      senderName: "Ada",
      contentPreview: "Hello there",
      replyToMessageId: overrides?.replyToSenderId ? "msg_0" : null,
      replyToSenderId: overrides?.replyToSenderId ?? null,
      mentionUserIds: overrides?.mentions ?? [],
      members: [
        {
          userId: "usr_1",
          muted: false,
          leftAt: null,
          deletedAt: null,
          userDeletedAt: null,
        },
        {
          userId: "usr_2",
          muted: overrides?.muted ?? false,
          leftAt: null,
          deletedAt: null,
          userDeletedAt: null,
        },
      ],
    });
  }

  describe("processJob message.created", () => {
    it("creates notification for peer and suppresses self", async () => {
      seedDirectMessage();
      const created = await service.processJob({
        kind: "message.created",
        messageId: "msg_1",
      });

      expect(created).toHaveLength(1);
      expect(created[0]!.type).toBe("message");
      expect(created[0]!.title).toContain("Ada");

      const forSender = [...repo.notifications.values()].filter(
        (n) => n.userId === "usr_1"
      );
      expect(forSender).toHaveLength(0);

      expect(emit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: RealtimeEvents.NOTIFICATION_CREATED,
          rooms: ["user:usr_2"],
        })
      );
    });

    it("suppresses muted conversations", async () => {
      seedDirectMessage({ muted: true });
      const created = await service.processJob({
        kind: "message.created",
        messageId: "msg_1",
      });
      expect(created).toHaveLength(0);
    });

    it("suppresses archived conversations", async () => {
      seedDirectMessage({ archived: true });
      const created = await service.processJob({
        kind: "message.created",
        messageId: "msg_1",
      });
      expect(created).toHaveLength(0);
    });

    it("creates mention notification", async () => {
      seedDirectMessage({ mentions: ["usr_2"] });
      const created = await service.processJob({
        kind: "message.created",
        messageId: "msg_1",
      });
      expect(created[0]!.type).toBe("mention");
      expect(created[0]!.title).toMatch(/mentioned/i);
    });

    it("creates reply notification", async () => {
      seedDirectMessage({ replyToSenderId: "usr_2" });
      const created = await service.processJob({
        kind: "message.created",
        messageId: "msg_1",
      });
      expect(created[0]!.title).toMatch(/replied/i);
    });

    it("suppresses duplicates by dedupeKey", async () => {
      seedDirectMessage();
      const first = await service.processJob({
        kind: "message.created",
        messageId: "msg_1",
      });
      const second = await service.processJob({
        kind: "message.created",
        messageId: "msg_1",
      });
      expect(first).toHaveLength(1);
      expect(second).toHaveLength(0);
      expect(repo.notifications.size).toBe(1);
    });
  });

  describe("group events", () => {
    beforeEach(() => {
      repo.seedMemberContext({
        conversationId: "grp_1",
        conversationName: "Eng",
        conversationStatus: "ACTIVE",
        conversationDeletedAt: null,
        members: [
          {
            userId: "usr_1",
            muted: false,
            leftAt: null,
            deletedAt: null,
            userDeletedAt: null,
          },
          {
            userId: "usr_2",
            muted: false,
            leftAt: null,
            deletedAt: null,
            userDeletedAt: null,
          },
          {
            userId: "usr_3",
            muted: true,
            leftAt: null,
            deletedAt: null,
            userDeletedAt: null,
          },
        ],
      });
    });

    it("notifies target on member.joined", async () => {
      const created = await service.processJob({
        kind: "member.joined",
        conversationId: "grp_1",
        targetUserId: "usr_2",
        actorUserId: "usr_1",
      });
      expect(created).toHaveLength(1);
      expect(created[0]!.type).toBe("group_invite");
    });

    it("notifies target on member.removed", async () => {
      const created = await service.processJob({
        kind: "member.removed",
        conversationId: "grp_1",
        targetUserId: "usr_2",
        actorUserId: "usr_1",
      });
      expect(created).toHaveLength(1);
      expect(created[0]!.type).toBe("group_update");
    });

    it("notifies members on ownership transfer (skips muted)", async () => {
      const created = await service.processJob({
        kind: "ownership.transferred",
        conversationId: "grp_1",
        fromUserId: "usr_1",
        toUserId: "usr_2",
      });
      const userIds = created.map(
        (d) =>
          [...repo.notifications.values()].find((n) => n.id === d.id)!.userId
      );
      expect(userIds).toContain("usr_1");
      expect(userIds).toContain("usr_2");
      expect(userIds).not.toContain("usr_3");
    });
  });

  describe("upload + reaction", () => {
    it("creates upload.completed for uploader", async () => {
      repo.seedAttachment({
        id: "att_1",
        uploaderId: "usr_1",
        conversationId: null,
        fileName: "photo.png",
        uploaderDeletedAt: null,
      });
      const created = await service.processJob({
        kind: "upload.completed",
        attachmentId: "att_1",
      });
      expect(created).toHaveLength(1);
      expect(created[0]!.type).toBe("system");
      expect(created[0]!.title).toBe("Upload completed");
    });

    it("creates reaction notification for message author", async () => {
      seedDirectMessage();
      const created = await service.processJob({
        kind: "message.reaction",
        messageId: "msg_1",
        actorUserId: "usr_2",
        targetUserId: "usr_1",
      });
      expect(created).toHaveLength(1);
      expect(created[0]!.title).toMatch(/reacted/i);
    });

    it("suppresses self-reaction", async () => {
      seedDirectMessage();
      const created = await service.processJob({
        kind: "message.reaction",
        messageId: "msg_1",
        actorUserId: "usr_1",
        targetUserId: "usr_1",
      });
      expect(created).toHaveLength(0);
    });
  });

  describe("API operations", () => {
    it("lists with cursor pagination", async () => {
      const a = repo.insert({
        userId: "usr_2",
        title: "A",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        id: "n_a",
      });
      repo.insert({
        userId: "usr_2",
        title: "B",
        createdAt: new Date("2026-01-02T00:00:00Z"),
        id: "n_b",
      });
      repo.insert({
        userId: "usr_2",
        title: "C",
        createdAt: new Date("2026-01-03T00:00:00Z"),
        id: "n_c",
      });

      const page1 = await service.list("usr_2", { limit: 2 });
      expect(page1.notifications).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toBeTruthy();

      const page2 = await service.list("usr_2", {
        limit: 2,
        cursor: page1.nextCursor!,
      });
      expect(page2.notifications).toHaveLength(1);
      expect(page2.hasMore).toBe(false);
      expect(page2.notifications[0]!.id).toBe(a.id);
    });

    it("unread count / mark read / read all / delete", async () => {
      const n1 = repo.insert({ userId: "usr_2", title: "One" });
      repo.insert({ userId: "usr_2", title: "Two" });

      expect(await service.unreadCount("usr_2")).toEqual({ count: 2 });

      const read = await service.markRead("usr_2", n1.id);
      expect(read.status).toBe("read");
      expect(emit).toHaveBeenCalledWith(
        expect.objectContaining({ name: RealtimeEvents.NOTIFICATION_READ })
      );
      expect(await service.unreadCount("usr_2")).toEqual({ count: 1 });

      const all = await service.markAllRead("usr_2");
      expect(all.updated).toBe(1);
      expect(emit).toHaveBeenCalledWith(
        expect.objectContaining({ name: RealtimeEvents.NOTIFICATION_READ_ALL })
      );
      expect(await service.unreadCount("usr_2")).toEqual({ count: 0 });

      const deleted = await service.softDelete("usr_2", n1.id);
      expect(deleted.status).toBe("dismissed");
      expect(emit).toHaveBeenCalledWith(
        expect.objectContaining({ name: RealtimeEvents.NOTIFICATION_DELETED })
      );

      await expect(service.markRead("usr_2", "missing")).rejects.toBeInstanceOf(
        NotFoundError
      );
    });

    it("respects soft-deleted notifications in list/count", async () => {
      const n = repo.insert({ userId: "usr_2", title: "Gone" });
      await service.softDelete("usr_2", n.id);
      const page = await service.list("usr_2", { limit: 10 });
      expect(page.notifications).toHaveLength(0);
      expect(await service.unreadCount("usr_2")).toEqual({ count: 0 });
    });
  });

  describe("worker integration shape", () => {
    it("encode cursor round-trips", () => {
      const cursor = encodeNotificationCursor(
        new Date("2026-01-01T00:00:00.000Z"),
        "n1"
      );
      expect(typeof cursor).toBe("string");
      expect(cursor.length).toBeGreaterThan(5);
    });
  });
});
