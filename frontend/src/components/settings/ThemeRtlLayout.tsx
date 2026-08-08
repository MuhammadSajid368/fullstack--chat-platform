import { useEffect } from "react";
import type { ReactNode } from "react";
// rtl
import rtlPlugin from "stylis-plugin-rtl";
// emotion
import createCache from "@emotion/cache";
import type { StylisPlugin } from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
// @mui
import { useTheme } from "@mui/material/styles";

// ----------------------------------------------------------------------

interface ThemeRtlLayoutProps {
  children: ReactNode;
}

export default function ThemeRtlLayout({ children }: ThemeRtlLayoutProps) {
  const theme = useTheme();

  useEffect(() => {
    document.dir = theme.direction;
  }, [theme.direction]);

  const cacheRtl = createCache({
    key: theme.direction === "rtl" ? "rtl" : "css",
    stylisPlugins:
      theme.direction === "rtl" ? [rtlPlugin as unknown as StylisPlugin] : [],
  });

  return <CacheProvider value={cacheRtl}>{children}</CacheProvider>;
}
