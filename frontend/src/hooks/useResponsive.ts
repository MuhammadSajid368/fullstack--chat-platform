// @mui
import { useTheme } from "@mui/material/styles";
import type { Breakpoint } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";

// ----------------------------------------------------------------------

type ResponsiveQuery = "up" | "down" | "between" | "only";

export default function useResponsive(
  query: ResponsiveQuery,
  key: Breakpoint | number,
  start?: Breakpoint | number,
  end?: Breakpoint | number
): boolean {
  const theme = useTheme();

  const mediaUp = useMediaQuery(theme.breakpoints.up(key));

  const mediaDown = useMediaQuery(theme.breakpoints.down(key));

  const mediaBetween = useMediaQuery(
    theme.breakpoints.between(start as Breakpoint, end as Breakpoint)
  );

  const mediaOnly = useMediaQuery(theme.breakpoints.only(key as Breakpoint));

  if (query === "up") {
    return mediaUp;
  }

  if (query === "down") {
    return mediaDown;
  }

  if (query === "between") {
    return mediaBetween;
  }

  if (query === "only") {
    return mediaOnly;
  }

  return false;
}
