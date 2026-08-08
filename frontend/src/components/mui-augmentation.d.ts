// MUI module augmentation describing the custom theme additions this project
// relies on (defined in `src/theme`). This only describes existing runtime
// shapes so components can reference them type-safely; it changes nothing at
// runtime.

import "@mui/material/styles";

// ----------------------------------------------------------------------
// Custom shadows (see src/theme/shadows.js)

export interface CustomShadows {
  z1: string;
  z8: string;
  z12: string;
  z16: string;
  z20: string;
  z24: string;
  primary: string;
  secondary: string;
  info: string;
  success: string;
  warning: string;
  error: string;
  card: string;
  dialog: string;
  dropdown: string;
}

declare module "@mui/material/styles" {
  interface Theme {
    customShadows: CustomShadows;
  }
  interface ThemeOptions {
    customShadows?: CustomShadows;
  }
}

// ----------------------------------------------------------------------
// Custom palette keys (see src/theme/palette.js)

declare module "@mui/material" {
  interface Color {
    0: string;
    500_8: string;
    500_12: string;
    500_16: string;
    500_24: string;
    500_32: string;
    500_48: string;
    500_56: string;
    500_80: string;
  }
}

declare module "@mui/material/styles/createPalette" {
  interface TypeBackground {
    neutral: string;
  }
}

// ----------------------------------------------------------------------
// Custom / legacy Typography variants used in existing markup. These have no
// theme styles defined (they fall back to defaults at runtime); declaring them
// keeps the existing JSX type-valid without altering behavior.

declare module "@mui/material/Typography" {
  interface TypographyPropsVariantOverrides {
    article: true;
    subtitle: true;
    subtite2: true;
  }
}
