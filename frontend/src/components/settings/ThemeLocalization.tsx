import type { ReactNode } from "react";
// @mui
import { ThemeProvider, createTheme, useTheme } from "@mui/material/styles";
import type { ThemeOptions } from "@mui/material/styles";
// hooks
import useLocales from "../../hooks/useLocales";

// ----------------------------------------------------------------------

interface ThemeLocalizationProps {
  children: ReactNode;
}

export default function ThemeLocalization({ children }: ThemeLocalizationProps) {
  const defaultTheme = useTheme();

  const { currentLang } = useLocales();

  const theme = createTheme(defaultTheme as unknown as ThemeOptions, currentLang.systemValue);

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
