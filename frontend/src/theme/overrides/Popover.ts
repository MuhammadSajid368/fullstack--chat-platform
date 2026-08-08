import type { Theme } from "@mui/material/styles";
import type { ThemeComponentsOverride } from "../types";

// ----------------------------------------------------------------------

export default function Popover(theme: Theme): ThemeComponentsOverride {
  return {
    MuiPopover: {
      styleOverrides: {
        paper: {
          boxShadow: theme.customShadows.dropdown,
          borderRadius: Number(theme.shape.borderRadius) * 1.5,
        },
      },
    },
  };
}
