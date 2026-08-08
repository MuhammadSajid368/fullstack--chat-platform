import { useMemo } from "react";
import type { ReactNode } from "react";
// @mui
import { alpha, ThemeProvider, createTheme, useTheme } from "@mui/material/styles";
import type { ThemeOptions } from "@mui/material/styles";
// hooks
import useSettings from "../../hooks/useSettings";
//
import componentsOverride from "../../theme/overrides";

// ----------------------------------------------------------------------

interface ThemeColorPresetsProps {
  children: ReactNode;
}

export default function ThemeColorPresets({ children }: ThemeColorPresetsProps) {
  const defaultTheme = useTheme();

  const { setColor } = useSettings();

  const themeOptions = useMemo(
    () => ({
      ...defaultTheme,
      palette: {
        ...defaultTheme.palette,
        primary: setColor,
      },
      customShadows: {
        ...defaultTheme.customShadows,
        primary: `0 8px 16px 0 ${alpha(setColor.main, 0.24)}`,
      },
    }),
    [setColor, defaultTheme]
  );

  const theme = createTheme(themeOptions as unknown as ThemeOptions);

  theme.components = componentsOverride(theme);

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
