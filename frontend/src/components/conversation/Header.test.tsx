import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import Header from "./Header";
import { CURRENT_USER_ID, MOCK_CONVERSATIONS } from "../../data/mockChatData";
import { createTestStore, renderWithProviders } from "../../test/testUtils";

vi.mock("../../hooks/useResponsive", () => ({
  default: () => true,
}));

describe("conversation Header", () => {
  it("navigates back to list on mobile", () => {
    const store = createTestStore({
      auth: {
        status: "authenticated",
        user: {
          id: CURRENT_USER_ID,
          email: "demo@chat.app",
          name: "You",
          avatar: "",
        },
        error: null,
        initialized: true,
      },
      chat: {
        ...createTestStore().getState().chat,
        conversations: MOCK_CONVERSATIONS,
        activeConversationId: "conv-alex",
        mobileView: "conversation",
      },
    });

    renderWithProviders(<Header />, { store });

    fireEvent.click(screen.getByLabelText("Back to conversation list"));

    expect(store.getState().chat.mobileView).toBe("list");
  });
});
