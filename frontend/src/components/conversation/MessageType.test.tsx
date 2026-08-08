import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { TextMessage } from "./MessageType";
import type { Message } from "../../types/chat";
import { renderWithProviders } from "../../test/testUtils";

const baseMessage: Message = {
  id: "msg-1",
  conversationId: "conv-alex",
  senderId: "user-alex",
  type: "text",
  content: "Hello team",
  createdAt: "2026-07-08T10:00:00.000Z",
  status: "read",
  starred: false,
  pinned: false,
  deleted: false,
};

describe("MessageType", () => {
  it("exposes accessible labels for message actions", () => {
    renderWithProviders(
      <TextMessage
        message={baseMessage}
        currentUserId="user-me"
        senderName="Alex Morgan"
        showMenu
        onReply={() => undefined}
        onDelete={() => undefined}
        onToggleStar={() => undefined}
        onTogglePin={() => undefined}
        onRetry={() => undefined}
      />
    );

    expect(screen.getByLabelText("Message actions")).toBeInTheDocument();
    expect(screen.getByText("Alex Morgan")).toBeInTheDocument();
  });
});
