import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { getPresenceService } from "../../services/serviceRegistry";
import type {
  PresenceInfo,
  PresencePreferredStatus,
  PresencePrivacy,
} from "../../services/presenceService";
import { getErrorMessage } from "../../services/api/apiError";
import type { PresenceState, PresenceStatus } from "../../types/chat";

export interface PresenceSliceState {
  self: PresenceInfo | null;
  peers: PresenceState;
  lastSeenByUserId: Record<string, string | null>;
  loading: boolean;
  error: string | null;
}

const initialState: PresenceSliceState = {
  self: null,
  peers: {},
  lastSeenByUserId: {},
  loading: false,
  error: null,
};

function normalizeStatus(status: string): PresenceStatus {
  const lower = status.toLowerCase() as PresenceStatus;
  if (
    lower === "online" ||
    lower === "offline" ||
    lower === "away" ||
    lower === "invisible"
  ) {
    return lower;
  }
  return "offline";
}

function preferredToStatus(
  preferred: PresencePreferredStatus
): PresenceStatus {
  if (preferred === "AWAY") return "away";
  if (preferred === "INVISIBLE") return "invisible";
  return "online";
}

export const fetchMyPresence = createAsyncThunk(
  "presence/fetchSelf",
  async (_, { rejectWithValue }) => {
    try {
      return await getPresenceService().getMyPresence();
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to load presence")
      );
    }
  }
);

export const setMyPresenceStatus = createAsyncThunk(
  "presence/setStatus",
  async (
    status: "ONLINE" | "AWAY" | "INVISIBLE",
    { rejectWithValue }
  ) => {
    try {
      return await getPresenceService().setStatus(status);
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to update status")
      );
    }
  }
);

export const setMyPresencePrivacy = createAsyncThunk(
  "presence/setPrivacy",
  async (privacy: PresencePrivacy, { rejectWithValue }) => {
    try {
      return await getPresenceService().setPrivacy(privacy);
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to update privacy")
      );
    }
  }
);

const presenceSlice = createSlice({
  name: "presence",
  initialState,
  reducers: {
    setPeerPresence(
      state,
      action: PayloadAction<{ userId: string; status: PresenceStatus }>
    ) {
      state.peers[action.payload.userId] = action.payload.status;
    },
    setPeerLastSeen(
      state,
      action: PayloadAction<{ userId: string; lastSeenAt: string | null }>
    ) {
      state.lastSeenByUserId[action.payload.userId] = action.payload.lastSeenAt;
    },
    mergePeerPresence(state, action: PayloadAction<PresenceState>) {
      state.peers = { ...state.peers, ...action.payload };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMyPresence.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMyPresence.fulfilled, (state, action) => {
        state.loading = false;
        state.self = action.payload;
        state.peers[action.payload.userId] = normalizeStatus(
          action.payload.status
        );
      })
      .addCase(fetchMyPresence.rejected, (state, action) => {
        state.loading = false;
        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to load presence";
      })
      .addCase(setMyPresenceStatus.pending, (state, action) => {
        const preferred = action.meta.arg;
        if (state.self) {
          state.self = {
            ...state.self,
            preferredStatus: preferred,
            status: preferredToStatus(preferred),
          };
          state.peers[state.self.userId] = preferredToStatus(preferred);
        }
        state.error = null;
      })
      .addCase(setMyPresenceStatus.fulfilled, (state, action) => {
        state.self = action.payload;
        state.peers[action.payload.userId] = normalizeStatus(
          action.payload.status
        );
      })
      .addCase(setMyPresenceStatus.rejected, (state, action) => {
        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to update status";
      })
      .addCase(setMyPresencePrivacy.fulfilled, (state, action) => {
        state.self = action.payload;
      });
  },
});

export const { setPeerPresence, setPeerLastSeen, mergePeerPresence } =
  presenceSlice.actions;

export default presenceSlice.reducer;
