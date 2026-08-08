import { describe, expect, it, beforeEach } from "vitest";
import pino from "pino";
import { UploadService } from "../../src/modules/uploads/service/UploadService.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../src/common/errors/index.js";
import { InMemoryUploadRepository } from "./InMemoryUploadRepository.js";
import { createUploadBodySchema } from "../../src/modules/uploads/validators/UploadValidators.js";

const ctx = { requestId: "req_up1", ipAddress: "127.0.0.1" };

describe("UploadService", () => {
  let repo: InMemoryUploadRepository;
  let service: UploadService;
  const logger = pino({ level: "silent" });

  beforeEach(() => {
    repo = new InMemoryUploadRepository();
    service = new UploadService(repo, logger);
    repo.seedUser({ id: "usr_1", deletedAt: null });
    repo.seedUser({ id: "usr_2", deletedAt: null });
    repo.seedUser({ id: "usr_gone", deletedAt: new Date() });
  });

  it("creates a pending upload without leaking storage keys", async () => {
    const dto = await service.create(
      "usr_1",
      {
        type: "image",
        mimeType: "image/png",
        fileName: "shot.png",
        byteSize: 1024,
        width: 100,
        height: 80,
      },
      ctx
    );

    expect(dto.status).toBe("pending");
    expect(dto.type).toBe("image");
    expect(dto.id).toBeTruthy();
    const json = JSON.stringify(dto);
    expect(json).not.toContain("storageKey");
    expect(json).not.toContain("bucket");
    expect(json).not.toContain("uploads/image/");
    expect(json).not.toContain("virusScan");
    expect(repo.auditLogs.some((a) => a.action === "ATTACHMENT_CREATE")).toBe(
      true
    );
  });

  it("completes pending upload to READY/SKIPPED (API ready)", async () => {
    const created = await service.create(
      "usr_1",
      {
        type: "image",
        mimeType: "image/jpeg",
        fileName: "a.jpg",
        byteSize: 2048,
      },
      ctx
    );

    const done = await service.complete(
      "usr_1",
      created.id,
      { width: 200, height: 100, checksum: "abc12345" },
      ctx
    );

    expect(done.status).toBe("ready");
    expect(done.width).toBe(200);
    expect(done.checksum).toBe("abc12345");
    expect(repo.attachments.get(created.id)!.status).toBe("READY");
    expect(repo.attachments.get(created.id)!.virusScanStatus).toBe("SKIPPED");
  });

  it("requires duration for voice complete", async () => {
    const created = await service.create(
      "usr_1",
      {
        type: "voice",
        mimeType: "audio/mpeg",
        fileName: "v.mp3",
        byteSize: 4096,
      },
      ctx
    );

    await expect(
      service.complete("usr_1", created.id, {}, ctx)
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("fails and blocks uploads", async () => {
    const a = await service.create(
      "usr_1",
      {
        type: "document",
        mimeType: "application/pdf",
        fileName: "a.pdf",
        byteSize: 100,
      },
      ctx
    );
    const failed = await service.fail("usr_1", a.id, { reason: "network" }, ctx);
    expect(failed.status).toBe("failed");

    const b = await service.create(
      "usr_1",
      {
        type: "document",
        mimeType: "application/pdf",
        fileName: "b.pdf",
        byteSize: 100,
      },
      ctx
    );
    const blocked = await service.fail(
      "usr_1",
      b.id,
      { reason: "virus detected" },
      ctx
    );
    expect(blocked.status).toBe("blocked");
  });

  it("soft-deletes unbound uploads", async () => {
    const created = await service.create(
      "usr_1",
      {
        type: "image",
        mimeType: "image/png",
        fileName: "x.png",
        byteSize: 10,
      },
      ctx
    );
    const deleted = await service.softDelete("usr_1", created.id, ctx);
    expect(deleted.status).toBe("deleted");
    await expect(service.getById("usr_1", created.id)).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it("rejects delete when bound to a message", async () => {
    const created = await service.create(
      "usr_1",
      {
        type: "image",
        mimeType: "image/png",
        fileName: "x.png",
        byteSize: 10,
      },
      ctx
    );
    const row = repo.attachments.get(created.id)!;
    row.messageId = "msg_1";
    row.conversationId = "conv_1";

    await expect(
      service.softDelete("usr_1", created.id, ctx)
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("enforces ownership and soft-deleted users", async () => {
    const created = await service.create(
      "usr_1",
      {
        type: "image",
        mimeType: "image/png",
        fileName: "x.png",
        byteSize: 10,
      },
      ctx
    );

    await expect(service.getById("usr_2", created.id)).rejects.toBeInstanceOf(
      NotFoundError
    );

    await expect(
      service.create(
        "usr_gone",
        {
          type: "image",
          mimeType: "image/png",
          fileName: "x.png",
          byteSize: 10,
        },
        ctx
      )
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects illegal complete after fail", async () => {
    const created = await service.create(
      "usr_1",
      {
        type: "image",
        mimeType: "image/png",
        fileName: "x.png",
        byteSize: 10,
      },
      ctx
    );
    await service.fail("usr_1", created.id, {}, ctx);
    await expect(
      service.complete("usr_1", created.id, { width: 1, height: 1 }, ctx)
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("UploadValidators", () => {
  it("rejects mismatched mime for voice", () => {
    expect(
      createUploadBodySchema.safeParse({
        type: "voice",
        mimeType: "image/png",
        fileName: "x.png",
        byteSize: 10,
      }).success
    ).toBe(false);
  });

  it("rejects path-like file names", () => {
    expect(
      createUploadBodySchema.safeParse({
        type: "document",
        mimeType: "application/pdf",
        fileName: "../etc/passwd",
        byteSize: 10,
      }).success
    ).toBe(false);
  });
});

describe("UploadService concurrency", () => {
  it("parallel complete yields a single READY state", async () => {
    const repo = new InMemoryUploadRepository();
    const service = new UploadService(repo, pino({ level: "silent" }));
    repo.seedUser({ id: "usr_1", deletedAt: null });

    const created = await service.create(
      "usr_1",
      {
        type: "image",
        mimeType: "image/png",
        fileName: "x.png",
        byteSize: 10,
      },
      ctx
    );

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        service
          .complete(
            "usr_1",
            created.id,
            { width: 10, height: 10, checksum: "parallel1" },
            ctx
          )
          .then((dto) => ({ ok: true as const, dto }))
          .catch(() => ({ ok: false as const }))
      )
    );

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(repo.attachments.get(created.id)!.status).toBe("READY");
  });

  it("parallel complete vs fail leaves a terminal state", async () => {
    const repo = new InMemoryUploadRepository();
    const service = new UploadService(repo, pino({ level: "silent" }));
    repo.seedUser({ id: "usr_1", deletedAt: null });

    const created = await service.create(
      "usr_1",
      {
        type: "image",
        mimeType: "image/png",
        fileName: "x.png",
        byteSize: 10,
      },
      ctx
    );

    await Promise.all([
      service
        .complete(
          "usr_1",
          created.id,
          { width: 1, height: 1, checksum: "racechk1" },
          ctx
        )
        .catch(() => null),
      service.fail("usr_1", created.id, {}, ctx).catch(() => null),
    ]);

    const status = repo.attachments.get(created.id)!.status;
    expect(["READY", "FAILED"]).toContain(status);
  });
});
