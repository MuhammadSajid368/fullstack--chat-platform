import { describe, expect, it, beforeEach } from "vitest";
import { UserService } from "../../src/modules/users/service/UserService.js";
import { NotFoundError, ValidationError } from "../../src/common/errors/index.js";
import {
  InMemoryUserRepository,
  type InMemoryUser,
} from "./InMemoryUserRepository.js";

function seedUser(
  overrides: Partial<InMemoryUser> & Pick<InMemoryUser, "id" | "email" | "name">
): InMemoryUser {
  return {
    avatarUrl: null,
    phone: null,
    about: null,
    passwordHash: "hash",
    deletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("UserService", () => {
  let repo: InMemoryUserRepository;
  let service: UserService;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
    service = new UserService(repo);

    repo.seed(
      seedUser({
        id: "usr_1",
        email: "ada@example.com",
        name: "Ada Lovelace",
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
      })
    );
    repo.seed(
      seedUser({
        id: "usr_2",
        email: "grace@example.com",
        name: "Grace Hopper",
        phone: "+1",
        about: "Admiral",
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
      })
    );
    repo.seed(
      seedUser({
        id: "usr_3",
        email: "deleted@example.com",
        name: "Deleted User",
        deletedAt: new Date("2026-01-04T00:00:00.000Z"),
        createdAt: new Date("2026-01-04T00:00:00.000Z"),
      })
    );
  });

  it("lists active users and hides soft-deleted", async () => {
    const page = await service.listUsers({ limit: 10 });
    expect(page.users.map((u) => u.id)).toEqual(["usr_1", "usr_2"]);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
    expect(JSON.stringify(page)).not.toContain("passwordHash");
  });

  it("paginates with opaque cursors", async () => {
    const first = await service.listUsers({ limit: 1 });
    expect(first.users).toHaveLength(1);
    expect(first.users[0]?.id).toBe("usr_1");
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBeTruthy();

    const second = await service.listUsers({
      limit: 1,
      cursor: first.nextCursor!,
    });
    expect(second.users.map((u) => u.id)).toEqual(["usr_2"]);
  });

  it("gets a public profile by id", async () => {
    const user = await service.getUserById("usr_2");
    expect(user).toEqual({
      id: "usr_2",
      name: "Grace Hopper",
      email: "grace@example.com",
      avatarUrl: null,
      phone: "+1",
      about: "Admiral",
    });
  });

  it("returns 404 for missing or soft-deleted users", async () => {
    await expect(service.getUserById("missing")).rejects.toBeInstanceOf(
      NotFoundError
    );
    await expect(service.getUserById("usr_3")).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it("searches by name and email case-insensitively", async () => {
    const byName = await service.searchUsers({ q: "ada", limit: 10 });
    expect(byName.users.map((u) => u.id)).toEqual(["usr_1"]);

    const byEmail = await service.searchUsers({ q: "GRACE@", limit: 10 });
    expect(byEmail.users.map((u) => u.id)).toEqual(["usr_2"]);

    const deleted = await service.searchUsers({ q: "deleted", limit: 10 });
    expect(deleted.users).toHaveLength(0);
  });

  it("updates editable profile fields and records audit", async () => {
    const updated = await service.updateMyProfile(
      "usr_1",
      {
        name: "Ada L.",
        avatarUrl: "https://cdn.example.com/a.png",
        phone: "123",
        about: "Math",
      },
      { requestId: "req_1" }
    );

    expect(updated.name).toBe("Ada L.");
    expect(updated.avatarUrl).toBe("https://cdn.example.com/a.png");
    expect(repo.auditLogs).toHaveLength(1);
    expect(repo.auditLogs[0]?.action).toBe("USER_UPDATE");
  });

  it("rejects empty profile patches", async () => {
    await expect(
      service.updateMyProfile("usr_1", {}, {})
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
