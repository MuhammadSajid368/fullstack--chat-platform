import { describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import Footer from "./Footer";
import { CURRENT_USER_ID } from "../../data/mockChatData";
import { createTestStore, renderWithProviders } from "../../test/testUtils";

describe("conversation Footer", () => {
  it("disables send button for empty draft", () => {
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
        activeConversationId: "conv-alex",
        draftsByConversationId: {},
        messagePagesByConversationId: {},
        sendingByConversationId: {},
        replyToMessageId: null,
      },
    });

    renderWithProviders(<Footer />, { store });

    expect(screen.getByLabelText("Send message")).toBeDisabled();
    expect(screen.getByLabelText("Open attachment options")).toBeInTheDocument();
  });

  it("opens attachment menu with document, audio, sticker, and contact actions", () => {
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
        activeConversationId: "conv-alex",
        draftsByConversationId: {},
        messagePagesByConversationId: {},
        sendingByConversationId: {},
        replyToMessageId: null,
      },
    });

    renderWithProviders(<Footer />, { store });

    fireEvent.click(screen.getByLabelText("Open attachment options"));

    expect(screen.getByLabelText("Document")).toBeInTheDocument();
    expect(screen.getByLabelText("Audio")).toBeInTheDocument();
    expect(screen.getByLabelText("Contact")).toBeInTheDocument();
    expect(screen.getByLabelText("New sticker")).toBeInTheDocument();
    expect(screen.getByLabelText("Photos & videos")).toBeInTheDocument();
  });

  it("sends on Enter and does not send on Shift+Enter", () => {
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
        activeConversationId: "conv-alex",
        draftsByConversationId: { "conv-alex": "Line one" },
        messagePagesByConversationId: {},
        sendingByConversationId: {},
        replyToMessageId: null,
      },
    });

    renderWithProviders(<Footer />, { store });

    const input = screen.getByPlaceholderText("Write a message");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

    expect(
      store.getState().chat.messagePagesByConversationId["conv-alex"]
    ).toBeUndefined();

    fireEvent.keyDown(input, { key: "Enter" });

    expect(store.getState().chat.draftsByConversationId["conv-alex"]).toBe("");
    const messages =
      store.getState().chat.messagePagesByConversationId["conv-alex"]?.messages;
    expect(messages?.some((message) => message.content === "Line one")).toBe(true);
  });
});
