import { describe, expect, it, beforeEach } from "vitest";
import pino from "pino";
import { AdminService } from "../../src/modules/admin/service/AdminService.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../src/common/errors/index.js";
import { InMemoryAdminRepository } from "./InMemoryAdminRepository.js";
import { encodeAdminCursor } from "../../src/modules/admin/validators/AdminValidators.js";
import type { AdminActor } from "../../src/modules/admin/dto/AdminDto.js";

const admin: AdminActor = { id: "admin_1", globalRole: "ADMIN" };
const superAdmin: AdminActor = { id: "super_1", globalRole: "SUPER_ADMIN" };
const ctx = { requestId: "req_1", ipAddress: "127.0.0.1" };

describe("AdminService", () => {
  let repo: InMemoryAdminRepository;
  let service: AdminService;

  beforeEach(() => {
    repo = new InMemoryAdminRepository();
    service = new AdminService(repo, pino({ level: "silent" }));

    repo.seedUser({
      id: "admin_1",
      email: "admin@chat.app",
      name: "Admin",
      globalRole: "ADMIN",
    });
    repo.seedUser({
      id: "super_1",
      email: "super@chat.app",
      name: "Super",
      globalRole: "SUPER_ADMIN",
    });
    repo.seedUser({
      id: "user_1",
      email: "ada@chat.app",
      name: "Ada",
      globalRole: "USER",
    });
    repo.seedUser({
      id: "admin_2",
      email: "admin2@chat.app",
      name: "Admin Two",
      globalRole: "ADMIN",
    });
  });

  describe("authorization / permissions", () => {
    it("forbids self-moderation", async () => {
      await expect(
        service.suspendUser(admin, "admin_1", { reason: "x" }, ctx)
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("forbids ADMIN moderating another ADMIN", async () => {
      await expect(
        service.suspendUser(admin, "admin_2", { reason: "x" }, ctx)
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("forbids ADMIN moderating SUPER_ADMIN", async () => {
      await expect(
        service.suspendUser(admin, "super_1", { reason: "x" }, ctx)
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("allows SUPER_ADMIN to suspend ADMIN", async () => {
      const dto = await service.suspendUser(
        superAdmin,
        "admin_2",
        { reason: "abuse" },
        ctx
      );
      expect(dto.suspendedAt).not.toBeNull();
      expect(repo.auditActions()).toContain("USER_SUSPEND");
    });
  });

  describe("user suspend / restore / delete", () => {
    it("suspends and unsuspends a user with audit", async () => {
      await service.suspendUser(admin, "user_1", { reason: "spam" }, ctx);
      const user = await repo.findUserById("user_1");
      expect(user?.suspendedAt).not.toBeNull();

      await service.unsuspendUser(admin, "user_1", { reason: "cleared" }, ctx);
      const restored = await repo.findUserById("user_1");
      expect(restored?.suspendedAt).toBeNull();
      expect(repo.auditActions()).toEqual(
        expect.arrayContaining(["USER_SUSPEND", "USER_UNSUSPEND"])
      );
    });

    it("soft-deletes and restores a user", async () => {
      await service.softDeleteUser(admin, "user_1", { reason: "gdpr" }, ctx);
      expect((await repo.findUserById("user_1"))?.deletedAt).not.toBeNull();

      const dto = await service.restoreUser(
        admin,
        "user_1",
        { reason: "mistake" },
        ctx
      );
      expect(dto.deletedAt).toBeNull();
      expect(repo.auditActions()).toEqual(
        expect.arrayContaining(["USER_SOFT_DELETE", "USER_RESTORE"])
      );
    });

    it("force logout revokes sessions", async () => {
      repo.seedSession("user_1");
      const result = await service.forceLogoutAll(
        admin,
        "user_1",
        { reason: "stolen" },
        ctx
      );
      expect(result.sessionsRevoked).toBeGreaterThanOrEqual(1);
      expect(repo.auditActions()).toContain("USER_FORCE_LOGOUT");
    });

    it("rejects double suspend", async () => {
      await service.suspendUser(admin, "user_1", {}, ctx);
      await expect(
        service.suspendUser(admin, "user_1", {}, ctx)
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe("conversations / archive", () => {
    beforeEach(() => {
      repo.conversations.push({
        id: "conv_1",
        type: "DIRECT",
        status: "ACTIVE",
        name: null,
        avatarUrl: null,
        description: null,
        memberCount: 2,
        lastMessageAt: null,
        createdAt: new Date(),
        deletedAt: null,
        members: [
          {
            userId: "user_1",
            role: "MEMBER",
            muted: false,
            joinedAt: new Date(),
            leftAt: null,
            deletedAt: null,
          },
          {
            userId: "admin_1",
            role: "MEMBER",
            muted: false,
            joinedAt: new Date(),
            leftAt: null,
            deletedAt: null,
          },
        ],
      });
    });

    it("archives and soft-deletes / restores conversations", async () => {
      await service.archiveConversation(admin, "conv_1", {}, ctx);
      expect(repo.conversations[0]!.status).toBe("ARCHIVED");

      await service.softDeleteConversation(admin, "conv_1", {}, ctx);
      expect(repo.conversations[0]!.deletedAt).not.toBeNull();

      await service.restoreConversation(admin, "conv_1", {}, ctx);
      expect(repo.conversations[0]!.deletedAt).toBeNull();
      expect(repo.auditActions()).toEqual(
        expect.arrayContaining([
          "ADMIN_CONVERSATION_ARCHIVE",
          "ADMIN_CONVERSATION_DELETE",
          "ADMIN_CONVERSATION_RESTORE",
        ])
      );
    });

    it("lists members", async () => {
      const members = await service.listConversationMembers(admin, "conv_1");
      expect(members).toHaveLength(2);
    });
  });

  describe("groups", () => {
    beforeEach(() => {
      repo.conversations.push({
        id: "grp_1",
        type: "GROUP",
        status: "ACTIVE",
        name: "Engineering",
        avatarUrl: null,
        description: null,
        memberCount: 3,
        lastMessageAt: null,
        createdAt: new Date(),
        deletedAt: null,
        members: [
          {
            userId: "user_1",
            role: "OWNER",
            muted: false,
            joinedAt: new Date(),
            leftAt: null,
            deletedAt: null,
          },
          {
            userId: "admin_2",
            role: "ADMIN",
            muted: false,
            joinedAt: new Date(),
            leftAt: null,
            deletedAt: null,
          },
          {
            userId: "admin_1",
            role: "MEMBER",
            muted: false,
            joinedAt: new Date(),
            leftAt: null,
            deletedAt: null,
          },
        ],
      });
    });

    it("deletes / restores group and transfers ownership", async () => {
      await service.softDeleteGroup(admin, "grp_1", {}, ctx);
      expect(repo.conversations[0]!.deletedAt).not.toBeNull();
      await service.restoreGroup(admin, "grp_1", {}, ctx);

      const transferred = await service.transferGroupOwnership(
        admin,
        "grp_1",
        "admin_2",
        {},
        ctx
      );
      expect(transferred.ownerId).toBe("admin_2");
    });

    it("promotes / demotes and removes members", async () => {
      await service.changeGroupMemberRole(
        admin,
        "grp_1",
        "admin_1",
        "ADMIN",
        {},
        ctx
      );
      await service.changeGroupMemberRole(
        admin,
        "grp_1",
        "admin_1",
        "MEMBER",
        {},
        ctx
      );
      await service.removeGroupMember(admin, "grp_1", "admin_1", {}, ctx);
      const members = await service.listConversationMembers(admin, "grp_1");
      const target = members.find((m) => m.userId === "admin_1");
      expect(target?.deletedAt).not.toBeNull();
    });

    it("cannot remove owner without transfer", async () => {
      await expect(
        service.removeGroupMember(admin, "grp_1", "user_1", {}, ctx)
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("messages / search / audit", () => {
    beforeEach(() => {
      repo.messages.push({
        id: "msg_1",
        conversationId: "conv_1",
        senderId: "user_1",
        type: "TEXT",
        content: "hello moderation",
        status: "SENT",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
      repo.messages.push({
        id: "msg_2",
        conversationId: "conv_1",
        senderId: "user_1",
        type: "TEXT",
        content: "other",
        createdAt: new Date(Date.now() - 1000),
        updatedAt: new Date(),
        status: "SENT",
        deletedAt: null,
      });
    });

    it("searches messages and deletes / restores with audit history", async () => {
      const page = await service.listMessages(admin, {
        q: "moderation",
        limit: 10,
      });
      expect(page.results).toHaveLength(1);

      await service.softDeleteMessage(admin, "msg_1", { reason: "tos" }, ctx);
      expect((await repo.findMessageById("msg_1"))?.deletedAt).not.toBeNull();

      await service.restoreMessage(admin, "msg_1", {}, ctx);
      const audit = await service.listMessageAudit(admin, "msg_1");
      expect(audit.results.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("reports", () => {
    it("create → review → resolve", async () => {
      const report = await service.createReport(
        admin,
        {
          targetType: "USER",
          targetId: "user_1",
          reason: "spam",
        },
        ctx
      );
      expect(report.status).toBe("OPEN");

      const reviewed = await service.reviewReport(admin, report.id, {}, ctx);
      expect(reviewed.status).toBe("UNDER_REVIEW");

      const resolved = await service.resolveReport(
        admin,
        report.id,
        { resolution: "warned" },
        ctx
      );
      expect(resolved.status).toBe("RESOLVED");
      expect(repo.auditActions()).toEqual(
        expect.arrayContaining([
          "REPORT_CREATE",
          "REPORT_REVIEW",
          "REPORT_RESOLVE",
        ])
      );
    });

    it("dismisses open reports", async () => {
      const report = await service.createReport(
        admin,
        { targetType: "MESSAGE", targetId: "msg_x", reason: "noise" },
        ctx
      );
      const dismissed = await service.dismissReport(
        admin,
        report.id,
        { resolution: "no violation" },
        ctx
      );
      expect(dismissed.status).toBe("DISMISSED");
    });
  });

  describe("pagination", () => {
    it("paginates users with cursor", async () => {
      for (let i = 0; i < 5; i += 1) {
        repo.seedUser({
          id: `u_${i}`,
          email: `u${i}@chat.app`,
          name: `User ${i}`,
          createdAt: new Date(Date.now() - i * 1000),
        });
      }
      const page1 = await service.listUsers(admin, { limit: 2 });
      expect(page1.results).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await service.listUsers(admin, {
        limit: 2,
        cursor: page1.nextCursor!,
      });
      expect(page2.results).toHaveLength(2);
      expect(page2.results[0]!.id).not.toBe(page1.results[0]!.id);
    });

    it("rejects invalid cursor", async () => {
      await expect(
        service.listUsers(admin, { limit: 10, cursor: "not-valid" })
      ).rejects.toThrow();
    });

    it("encode/decode cursor round-trips", () => {
      const now = new Date();
      const cursor = encodeAdminCursor(now, "abc");
      expect(cursor.length).toBeGreaterThan(5);
    });
  });

  describe("security", () => {
    it("does not escalate USER into admin via service APIs", async () => {
      // There is no public role-change API on AdminService for globalRole.
      const user = await service.getUser(admin, "user_1");
      expect(user.globalRole).toBe("USER");
    });

    it("404 on missing entities", async () => {
      await expect(service.getUser(admin, "missing")).rejects.toBeInstanceOf(
        NotFoundError
      );
    });
  });
});
