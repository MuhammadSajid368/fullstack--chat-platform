import type { Theme } from "@mui/material/styles";
import type { ThemeComponentsOverride } from "../types";

// ----------------------------------------------------------------------

export default function Skeleton(theme: Theme): ThemeComponentsOverride {
  return {
    MuiSkeleton: {
      defaultProps: {
        animation: "wave",
      },

      styleOverrides: {
        root: {
          backgroundColor: theme.palette.background.neutral,
        },
      },
    },
  };
}
