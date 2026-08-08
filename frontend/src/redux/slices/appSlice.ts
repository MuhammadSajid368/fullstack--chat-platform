import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

export type SidebarType = "CONTACT" | "STARRED" | "SHARED" | "messages";

export interface AppState {
  sidebar: {
    open: boolean;
    type: SidebarType;
  };
}

const initialState: AppState = {
  sidebar: {
    open: false,
    type: "CONTACT",
  },
};

const appSlice = createSlice({
  name: "app",
  initialState,
  reducers: {
    toggleSidebar(state) {
      state.sidebar.open = !state.sidebar.open;
    },
    updateSidebarType(state, action: PayloadAction<{ type: SidebarType }>) {
      state.sidebar.type = action.payload.type;
    },
  },
});

export const { toggleSidebar, updateSidebarType } = appSlice.actions;

export default appSlice.reducer;
