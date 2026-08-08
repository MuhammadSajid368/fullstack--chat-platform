import type { Theme } from "@mui/material/styles";

// Loose component override map — matches MUI runtime shape and supports
// non-core keys (MuiDataGrid, MuiLoadingButton, MuiTreeView, MuiTimelineDot, …).
export interface ThemeComponentOverrideEntry {
  defaultProps?: object;
  styleOverrides?: object;
  variants?: ReadonlyArray<{
    props: object;
    style: object;
  }>;
}

export type ThemeComponentsOverride = Record<string, ThemeComponentOverrideEntry>;

export type ThemeOverrideCreator = (theme: Theme) => ThemeComponentsOverride;

export type ThemeOverrideCreatorStatic = () => ThemeComponentsOverride;

// Palette color keys used by Alert / ButtonGroup / ToggleButton style helpers.
export type PaletteSemanticColor =
  | "primary"
  | "secondary"
  | "info"
  | "success"
  | "warning"
  | "error";
