import { describe, expect, it, beforeEach } from "vitest";
import pino from "pino";
import { GroupService } from "../../src/modules/groups/service/GroupService.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../src/common/errors/index.js";
import {
  InMemoryGroupRepository,
  makeGroup,
  makeGroupMember,
} from "./InMemoryGroupRepository.js";
import { createGroupBodySchema } from "../../src/modules/groups/validators/GroupValidators.js";

const ctx = { requestId: "req_g1", ipAddress: "127.0.0.1" };

describe("GroupService", () => {
  let repo: InMemoryGroupRepository;
  let service: GroupService;
  const logger = pino({ level: "silent" });

  beforeEach(() => {
    repo = new InMemoryGroupRepository();
    service = new GroupService(repo, logger);
    repo.seedUser({ id: "usr_owner", deletedAt: null, suspendedAt: null });
    repo.seedUser({ id: "usr_2", deletedAt: null, suspendedAt: null });
    repo.seedUser({ id: "usr_3", deletedAt: null, suspendedAt: null });
    repo.seedUser({ id: "usr_4", deletedAt: null, suspendedAt: null });
    repo.seedUser({ id: "usr_deleted", deletedAt: new Date(), suspendedAt: null });
    repo.seedUser({ id: "usr_suspended", deletedAt: null, suspendedAt: new Date() });
  });

  it("creates a group with owner and exactly 2 members (minimum)", async () => {
    const dto = await service.createGroup(
      "usr_owner",
      {
        name: "  Eng Team  ",
        description: "Backend",
        memberUserIds: ["usr_2", "usr_3"],
      },
      ctx
    );

    expect(dto.type).toBe("group");
    expect(dto.name).toBe("Eng Team");
    expect(dto.createdBy).toBe("usr_owner");
    expect(dto.members).toEqual(
      expect.arrayContaining([
        { userId: "usr_owner", role: "owner" },
        { userId: "usr_2", role: "member" },
        { userId: "usr_3", role: "member" },
      ])
    );
    expect(dto.memberIds).toHaveLength(3);
    expect(repo.auditLogs.some((a) => a.action === "CONVERSATION_CREATE")).toBe(
      true
    );
    expect([...repo.roles.values()]).toHaveLength(3);
  });

  it("rejects create with deleted user", async () => {
    await expect(
      service.createGroup(
        "usr_owner",
        { name: "Bad", memberUserIds: ["usr_deleted", "usr_2"] },
        ctx
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects create with less than 2 members", async () => {
    await expect(
      service.createGroup(
        "usr_owner",
        { name: "TooSmall", memberUserIds: ["usr_2"] },
        ctx
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects create with duplicate member IDs", async () => {
    await expect(
      service.createGroup(
        "usr_owner",
        { name: "Dups", memberUserIds: ["usr_2", "usr_2", "usr_3"] },
        ctx
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects create when creator is included in members", async () => {
    await expect(
      service.createGroup(
        "usr_owner",
        { name: "SelfInclude", memberUserIds: ["usr_owner", "usr_2", "usr_3"] },
        ctx
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects create with suspended member", async () => {
    await expect(
      service.createGroup(
        "usr_owner",
        { name: "HasSuspended", memberUserIds: ["usr_suspended", "usr_2"] },
        ctx
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects create with unknown member", async () => {
    await expect(
      service.createGroup(
        "usr_owner",
        { name: "Unknown", memberUserIds: ["usr_unknown", "usr_2"] },
        ctx
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("creates group successfully with 3+ members", async () => {
    const dto = await service.createGroup(
      "usr_owner",
      {
        name: "BigTeam",
        memberUserIds: ["usr_2", "usr_3", "usr_4"],
      },
      ctx
    );

    expect(dto.memberIds).toHaveLength(4);
    expect(dto.members).toEqual(
      expect.arrayContaining([
        { userId: "usr_owner", role: "owner" },
        { userId: "usr_2", role: "member" },
        { userId: "usr_3", role: "member" },
        { userId: "usr_4", role: "member" },
      ])
    );
  });

  it("rolls back if membership creation fails", async () => {
    repo.failNextMembershipCreate = true;

    await expect(
      service.createGroup(
        "usr_owner",
        { name: "Rollback", memberUserIds: ["usr_2", "usr_3"] },
        ctx
      )
    ).rejects.toThrow("Simulated membership creation failure");

    expect(repo.conversations.size).toBe(0);
    expect(repo.members.size).toBe(0);
    expect(repo.roles.size).toBe(0);
    expect(repo.auditLogs).toHaveLength(0);
  });

  it("adds members (owner/admin) and rejects duplicates", async () => {
    const created = await service.createGroup(
      "usr_owner",
      { name: "G", memberUserIds: ["usr_2", "usr_3"] },
      ctx
    );

    const after = await service.addMembers(
      "usr_owner",
      created.id,
      { memberUserIds: ["usr_4", "usr_2"] },
      ctx
    );
    expect(after.memberIds).toContain("usr_4");
    expect(after.memberIds.filter((id) => id === "usr_2")).toHaveLength(1);

    await expect(
      service.addMembers(
        "usr_owner",
        created.id,
        { memberUserIds: ["usr_2"] },
        ctx
      )
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("admin can remove member but not admin; owner can remove admin", async () => {
    const created = await service.createGroup(
      "usr_owner",
      { name: "G", memberUserIds: ["usr_2", "usr_3", "usr_4"] },
      ctx
    );
    await service.changeMemberRole(
      "usr_owner",
      created.id,
      "usr_2",
      { role: "admin" },
      ctx
    );

    await expect(
      service.removeMember("usr_2", created.id, "usr_owner", ctx)
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      service.removeMember("usr_2", created.id, "usr_2", ctx)
    ).rejects.toBeInstanceOf(ForbiddenError);

    const after = await service.removeMember(
      "usr_2",
      created.id,
      "usr_3",
      ctx
    );
    expect(after.memberIds).not.toContain("usr_3");

    const removedAdmin = await service.removeMember(
      "usr_owner",
      created.id,
      "usr_2",
      ctx
    );
    expect(removedAdmin.memberIds).not.toContain("usr_2");
  });

  it("transfers ownership and demotes previous owner to admin", async () => {
    const created = await service.createGroup(
      "usr_owner",
      { name: "G", memberUserIds: ["usr_2", "usr_3"] },
      ctx
    );

    const transferred = await service.transferOwnership(
      "usr_owner",
      created.id,
      { newOwnerUserId: "usr_2" },
      ctx
    );

    const owner = transferred.members.find((m) => m.role === "owner");
    const previous = transferred.members.find((m) => m.userId === "usr_owner");
    expect(owner?.userId).toBe("usr_2");
    expect(previous?.role).toBe("admin");
  });

  it("rejects transfer to non-member", async () => {
    const created = await service.createGroup(
      "usr_owner",
      { name: "G", memberUserIds: ["usr_2", "usr_3"] },
      ctx
    );
    await expect(
      service.transferOwnership(
        "usr_owner",
        created.id,
        { newOwnerUserId: "usr_4" },
        ctx
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("sole owner cannot leave", async () => {
    const created = await service.createGroup(
      "usr_owner",
      { name: "G", memberUserIds: ["usr_2", "usr_3"] },
      ctx
    );
    await expect(
      service.leaveGroup("usr_owner", created.id, ctx)
    ).rejects.toBeInstanceOf(ConflictError);

    await service.leaveGroup("usr_2", created.id, ctx);
    const group = await service.getGroup("usr_owner", created.id);
    expect(group.memberIds).not.toContain("usr_2");
  });

  it("soft-deletes group as owner", async () => {
    const created = await service.createGroup(
      "usr_owner",
      { name: "G", memberUserIds: ["usr_2", "usr_3"] },
      ctx
    );
    await service.deleteGroup("usr_owner", created.id, ctx);
    await expect(
      service.getGroup("usr_owner", created.id)
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.conversations.get(created.id)!.deletedAt).toBeTruthy();
  });

  it("member cannot update or delete", async () => {
    const created = await service.createGroup(
      "usr_owner",
      { name: "G", memberUserIds: ["usr_2", "usr_3"] },
      ctx
    );
    await expect(
      service.updateGroup(
        "usr_2",
        created.id,
        { name: "Nope" },
        ctx
      )
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      service.deleteGroup("usr_2", created.id, ctx)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("owner cannot demote self; promote/demote works", async () => {
    const created = await service.createGroup(
      "usr_owner",
      { name: "G", memberUserIds: ["usr_2", "usr_3"] },
      ctx
    );
    await expect(
      service.changeMemberRole(
        "usr_owner",
        created.id,
        "usr_owner",
        { role: "member" },
        ctx
      )
    ).rejects.toBeInstanceOf(ForbiddenError);

    const promoted = await service.changeMemberRole(
      "usr_owner",
      created.id,
      "usr_2",
      { role: "admin" },
      ctx
    );
    expect(
      promoted.members.find((m) => m.userId === "usr_2")?.role
    ).toBe("admin");

    const demoted = await service.changeMemberRole(
      "usr_owner",
      created.id,
      "usr_2",
      { role: "member" },
      ctx
    );
    expect(
      demoted.members.find((m) => m.userId === "usr_2")?.role
    ).toBe("member");
  });

  it("non-member gets 404", async () => {
    repo.seedConversation(
      makeGroup({ id: "grp_x", name: "Secret", createdById: "usr_owner" })
    );
    repo.seedMember(
      makeGroupMember({
        id: "m1",
        conversationId: "grp_x",
        userId: "usr_owner",
        role: "OWNER",
      })
    );
    await expect(service.getGroup("usr_2", "grp_x")).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it("protects last owner from removal", async () => {
    const created = await service.createGroup(
      "usr_owner",
      { name: "G", memberUserIds: ["usr_2", "usr_3"] },
      ctx
    );
    await expect(
      service.removeMember("usr_owner", created.id, "usr_owner", ctx)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("GroupValidators", () => {
  it("requires trimmed non-empty name", () => {
    expect(
      createGroupBodySchema.safeParse({ name: "   ", memberUserIds: ["a", "b"] })
        .success
    ).toBe(false);
    expect(
      createGroupBodySchema.safeParse({ name: "  Dev  ", memberUserIds: ["a", "b"] })
        .success
    ).toBe(true);
  });

  it("requires at least 2 members", () => {
    expect(
      createGroupBodySchema.safeParse({ name: "Test", memberUserIds: [] })
        .success
    ).toBe(false);
    expect(
      createGroupBodySchema.safeParse({ name: "Test", memberUserIds: ["a"] })
        .success
    ).toBe(false);
    expect(
      createGroupBodySchema.safeParse({ name: "Test" }).success
    ).toBe(false);
    expect(
      createGroupBodySchema.safeParse({ name: "Test", memberUserIds: ["a", "b"] })
        .success
    ).toBe(true);
  });
});

describe("GroupService concurrency", () => {
  it("parallel addMembers does not create duplicate memberships", async () => {
    const repo = new InMemoryGroupRepository();
    const service = new GroupService(repo, pino({ level: "silent" }));
    repo.seedUser({ id: "usr_owner", deletedAt: null, suspendedAt: null });
    repo.seedUser({ id: "usr_2", deletedAt: null, suspendedAt: null });
    repo.seedUser({ id: "usr_3", deletedAt: null, suspendedAt: null });
    repo.seedUser({ id: "usr_4", deletedAt: null, suspendedAt: null });
    repo.seedUser({ id: "usr_5", deletedAt: null, suspendedAt: null });

    const created = await service.createGroup(
      "usr_owner",
      { name: "Race", memberUserIds: ["usr_2", "usr_3"] },
      ctx
    );

    await Promise.all(
      Array.from({ length: 10 }, () =>
        service
          .addMembers(
            "usr_owner",
            created.id,
            { memberUserIds: ["usr_4", "usr_5"] },
            ctx
          )
          .catch(() => null)
      )
    );

    const members = await repo.listActiveMembers(created.id);
    const ids = members.map((m) => m.userId).sort();
    expect(ids).toEqual(["usr_2", "usr_3", "usr_4", "usr_5", "usr_owner"]);
  });

  it("parallel transferOwnership leaves a single owner", async () => {
    const repo = new InMemoryGroupRepository();
    const service = new GroupService(repo, pino({ level: "silent" }));
    repo.seedUser({ id: "usr_owner", deletedAt: null, suspendedAt: null });
    repo.seedUser({ id: "usr_2", deletedAt: null, suspendedAt: null });
    repo.seedUser({ id: "usr_3", deletedAt: null, suspendedAt: null });

    const created = await service.createGroup(
      "usr_owner",
      { name: "Race", memberUserIds: ["usr_2", "usr_3"] },
      ctx
    );

    await Promise.all([
      service.transferOwnership(
        "usr_owner",
        created.id,
        { newOwnerUserId: "usr_2" },
        ctx
      ),
      service
        .transferOwnership(
          "usr_owner",
          created.id,
          { newOwnerUserId: "usr_3" },
          ctx
        )
        .catch(() => null),
    ]);

    const members = await repo.listActiveMembers(created.id);
    const owners = members.filter((m) => m.role === "OWNER");
    expect(owners).toHaveLength(1);
  });
});
