import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { getSearchService } from "../../services/serviceRegistry";
import { getErrorMessage } from "../../services/api/apiError";
import type {
  SearchConversationHit,
  SearchGroupHit,
  SearchMessageHit,
  SearchUserHit,
} from "../../services/searchService";

export type SearchScope = "messages" | "users" | "groups" | "conversations";

export interface SearchState {
  query: string;
  scope: SearchScope;
  messages: SearchMessageHit[];
  users: SearchUserHit[];
  groups: SearchGroupHit[];
  conversations: SearchConversationHit[];
  loading: boolean;
  error: string | null;
}

const initialState: SearchState = {
  query: "",
  scope: "messages",
  messages: [],
  users: [],
  groups: [],
  conversations: [],
  loading: false,
  error: null,
};

export const runSearch = createAsyncThunk(
  "search/run",
  async (
    params: { q: string; scope: SearchScope },
    { rejectWithValue }
  ) => {
    const q = params.q.trim();
    if (!q) {
      return { scope: params.scope, results: [] as unknown[] };
    }
    try {
      const service = getSearchService();
      switch (params.scope) {
        case "messages": {
          const page = await service.searchMessages({ q, limit: 30 });
          return { scope: params.scope, results: page.results };
        }
        case "users": {
          const page = await service.searchUsers({ q, limit: 30 });
          return { scope: params.scope, results: page.results };
        }
        case "groups": {
          const page = await service.searchGroups({ q, limit: 30 });
          return { scope: params.scope, results: page.results };
        }
        case "conversations": {
          const page = await service.searchConversations({ q, limit: 30 });
          return { scope: params.scope, results: page.results };
        }
        default:
          return { scope: params.scope, results: [] };
      }
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Search failed"));
    }
  }
);

const searchSlice = createSlice({
  name: "search",
  initialState,
  reducers: {
    setSearchQuery(state, action: PayloadAction<string>) {
      state.query = action.payload;
    },
    setSearchScope(state, action: PayloadAction<SearchScope>) {
      state.scope = action.payload;
    },
    clearSearchResults(state) {
      state.messages = [];
      state.users = [];
      state.groups = [];
      state.conversations = [];
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(runSearch.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(runSearch.fulfilled, (state, action) => {
        state.loading = false;
        const { scope, results } = action.payload;
        if (scope === "messages") {
          state.messages = results as SearchMessageHit[];
        } else if (scope === "users") {
          state.users = results as SearchUserHit[];
        } else if (scope === "groups") {
          state.groups = results as SearchGroupHit[];
        } else {
          state.conversations = results as SearchConversationHit[];
        }
      })
      .addCase(runSearch.rejected, (state, action) => {
        state.loading = false;
        state.error =
          typeof action.payload === "string" ? action.payload : "Search failed";
      });
  },
});

export const { setSearchQuery, setSearchScope, clearSearchResults } =
  searchSlice.actions;

export default searchSlice.reducer;
