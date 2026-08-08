import type { ThemeComponentsOverride } from "../types";

// ----------------------------------------------------------------------

export default function Badge(): ThemeComponentsOverride {
  return {
    MuiBadge: {
      styleOverrides: {
        dot: {
          width: 10,
          height: 10,
          borderRadius: "50%",
        },
      },
    },
  };
}
