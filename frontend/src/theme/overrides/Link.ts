import type { ThemeComponentsOverride } from "../types";

// ----------------------------------------------------------------------

export default function Link(): ThemeComponentsOverride {
  return {
    MuiLink: {
      defaultProps: {
        underline: "hover",
      },
    },
  };
}
