import { describe, expect, it, beforeEach, vi } from "vitest";
import pino from "pino";
import { ConversationService } from "../../src/modules/conversations/service/ConversationService.js";
import { NotFoundError } from "../../src/common/errors/index.js";
import {
  InMemoryConversationRepository,
  makeConversation,
  makeMember,
  seedUser,
} from "./InMemoryConversationRepository.js";

describe("ConversationService", () => {
  let repo: InMemoryConversationRepository;
  let service: ConversationService;
  const logger = pino({ level: "silent" });

  beforeEach(() => {
    repo = new InMemoryConversationRepository();
    service = new ConversationService(repo, logger);

    repo.seedUser(seedUser({ id: "usr_1", name: "Ada", avatarUrl: "a.png" }));
    repo.seedUser(
      seedUser({ id: "usr_2", name: "Grace", avatarUrl: "g.png", phone: "1" })
    );
    repo.seedUser(seedUser({ id: "usr_3", name: "Alan" }));

    // DIRECT Ada ↔ Grace
    repo.seedConversation(
      makeConversation({
        id: "conv_dm",
        type: "DIRECT",
        lastMessagePreview: "Hello",
        lastMessageAt: new Date("2026-01-03T00:00:00.000Z"),
        lastMessageId: "msg_1",
      })
    );
    repo.seedMember(
      makeMember({
        id: "m1",
        conversationId: "conv_dm",
        userId: "usr_1",
        unreadCount: 2,
      })
    );
    repo.seedMember(
      makeMember({
        id: "m2",
        conversationId: "conv_dm",
        userId: "usr_2",
        unreadCount: 0,
      })
    );

    // GROUP
    repo.seedConversation(
      makeConversation({
        id: "conv_group",
        type: "GROUP",
        name: "Eng",
        description: "Team",
        inviteCode: "abc",
        createdById: "usr_1",
        avatarUrl: "group.png",
        lastMessageAt: new Date("2026-01-02T00:00:00.000Z"),
        lastMessagePreview: "Ship it",
      })
    );
    repo.seedMember(
      makeMember({
        id: "mg1",
        conversationId: "conv_group",
        userId: "usr_1",
        role: "OWNER",
        pinned: true,
      })
    );
    repo.seedMember(
      makeMember({
        id: "mg2",
        conversationId: "conv_group",
        userId: "usr_2",
        role: "ADMIN",
      })
    );
    repo.seedMember(
      makeMember({
        id: "mg3",
        conversationId: "conv_group",
        userId: "usr_3",
        role: "MEMBER",
      })
    );

    // Soft-deleted conversation
    repo.seedConversation(
      makeConversation({
        id: "conv_deleted",
        type: "DIRECT",
        deletedAt: new Date(),
        lastMessageAt: new Date("2026-01-04T00:00:00.000Z"),
      })
    );
    repo.seedMember(
      makeMember({
        id: "md1",
        conversationId: "conv_deleted",
        userId: "usr_1",
      })
    );

    // Left membership
    repo.seedConversation(
      makeConversation({
        id: "conv_left",
        type: "GROUP",
        name: "Left group",
        lastMessageAt: new Date("2026-01-05T00:00:00.000Z"),
      })
    );
    repo.seedMember(
      makeMember({
        id: "ml1",
        conversationId: "conv_left",
        userId: "usr_1",
        leftAt: new Date(),
      })
    );
  });

  it("lists inbox excluding deleted and left; sorts by lastMessageAt", async () => {
    const result = await service.listInbox("usr_1");
    expect(result.conversations.map((c) => c.id)).toEqual([
      "conv_dm",
      "conv_group",
    ]);
    expect(JSON.stringify(result)).not.toContain("passwordHash");
    expect(JSON.stringify(result)).not.toContain("secret-hash");
  });

  it("returns empty inbox", async () => {
    const emptyRepo = new InMemoryConversationRepository();
    const emptyService = new ConversationService(emptyRepo, logger);
    const result = await emptyService.listInbox("usr_x");
    expect(result.conversations).toEqual([]);
    expect(result.users).toEqual([]);
  });

  it("maps DIRECT DTO from peer profile", async () => {
    const dto = await service.getConversation("usr_1", "conv_dm");
    expect(dto).toMatchObject({
      id: "conv_dm",
      type: "direct",
      name: "Grace",
      avatarUrl: "g.png",
      memberIds: expect.arrayContaining(["usr_1", "usr_2"]),
      unreadCount: 2,
      muted: false,
      description: null,
      members: null,
      createdBy: null,
      adminIds: null,
      inviteCode: null,
    });
  });

  it("maps GROUP DTO with metadata and roles", async () => {
    const dto = await service.getConversation("usr_1", "conv_group");
    expect(dto.type).toBe("group");
    expect(dto.name).toBe("Eng");
    expect(dto.description).toBe("Team");
    expect(dto.inviteCode).toBe("abc");
    expect(dto.createdBy).toBe("usr_1");
    expect(dto.adminIds).toEqual(["usr_2"]);
    expect(dto.pinned).toBe(true);
    expect(dto.members).toEqual(
      expect.arrayContaining([
        { userId: "usr_1", role: "owner" },
        { userId: "usr_2", role: "admin" },
        { userId: "usr_3", role: "member" },
      ])
    );
  });

  it("mutes only the caller's membership", async () => {
    const dto = await service.muteConversation(
      "usr_1",
      "conv_dm",
      { muted: true },
      { requestId: "r1" }
    );
    expect(dto.muted).toBe(true);

    const peer = await service.getConversation("usr_2", "conv_dm");
    expect(peer.muted).toBe(false);

    expect(repo.auditLogs.some((a) => a.action === "CONVERSATION_UPDATE")).toBe(
      true
    );
  });

  it("mark read is idempotent and zeros unread", async () => {
    await service.markRead("usr_1", "conv_dm", {});
    const after = await service.getConversation("usr_1", "conv_dm");
    expect(after.unreadCount).toBe(0);

    await service.markRead("usr_1", "conv_dm", {});
    const again = await service.getConversation("usr_1", "conv_dm");
    expect(again.unreadCount).toBe(0);
    expect(repo.auditLogs.filter((a) => a.metadata?.reason === "mark_read")).toHaveLength(
      2
    );
  });

  it("returns 404 for non-member, deleted, and left", async () => {
    await expect(
      service.getConversation("usr_3", "conv_dm")
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      service.getConversation("usr_1", "conv_deleted")
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      service.getConversation("usr_1", "conv_left")
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      service.muteConversation("usr_1", "missing", { muted: true }, {})
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      service.markRead("usr_1", "missing", {})
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("logs when inbox safety limit is reached", async () => {
    const warn = vi.fn();
    const noisyLogger = {
      warn,
      info: vi.fn(),
      error: vi.fn(),
    } as unknown as typeof logger;

    const spyRepo = {
      findInboxForUser: vi.fn().mockResolvedValue({
        items: [],
        truncated: true,
      }),
      findActiveMembersByConversationIds: vi.fn().mockResolvedValue([]),
      findUsersByIds: vi.fn().mockResolvedValue([]),
    };

    const svc = new ConversationService(spyRepo as never, noisyLogger);
    await svc.listInbox("usr_1");
    expect(warn).toHaveBeenCalled();
  });
});
