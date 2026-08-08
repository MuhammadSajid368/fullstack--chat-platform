import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { getNotificationService } from "../../services/serviceRegistry";
import { getErrorMessage } from "../../services/api/apiError";
import type { Notification } from "../../services/notificationService";

export interface NotificationState {
  items: Notification[];
  unreadCount: number;
  nextCursor: string | null;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
}

const initialState: NotificationState = {
  items: [],
  unreadCount: 0,
  nextCursor: null,
  hasMore: false,
  loading: false,
  error: null,
};

export const fetchNotifications = createAsyncThunk(
  "notifications/fetch",
  async (cursor: string | undefined, { rejectWithValue }) => {
    try {
      const page = await getNotificationService().listNotifications({
        cursor,
        limit: 30,
      });
      return { page, append: Boolean(cursor) };
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to load notifications")
      );
    }
  }
);

export const fetchUnreadNotificationCount = createAsyncThunk(
  "notifications/unreadCount",
  async (_, { rejectWithValue }) => {
    try {
      return await getNotificationService().getUnreadCount();
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to load unread count")
      );
    }
  }
);

export const markNotificationRead = createAsyncThunk(
  "notifications/markRead",
  async (notificationId: string, { rejectWithValue }) => {
    try {
      return await getNotificationService().markRead(notificationId);
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to mark notification read")
      );
    }
  }
);

export const markAllNotificationsRead = createAsyncThunk(
  "notifications/markAllRead",
  async (_, { rejectWithValue }) => {
    try {
      await getNotificationService().markAllRead();
      return true;
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to mark all notifications read")
      );
    }
  }
);

export const deleteNotification = createAsyncThunk(
  "notifications/delete",
  async (notificationId: string, { rejectWithValue }) => {
    try {
      await getNotificationService().deleteNotification(notificationId);
      return notificationId;
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to delete notification")
      );
    }
  }
);

const notificationSlice = createSlice({
  name: "notifications",
  initialState,
  reducers: {
    upsertNotification(state, action: PayloadAction<Notification>) {
      const idx = state.items.findIndex((n) => n.id === action.payload.id);
      if (idx >= 0) {
        const wasUnread = state.items[idx].status === "unread";
        const nowUnread = action.payload.status === "unread";
        state.items[idx] = action.payload;
        if (wasUnread && !nowUnread) {
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        } else if (!wasUnread && nowUnread) {
          state.unreadCount += 1;
        }
      } else {
        state.items.unshift(action.payload);
        // Prefer server unreadCount via fetchUnreadNotificationCount; only bump
        // when we know this is a fresh unread and count wasn't already absolute.
        if (action.payload.status === "unread") {
          state.unreadCount = Math.max(state.unreadCount, state.items.filter((n) => n.status === "unread").length);
        }
      }
    },
    removeNotificationLocal(state, action: PayloadAction<string>) {
      const existing = state.items.find((n) => n.id === action.payload);
      state.items = state.items.filter((n) => n.id !== action.payload);
      if (existing?.status === "unread") {
        state.unreadCount = Math.max(0, state.unreadCount - 1);
      }
    },
    setUnreadCount(state, action: PayloadAction<number>) {
      state.unreadCount = action.payload;
    },
    markAllReadLocal(state) {
      state.items = state.items.map((n) =>
        n.status === "unread" ? { ...n, status: "read" as const } : n
      );
      state.unreadCount = 0;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.loading = false;
        const { page, append } = action.payload;
        state.items = append
          ? [...state.items, ...page.notifications]
          : page.notifications;
        state.nextCursor = page.nextCursor;
        state.hasMore = page.hasMore;
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.loading = false;
        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to load notifications";
      })
      .addCase(fetchUnreadNotificationCount.fulfilled, (state, action) => {
        state.unreadCount = action.payload;
      })
      .addCase(markNotificationRead.fulfilled, (state, action) => {
        const idx = state.items.findIndex((n) => n.id === action.payload.id);
        if (idx >= 0 && state.items[idx].status === "unread") {
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
        if (idx >= 0) {
          state.items[idx] = action.payload;
        }
      })
      .addCase(markAllNotificationsRead.fulfilled, (state) => {
        state.items = state.items.map((n) =>
          n.status === "unread" ? { ...n, status: "read" as const } : n
        );
        state.unreadCount = 0;
      })
      .addCase(deleteNotification.fulfilled, (state, action) => {
        const existing = state.items.find((n) => n.id === action.payload);
        state.items = state.items.filter((n) => n.id !== action.payload);
        if (existing?.status === "unread") {
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
      });
  },
});

export const {
  upsertNotification,
  removeNotificationLocal,
  setUnreadCount,
  markAllReadLocal,
} = notificationSlice.actions;

export default notificationSlice.reducer;
