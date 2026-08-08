import type { Theme } from "@mui/material/styles";
import type { ThemeComponentsOverride } from "../types";

// ----------------------------------------------------------------------

export default function Paper(theme: Theme): ThemeComponentsOverride {
  return {
    MuiPaper: {
      defaultProps: {
        elevation: 0,
      },

      variants: [
        {
          props: { variant: "outlined" },
          style: { borderColor: theme.palette.grey[500_12] },
        },
      ],

      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
  };
}
