import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEV_DEMO_CREDENTIALS } from "../../services/mock/mockAuthService";
import { bootstrapAuth, login, logout } from "./authSlice";
import { createTestStore } from "../../test/testUtils";

describe("authSlice", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("bootstraps as unauthenticated in mock mode", async () => {
    const store = createTestStore();
    await store.dispatch(bootstrapAuth());
    expect(store.getState().auth.initialized).toBe(true);
    expect(store.getState().auth.status).toBe("unauthenticated");
  });

  it("logs in successfully with demo credentials", async () => {
    const store = createTestStore();

    await store.dispatch(
      login({
        email: DEV_DEMO_CREDENTIALS.email,
        password: DEV_DEMO_CREDENTIALS.password,
      })
    );

    const state = store.getState().auth;
    expect(state.status).toBe("authenticated");
    expect(state.user?.email).toBe(DEV_DEMO_CREDENTIALS.email);
    expect(state.error).toBeNull();
  });

  it("fails login with invalid credentials", async () => {
    const store = createTestStore();

    await store.dispatch(
      login({ email: "wrong@example.com", password: "bad" })
    );

    const state = store.getState().auth;
    expect(state.status).toBe("unauthenticated");
    expect(state.user).toBeNull();
    expect(state.error).toBe("Invalid email or password");
  });

  it("logout clears session and chat state", async () => {
    const store = createTestStore();

    await store.dispatch(
      login({
        email: DEV_DEMO_CREDENTIALS.email,
        password: DEV_DEMO_CREDENTIALS.password,
      })
    );

    await store.dispatch(logout());

    expect(store.getState().auth.status).toBe("unauthenticated");
    expect(store.getState().auth.user).toBeNull();
    expect(store.getState().chat.initialized).toBe(false);
  });
});
