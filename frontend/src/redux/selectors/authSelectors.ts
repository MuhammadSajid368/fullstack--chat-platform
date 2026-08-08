import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "../store";

const selectAuthState = (state: RootState) => state.auth;

export const selectAuthStatus = createSelector(
  selectAuthState,
  (auth) => auth.status
);

export const selectAuthUser = createSelector(
  selectAuthState,
  (auth) => auth.user
);

export const selectAuthError = createSelector(
  selectAuthState,
  (auth) => auth.error
);

export const selectAuthInitialized = createSelector(
  selectAuthState,
  (auth) => auth.initialized
);

export const selectIsAuthenticated = createSelector(
  selectAuthState,
  (auth) => auth.status === "authenticated" && auth.user !== null
);

export const selectIsAuthBootstrapping = createSelector(
  selectAuthState,
  (auth) =>
    !auth.initialized ||
    auth.status === "idle" ||
    auth.status === "initializing"
);

export const selectCurrentUserId = createSelector(
  selectAuthUser,
  (user) => user?.id ?? "user-me"
);
