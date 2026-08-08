import { describe, expect, it } from "vitest";
import { ApiError } from "./apiError";
import { normalizeHttpError } from "./errorInterceptor";
import {
  mergeMessagesById,
  normalizeTimestamp,
  transformConversation,
  transformMessage,
  transformMessagesPage,
} from "./transformers";
import type { ApiConversationDto, ApiMessageDto } from "./apiTypes";
import { API_ENDPOINTS } from "./endpoints";

describe("API error normalization", () => {
  it("maps axios timeout to TIMEOUT", () => {
    const error = normalizeHttpError({
      isAxiosError: true,
      code: "ECONNABORTED",
      message: "timeout",
    });
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("TIMEOUT");
    expect(error.retryable).toBe(true);
  });

  it("maps network failure without response", () => {
    const error = normalizeHttpError({
      isAxiosError: true,
      message: "Network Error",
    });
    expect(error.code).toBe("NETWORK_ERROR");
    expect(error.retryable).toBe(true);
  });

  it("maps 401 to UNAUTHORIZED", () => {
    const error = normalizeHttpError({
      isAxiosError: true,
      response: {
        status: 401,
        data: { error: { code: "UNAUTHORIZED", message: "No session" } },
      },
    });
    expect(error.code).toBe("UNAUTHORIZED");
    expect(error.status).toBe(401);
  });

  it("surfaces server login message instead of session-expired copy", () => {
    const error = normalizeHttpError({
      isAxiosError: true,
      response: {
        status: 401,
        data: {
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid email or password",
          },
        },
      },
    });
    expect(error.toUserMessage()).toBe("Invalid email or password");
  });

  it("maps 422 with fieldErrors", () => {
    const error = normalizeHttpError({
      isAxiosError: true,
      response: {
        status: 422,
        data: {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid",
            fieldErrors: { name: "Required" },
          },
        },
      },
    });
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.fieldErrors?.name).toBe("Required");
  });
});

describe("transformers", () => {
  it("normalizes numeric and string timestamps", () => {
    expect(normalizeTimestamp("2026-07-08T10:00:00.000Z")).toBe(
      "2026-07-08T10:00:00.000Z"
    );
    expect(normalizeTimestamp(1_720_000_000_000)).toMatch(/^\d{4}-/);
  });

  it("transforms conversation and message DTOs", () => {
    const conversationDto: ApiConversationDto = {
      id: "c1",
      type: "group",
      name: "Team",
      avatarUrl: "https://example.com/a.png",
      memberIds: ["u1"],
      pinned: true,
      muted: false,
      lastMessagePreview: "Hi",
      lastMessageAt: "2026-07-08T10:00:00.000Z",
      unreadCount: 3,
      members: [{ userId: "u1", role: "owner" }],
      createdBy: "u1",
      adminIds: ["u1"],
      inviteCode: "x",
    };
    const conversation = transformConversation(conversationDto);
    expect(conversation.avatar).toBe("https://example.com/a.png");
    expect(conversation.members?.[0].role).toBe("owner");

    const messageDto: ApiMessageDto = {
      id: "m1",
      conversationId: "c1",
      senderId: "u1",
      type: "text",
      content: "Hello",
      createdAt: "2026-07-08T10:00:00.000Z",
      status: "sent",
      starred: false,
      pinned: false,
      deleted: false,
      clientMessageId: "cid",
    };
    const message = transformMessage(messageDto);
    expect(message.clientMessageId).toBe("cid");

    const page = transformMessagesPage({
      messages: [messageDto],
      nextCursor: "cursor",
      hasMore: true,
    });
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe("cursor");
  });

  it("merges pages without duplicates and keeps order", () => {
    const merged = mergeMessagesById(
      [
        {
          id: "a",
          conversationId: "c",
          senderId: "u",
          type: "text",
          content: "1",
          createdAt: "2026-07-08T09:00:00.000Z",
          status: "sent",
          starred: false,
          pinned: false,
          deleted: false,
        },
      ],
      [
        {
          id: "a",
          conversationId: "c",
          senderId: "u",
          type: "text",
          content: "1-updated",
          createdAt: "2026-07-08T09:00:00.000Z",
          status: "sent",
          starred: true,
          pinned: false,
          deleted: false,
        },
        {
          id: "b",
          conversationId: "c",
          senderId: "u",
          type: "text",
          content: "2",
          createdAt: "2026-07-08T10:00:00.000Z",
          status: "sent",
          starred: false,
          pinned: false,
          deleted: false,
        },
      ]
    );
    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe("a");
    expect(merged[0].starred).toBe(true);
    expect(merged[1].id).toBe("b");
  });
});

describe("endpoints", () => {
  it("builds conversation and message paths", () => {
    expect(API_ENDPOINTS.auth.login).toBe("/auth/login");
    expect(API_ENDPOINTS.conversations.messages("c1")).toBe(
      "/conversations/c1/messages"
    );
    expect(API_ENDPOINTS.groups.member("g1", "u1")).toBe(
      "/groups/g1/members/u1"
    );
  });
});
