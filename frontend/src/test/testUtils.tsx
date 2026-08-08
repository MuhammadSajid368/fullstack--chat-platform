import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { rootReducer, type RootReducerState } from "../redux/rootReducer";
import type { AppDispatch } from "../redux/store";

const testTheme = createTheme();

export type TestStore = ReturnType<typeof createTestStore>;

export function createTestStore(preloadedState?: Partial<RootReducerState>) {
  return configureStore({
    reducer: rootReducer,
    preloadedState: preloadedState as RootReducerState | undefined,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        immutableCheck: false,
      }),
  });
}

interface RenderOptions {
  preloadedState?: Partial<RootReducerState>;
  store?: TestStore;
}

export function renderWithProviders(
  ui: ReactElement,
  { preloadedState, store = createTestStore(preloadedState) }: RenderOptions = {}
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <ThemeProvider theme={testTheme}>{children}</ThemeProvider>
      </Provider>
    );
  }

  return {
    store,
    ...render(ui, { wrapper: Wrapper }),
  };
}

export type TestDispatch = AppDispatch;
