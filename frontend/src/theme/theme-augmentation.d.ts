// Theme-local MUI augmentations for palette/typography shapes defined in this
// folder. Complements src/components/mui-augmentation.d.ts (no duplicates).

import "@mui/material/styles";

declare module "@mui/material/styles" {
  interface PaletteColor {
    lighter: string;
    darker: string;
  }

  interface SimplePaletteColorOptions {
    lighter?: string;
    darker?: string;
  }

  interface TypographyVariants {
    article: React.CSSProperties;
  }

  interface TypographyVariantsOptions {
    article?: React.CSSProperties;
  }
}
