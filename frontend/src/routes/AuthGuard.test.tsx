import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { screen } from "@testing-library/react";
import AuthGuard from "./AuthGuard";
import { createTestStore, renderWithProviders } from "../test/testUtils";

describe("AuthGuard", () => {
  it("waits while auth is bootstrapping", () => {
    const store = createTestStore({
      auth: {
        status: "initializing",
        user: null,
        error: null,
        initialized: false,
      },
    });

    renderWithProviders(
      <MemoryRouter initialEntries={["/app"]}>
        <Routes>
          <Route
            path="/app"
            element={
              <AuthGuard>
                <div>Dashboard</div>
              </AuthGuard>
            }
          />
          <Route path="/auth/login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>,
      { store }
    );

    expect(screen.getByLabelText("Checking authentication")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("Login page")).not.toBeInTheDocument();
  });

  it("redirects unauthenticated users to login", () => {
    const store = createTestStore({
      auth: {
        status: "unauthenticated",
        user: null,
        error: null,
        initialized: true,
      },
    });

    renderWithProviders(
      <MemoryRouter initialEntries={["/app"]}>
        <Routes>
          <Route
            path="/app"
            element={
              <AuthGuard>
                <div>Dashboard</div>
              </AuthGuard>
            }
          />
          <Route path="/auth/login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>,
      { store }
    );

    expect(screen.getByText("Login page")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("renders children when authenticated", () => {
    const store = createTestStore({
      auth: {
        status: "authenticated",
        user: {
          id: "user-me",
          email: "demo@chat.app",
          name: "You",
          avatar: "",
        },
        error: null,
        initialized: true,
      },
    });

    renderWithProviders(
      <MemoryRouter initialEntries={["/app"]}>
        <Routes>
          <Route
            path="/app"
            element={
              <AuthGuard>
                <div>Dashboard</div>
              </AuthGuard>
            }
          />
        </Routes>
      </MemoryRouter>,
      { store }
    );

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });
});
