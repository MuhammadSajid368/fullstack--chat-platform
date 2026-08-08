import { describe, expect, it, beforeEach, vi } from "vitest";
import pino from "pino";
import { SearchService } from "../../src/modules/search/service/SearchService.js";
import { NotFoundError } from "../../src/common/errors/index.js";
import { InMemorySearchRepository } from "./InMemorySearchRepository.js";
import {
  encodeSearchCursor,
  toPrefixTsQuery,
  truncateSearchLog,
} from "../../src/modules/search/validators/SearchValidators.js";

describe("Search validators", () => {
  it("builds prefix tsquery and truncates log text", () => {
    expect(toPrefixTsQuery("hello world")).toBe("hello:* & world:*");
    expect(truncateSearchLog("a".repeat(120)).length).toBeLessThanOrEqual(101);
  });
});

describe("SearchService", () => {
  let repo: InMemorySearchRepository;
  let service: SearchService;
  let logger: ReturnType<typeof pino>;

  beforeEach(() => {
    repo = new InMemorySearchRepository();
    logger = pino({ level: "silent" });
    service = new SearchService(repo, logger);

    repo.users.push(
      {
        id: "usr_1",
        name: "Ada Lovelace",
        email: "ada@chat.app",
        avatarUrl: null,
        about: null,
        createdAt: new Date("2026-01-01"),
        deletedAt: null,
      },
      {
        id: "usr_2",
        name: "Grace Hopper",
        email: "grace@chat.app",
        avatarUrl: null,
        about: "Admiral",
        createdAt: new Date("2026-01-02"),
        deletedAt: null,
      },
      {
        id: "usr_del",
        name: "Gone",
        email: "gone@chat.app",
        avatarUrl: null,
        about: null,
        createdAt: new Date("2026-01-03"),
        deletedAt: new Date(),
      }
    );

    repo.conversations.push(
      {
        id: "conv_dm",
        type: "DIRECT",
        name: null,
        avatarUrl: null,
        description: null,
        lastMessagePreview: "hello from ada",
        lastMessageAt: new Date("2026-02-01"),
        createdAt: new Date("2026-01-01"),
        deletedAt: null,
        memberIds: ["usr_1", "usr_2"],
      },
      {
        id: "conv_grp",
        type: "GROUP",
        name: "Engineering Guild",
        avatarUrl: null,
        description: "backend team",
        lastMessagePreview: "ship it",
        lastMessageAt: new Date("2026-02-02"),
        createdAt: new Date("2026-01-05"),
        deletedAt: null,
        memberIds: ["usr_1", "usr_2"],
      },
      {
        id: "conv_other",
        type: "GROUP",
        name: "Secret Cabal",
        avatarUrl: null,
        description: null,
        lastMessagePreview: null,
        lastMessageAt: null,
        createdAt: new Date("2026-01-06"),
        deletedAt: null,
        memberIds: ["usr_2"],
      }
    );

    repo.seedMembership("conv_dm", "usr_1");
    repo.seedMembership("conv_dm", "usr_2");
    repo.seedMembership("conv_grp", "usr_1");
    repo.seedMembership("conv_grp", "usr_2");
    repo.seedMembership("conv_other", "usr_2");

    repo.messages.push(
      {
        id: "msg_1",
        conversationId: "conv_dm",
        senderId: "usr_1",
        type: "text",
        content: "Hello Grace, deploy the release",
        createdAt: new Date("2026-02-01T10:00:00Z"),
        deletedAt: null,
        linkPreview: false,
        hasAttachments: false,
        conversationDeletedAt: null,
        senderDeletedAt: null,
      },
      {
        id: "msg_2",
        conversationId: "conv_dm",
        senderId: "usr_2",
        type: "link",
        content: "See https://example.com/docs",
        createdAt: new Date("2026-02-01T11:00:00Z"),
        deletedAt: null,
        linkPreview: true,
        hasAttachments: false,
        conversationDeletedAt: null,
        senderDeletedAt: null,
      },
      {
        id: "msg_3",
        conversationId: "conv_grp",
        senderId: "usr_2",
        type: "text",
        content: 'Exact "quoted phrase" here',
        createdAt: new Date("2026-02-02T09:00:00Z"),
        deletedAt: null,
        linkPreview: false,
        hasAttachments: true,
        conversationDeletedAt: null,
        senderDeletedAt: null,
      },
      {
        id: "msg_sys",
        conversationId: "conv_grp",
        senderId: "usr_1",
        type: "system",
        content: "Ada joined the group",
        createdAt: new Date("2026-02-02T08:00:00Z"),
        deletedAt: null,
        linkPreview: false,
        hasAttachments: false,
        conversationDeletedAt: null,
        senderDeletedAt: null,
      },
      {
        id: "msg_foreign",
        conversationId: "conv_other",
        senderId: "usr_2",
        type: "text",
        content: "deploy secret",
        createdAt: new Date("2026-02-03T09:00:00Z"),
        deletedAt: null,
        linkPreview: false,
        hasAttachments: false,
        conversationDeletedAt: null,
        senderDeletedAt: null,
      },
      {
        id: "msg_deleted",
        conversationId: "conv_dm",
        senderId: "usr_1",
        type: "text",
        content: "deploy deleted",
        createdAt: new Date("2026-02-01T12:00:00Z"),
        deletedAt: new Date(),
        linkPreview: false,
        hasAttachments: false,
        conversationDeletedAt: null,
        senderDeletedAt: null,
      }
    );
  });

  describe("message search (global + scoped)", () => {
    it("searches across conversations the caller belongs to", async () => {
      const page = await service.searchMessages("usr_1", {
        q: "deploy",
        sort: "newest",
        limit: 20,
      });
      const ids = page.results.map((r) => r.id);
      expect(ids).toContain("msg_1");
      expect(ids).not.toContain("msg_foreign");
      expect(ids).not.toContain("msg_deleted");
    });

    it("returns 404 for unauthorized conversationId (no leakage)", async () => {
      await expect(
        service.searchMessages("usr_1", {
          q: "secret",
          conversationId: "conv_other",
          sort: "relevance",
          limit: 10,
        })
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("supports conversation scope when member", async () => {
      const page = await service.searchMessages("usr_1", {
        q: "quoted",
        conversationId: "conv_grp",
        sort: "relevance",
        limit: 10,
      });
      expect(page.results).toHaveLength(1);
      expect(page.results[0]!.id).toBe("msg_3");
    });

    it("supports quoted phrases and filters", async () => {
      const quoted = await service.searchMessages("usr_1", {
        q: '"quoted phrase"',
        sort: "newest",
        limit: 10,
      });
      expect(quoted.results[0]!.id).toBe("msg_3");

      const links = await service.searchMessages("usr_1", {
        q: "example",
        hasLinks: true,
        sort: "newest",
        limit: 10,
      });
      expect(links.results.every((r) => r.type === "link")).toBe(true);

      const attachments = await service.searchMessages("usr_1", {
        q: "phrase",
        hasAttachments: true,
        sort: "newest",
        limit: 10,
      });
      expect(attachments.results[0]!.id).toBe("msg_3");

      const bySender = await service.searchMessages("usr_1", {
        q: "deploy",
        senderId: "usr_1",
        sort: "newest",
        limit: 10,
      });
      expect(bySender.results.every((r) => r.senderId === "usr_1")).toBe(true);
    });

    it("excludes system by default and includes with flag", async () => {
      const def = await service.searchMessages("usr_1", {
        q: "joined",
        sort: "newest",
        limit: 10,
      });
      expect(def.results).toHaveLength(0);

      const withSys = await service.searchMessages("usr_1", {
        q: "joined",
        includeSystem: true,
        sort: "newest",
        limit: 10,
      });
      expect(withSys.results.some((r) => r.type === "system")).toBe(true);
    });

    it("paginates with cursors", async () => {
      const page1 = await service.searchMessages("usr_1", {
        q: "e",
        sort: "newest",
        limit: 1,
      });
      expect(page1.results).toHaveLength(1);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toBeTruthy();

      const page2 = await service.searchMessages("usr_1", {
        q: "e",
        sort: "newest",
        limit: 1,
        cursor: page1.nextCursor!,
      });
      expect(page2.results[0]!.id).not.toBe(page1.results[0]!.id);
    });

    it("supports oldest and relevance sorts", async () => {
      const oldest = await service.searchMessages("usr_1", {
        q: "e",
        sort: "oldest",
        limit: 10,
      });
      const newest = await service.searchMessages("usr_1", {
        q: "e",
        sort: "newest",
        limit: 10,
      });
      expect(oldest.results[0]!.createdAt <= newest.results[0]!.createdAt).toBe(
        true
      );

      const relevance = await service.searchMessages("usr_1", {
        q: "deploy",
        sort: "relevance",
        limit: 10,
      });
      expect(relevance.results.length).toBeGreaterThan(0);
      expect(relevance.results[0]!.rank).not.toBeNull();
    });
  });

  describe("user / group / conversation search", () => {
    it("searches users by name/email and excludes deleted", async () => {
      const page = await service.searchUsers("usr_1", {
        q: "grace",
        sort: "relevance",
        limit: 10,
      });
      expect(page.results).toHaveLength(1);
      expect(page.results[0]!.id).toBe("usr_2");

      const gone = await service.searchUsers("usr_1", {
        q: "Gone",
        sort: "relevance",
        limit: 10,
      });
      expect(gone.results).toHaveLength(0);
    });

    it("searches only groups membership allows", async () => {
      const asAda = await service.searchGroups("usr_1", {
        q: "Engineering",
        sort: "relevance",
        limit: 10,
      });
      expect(asAda.results).toHaveLength(1);

      const secret = await service.searchGroups("usr_1", {
        q: "Secret",
        sort: "relevance",
        limit: 10,
      });
      expect(secret.results).toHaveLength(0);

      const asGrace = await service.searchGroups("usr_2", {
        q: "Secret",
        sort: "relevance",
        limit: 10,
      });
      expect(asGrace.results).toHaveLength(1);
    });

    it("searches conversations by name / peer / preview", async () => {
      const byPeer = await service.searchConversations("usr_1", {
        q: "Grace",
        sort: "newest",
        limit: 10,
      });
      expect(byPeer.results.some((r) => r.id === "conv_dm")).toBe(true);

      const byGroup = await service.searchConversations("usr_1", {
        q: "Guild",
        sort: "newest",
        limit: 10,
      });
      expect(byGroup.results.some((r) => r.id === "conv_grp")).toBe(true);
    });
  });

  describe("performance logging", () => {
    it("logs truncated query and duration", async () => {
      const info = vi.fn();
      const noisy = {
        info,
        child: () => noisy,
      } as unknown as ReturnType<typeof pino>;
      const svc = new SearchService(repo, noisy);
      await svc.searchMessages("usr_1", {
        q: "x".repeat(150),
        sort: "newest",
        limit: 5,
      });
      expect(info).toHaveBeenCalled();
      const payload = info.mock.calls[0]![0] as { q: string; durationMs: number };
      expect(payload.q.length).toBeLessThanOrEqual(101);
      expect(typeof payload.durationMs).toBe("number");
    });
  });

  it("encodes search cursors", () => {
    const cursor = encodeSearchCursor({
      sort: "newest",
      createdAt: new Date().toISOString(),
      id: "m1",
      rank: 0.5,
    });
    expect(cursor.length).toBeGreaterThan(5);
  });
});
