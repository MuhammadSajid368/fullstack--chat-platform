import type { Theme } from "@mui/material/styles";
import type { ThemeComponentsOverride } from "../types";

// ----------------------------------------------------------------------

export default function Avatar(theme: Theme): ThemeComponentsOverride {
  return {
    MuiAvatar: {
      styleOverrides: {
        root: {
          fontWeight: theme.typography.fontWeightMedium,
        },
        colorDefault: {
          color: theme.palette.common.white,
          backgroundColor: theme.palette.primary.main,
        },
      },
    },
    MuiAvatarGroup: {
      styleOverrides: {
        avatar: {
          fontSize: 16,
          fontWeight: theme.typography.fontWeightMedium,
          color: theme.palette.common.white,
          backgroundColor: theme.palette.primary.main,
          "&:first-of-type": {
            fontSize: 14,
            color: theme.palette.common.white,
            backgroundColor: theme.palette.primary.dark,
          },
        },
      },
    },
  };
}
