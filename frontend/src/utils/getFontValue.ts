// @mui
import { useTheme } from "@mui/material/styles";
import type { Breakpoint, Theme } from "@mui/material/styles";
import type { TypographyProps } from "@mui/material";
// hooks
import useResponsive from "../hooks/useResponsive";

// ----------------------------------------------------------------------

type TypographyVariant = NonNullable<TypographyProps["variant"]>;

type ThemeTypographyVariant = keyof Theme["typography"];

interface FontValue {
  fontSize: number;
  lineHeight: number;
  fontWeight: React.CSSProperties["fontWeight"];
  letterSpacing: React.CSSProperties["letterSpacing"];
}

interface ResponsiveFontSizesInput {
  sm: number;
  md: number;
  lg: number;
}

export default function GetFontValue(variant: TypographyVariant): FontValue {
  const theme = useTheme();

  const breakpoints = useWidth();

  const key = theme.breakpoints.up(breakpoints === "xl" ? "lg" : breakpoints);

  const hasResponsive =
    variant === "h1" ||
    variant === "h2" ||
    variant === "h3" ||
    variant === "h4" ||
    variant === "h5" ||
    variant === "h6";

  const variantStyle = theme.typography[
    variant as ThemeTypographyVariant
  ] as React.CSSProperties;

  const typographyVariant = variantStyle as React.CSSProperties &
    Record<string, React.CSSProperties | undefined>;

  const responsiveTypography =
    hasResponsive && typographyVariant[key as string]
      ? typographyVariant[key as string]
      : typographyVariant;

  const fontSize = remToPx(responsiveTypography?.fontSize ?? 0);

  const lineHeight = Number(variantStyle.lineHeight) * fontSize;

  const { fontWeight } = variantStyle;

  const { letterSpacing } = variantStyle;

  return { fontSize, lineHeight, fontWeight, letterSpacing };
}

// ----------------------------------------------------------------------

export function remToPx(value: string | number): number {
  return Math.round(parseFloat(String(value)) * 16);
}

export function pxToRem(value: number): string {
  return `${value / 16}rem`;
}

export function responsiveFontSizes({
  sm,
  md,
  lg,
}: ResponsiveFontSizesInput): Record<string, { fontSize: string }> {
  return {
    "@media (min-width:600px)": {
      fontSize: pxToRem(sm),
    },
    "@media (min-width:900px)": {
      fontSize: pxToRem(md),
    },
    "@media (min-width:1200px)": {
      fontSize: pxToRem(lg),
    },
  };
}

// ----------------------------------------------------------------------

function useWidth(): Breakpoint {
  const theme = useTheme();

  const keys = [...theme.breakpoints.keys].reverse();

  return (
    keys.reduce<Breakpoint | null>((output, key) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const matches = useResponsive("up", key);

      return !output && matches ? key : output;
    }, null) || "xs"
  );
}
