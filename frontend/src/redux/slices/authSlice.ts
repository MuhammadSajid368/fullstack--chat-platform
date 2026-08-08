import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { getAuthService } from "../../services/serviceRegistry";
import { isRestMode } from "../../config/env";
import { getErrorMessage } from "../../services/api/apiError";
import {
  connectSocket,
  disconnectSocket,
} from "../../services/socket/socketClient";
import { clearAccessToken } from "../../services/socket/tokenStore";
import type {
  AuthState,
  AuthUser,
  LoginCredentials,
  RegisterCredentials,
} from "../../types/auth";
import { resetChatState } from "./chatSlice";

const initialState: AuthState = {
  status: "idle",
  user: null,
  error: null,
  initialized: false,
};

function connectRealtimeIfNeeded(): void {
  if (isRestMode()) {
    try {
      connectSocket();
    } catch {
      // Socket connect is best-effort; HTTP still works.
    }
  }
}

export const bootstrapAuth = createAsyncThunk(
  "auth/bootstrap",
  async (_, { rejectWithValue }) => {
    // Mock mode has no persistent session; treat as unauthenticated after bootstrap.
    if (!isRestMode()) {
      return null;
    }
    try {
      let session = await getAuthService().getSession();
      if (!session) {
        session = await getAuthService().refresh();
      }
      if (session?.user) {
        connectRealtimeIfNeeded();
      }
      return session?.user ?? null;
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(
          error,
          "Unable to reach the API. Check VITE_API_BASE_URL or switch to mock mode."
        )
      );
    }
  }
);

export const login = createAsyncThunk(
  "auth/login",
  async (credentials: LoginCredentials, { rejectWithValue }) => {
    try {
      const session = await getAuthService().login(credentials);
      connectRealtimeIfNeeded();
      return session.user;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Login failed"));
    }
  }
);

export const register = createAsyncThunk(
  "auth/register",
  async (credentials: RegisterCredentials, { rejectWithValue }) => {
    try {
      const session = await getAuthService().register(credentials);
      connectRealtimeIfNeeded();
      return session.user;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Registration failed"));
    }
  }
);

export const logout = createAsyncThunk(
  "auth/logout",
  async (_, { dispatch }) => {
    try {
      await getAuthService().logout();
    } finally {
      disconnectSocket();
      clearAccessToken();
      dispatch(resetChatState());
    }
  }
);

/**
 * Called by the REST 401 interceptor to clear session without another HTTP round-trip.
 */
export const sessionExpired = createAsyncThunk(
  "auth/sessionExpired",
  async (_, { dispatch }) => {
    if (isRestMode()) {
      try {
        const session = await getAuthService().refresh();
        if (session?.user) {
          connectRealtimeIfNeeded();
          return session.user;
        }
      } catch {
        // fall through to expire
      }
    }
    disconnectSocket();
    clearAccessToken();
    dispatch(resetChatState());
    return null;
  }
);

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    clearAuthError(state) {
      state.error = null;
    },
    setAuthenticatedUser(state, action: PayloadAction<AuthUser>) {
      state.user = action.payload;
      state.status = "authenticated";
      state.error = null;
      state.initialized = true;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(bootstrapAuth.pending, (state) => {
        state.status = "initializing";
        state.error = null;
      })
      .addCase(bootstrapAuth.fulfilled, (state, action) => {
        state.initialized = true;
        if (action.payload) {
          state.user = action.payload;
          state.status = "authenticated";
        } else {
          state.user = null;
          state.status = "unauthenticated";
        }
      })
      .addCase(bootstrapAuth.rejected, (state, action) => {
        state.initialized = true;
        state.user = null;
        state.status = "unauthenticated";
        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Unable to initialize authentication.";
      })
      .addCase(login.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.status = "authenticated";
        state.user = action.payload;
        state.error = null;
        state.initialized = true;
      })
      .addCase(login.rejected, (state, action) => {
        state.status = "unauthenticated";
        state.user = null;
        state.initialized = true;
        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Login failed";
      })
      .addCase(register.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(register.fulfilled, (state, action) => {
        state.status = "authenticated";
        state.user = action.payload;
        state.error = null;
        state.initialized = true;
      })
      .addCase(register.rejected, (state, action) => {
        state.status = "unauthenticated";
        state.user = null;
        state.initialized = true;
        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Registration failed";
      })
      .addCase(logout.fulfilled, () => ({
        ...initialState,
        status: "unauthenticated" as const,
        initialized: true,
      }))
      .addCase(sessionExpired.fulfilled, (state, action) => {
        if (action.payload) {
          state.user = action.payload;
          state.status = "authenticated";
          state.error = null;
          state.initialized = true;
          return;
        }
        state.user = null;
        state.status = "unauthenticated";
        // Only surface session-expiry copy when a live session actually failed.
        state.error = "Your session has expired. Please sign in again.";
        state.initialized = true;
      });
  },
});

export const { clearAuthError, setAuthenticatedUser } = authSlice.actions;

export default authSlice.reducer;
