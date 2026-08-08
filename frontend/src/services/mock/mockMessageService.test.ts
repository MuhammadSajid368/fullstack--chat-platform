import { describe, expect, it } from "vitest";
import { mockMessageService } from "../mock/mockMessageService";
import { mockDataStore } from "../mock/mockDataStore";

describe("mockMessageService pagination", () => {
  it("returns a page with cursor metadata", async () => {
    mockDataStore.reset();
    const page = await mockMessageService.loadMessages({
      conversationId: "conv-alex",
      limit: 2,
    });
    expect(page.messages.length).toBeLessThanOrEqual(2);
    expect(typeof page.hasMore).toBe("boolean");
    if (page.hasMore) {
      expect(page.nextCursor).toBeTruthy();
      const older = await mockMessageService.loadMessages({
        conversationId: "conv-alex",
        cursor: page.nextCursor,
        limit: 2,
      });
      const overlap = older.messages.filter((m) =>
        page.messages.some((n) => n.id === m.id)
      );
      expect(overlap).toHaveLength(0);
    }
  });

  it("is idempotent on matching clientMessageId", async () => {
    mockDataStore.reset();
    const first = await mockMessageService.sendMessage({
      conversationId: "conv-alex",
      content: "idempotent",
      senderId: "user-me",
      clientMessageId: "same-key",
    });
    const second = await mockMessageService.sendMessage({
      conversationId: "conv-alex",
      content: "idempotent",
      senderId: "user-me",
      clientMessageId: "same-key",
    });
    expect(second.id).toBe(first.id);
  });
});
