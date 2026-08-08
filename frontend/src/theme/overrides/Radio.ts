import type { Theme } from "@mui/material/styles";
import type { ThemeComponentsOverride } from "../types";

// ----------------------------------------------------------------------

export default function Radio(theme: Theme): ThemeComponentsOverride {
  return {
    MuiRadio: {
      styleOverrides: {
        root: {
          padding: theme.spacing(1),
          svg: {
            fontSize: 24,
            "&[font-size=small]": {
              fontSize: 20,
            },
          },
        },
      },
    },
  };
}
