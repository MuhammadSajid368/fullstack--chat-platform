import { describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CreateGroup from "./CreateGroup";
import { CURRENT_USER_ID, MOCK_USERS } from "../../data/mockChatData";
import { createTestStore, renderWithProviders } from "../../test/testUtils";

describe("CreateGroup", () => {
  it("validates group name and at least one member", async () => {
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
        users: MOCK_USERS,
        initialized: true,
      },
    });

    renderWithProviders(
      <MemoryRouter>
        <CreateGroup open handleClose={() => undefined} />
      </MemoryRouter>,
      { store }
    );

    fireEvent.click(screen.getByRole("button", { name: "Create group" }));

    expect(await screen.findByText("Group name is required")).toBeInTheDocument();
    expect(
      screen.getByText("Select at least 2 members")
    ).toBeInTheDocument();
  });
});
