import type { ThemeComponentsOverride } from "../types";

// ----------------------------------------------------------------------

export default function LoadingButton(): ThemeComponentsOverride {
  return {
    MuiLoadingButton: {
      styleOverrides: {
        root: {
          "&.MuiButton-text": {
            "& .MuiLoadingButton-startIconPendingStart": {
              marginLeft: 0,
            },
            "& .MuiLoadingButton-endIconPendingEnd": {
              marginRight: 0,
            },
          },
        },
      },
    },
  };
}
