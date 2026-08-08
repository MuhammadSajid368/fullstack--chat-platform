import { m } from "framer-motion";
import { forwardRef } from "react";
import type { ReactNode } from "react";
// @mui
import { useTheme } from "@mui/material/styles";
import type { SxProps, Theme } from "@mui/material/styles";
import { Box, Fab } from "@mui/material";
import type { FabProps } from "@mui/material";

// ----------------------------------------------------------------------

type FabColor =
  | "inherit"
  | "default"
  | "primary"
  | "secondary"
  | "info"
  | "success"
  | "warning"
  | "error";

type FabSize = "small" | "medium" | "large";

interface FabButtonAnimateProps extends Omit<FabProps, "color" | "size"> {
  children: ReactNode;
  color?: FabColor;
  size?: FabSize;
  sx?: SxProps<Theme>;
  sxWrap?: SxProps<Theme>;
}

const FabButtonAnimate = forwardRef<HTMLButtonElement, FabButtonAnimateProps>(
  ({ color = "primary", size = "large", children, sx, sxWrap, ...other }, ref) => {
    const theme = useTheme();

    if (
      color === "default" ||
      color === "inherit" ||
      color === "primary" ||
      color === "secondary"
    ) {
      return (
        <AnimateWrap size={size} sxWrap={sxWrap}>
          <Fab ref={ref} size={size} color={color} sx={sx} {...other}>
            {children}
          </Fab>
        </AnimateWrap>
      );
    }

    return (
      <AnimateWrap size={size} sxWrap={sxWrap}>
        <Fab
          ref={ref}
          size={size}
          sx={[
            {
              boxShadow: theme.customShadows[color],
              color: theme.palette[color].contrastText,
              bgcolor: theme.palette[color].main,
              "&:hover": {
                bgcolor: theme.palette[color].dark,
              },
            },
            ...(Array.isArray(sx) ? sx : [sx]),
          ]}
          {...other}
        >
          {children}
        </Fab>
      </AnimateWrap>
    );
  }
);

export default FabButtonAnimate;

// ----------------------------------------------------------------------

const varSmall = {
  hover: { scale: 1.07 },
  tap: { scale: 0.97 },
};

const varMedium = {
  hover: { scale: 1.06 },
  tap: { scale: 0.98 },
};

const varLarge = {
  hover: { scale: 1.05 },
  tap: { scale: 0.99 },
};

interface AnimateWrapProps {
  children: ReactNode;
  size: FabSize;
  sxWrap?: SxProps<Theme>;
}

function AnimateWrap({ size, children, sxWrap }: AnimateWrapProps) {
  const isSmall = size === "small";
  const isLarge = size === "large";

  return (
    <Box
      component={m.div}
      whileTap="tap"
      whileHover="hover"
      variants={(isSmall && varSmall) || (isLarge && varLarge) || varMedium}
      sx={[
        {
          display: "inline-flex",
        },
        ...(Array.isArray(sxWrap) ? sxWrap : [sxWrap]),
      ]}
    >
      {children}
    </Box>
  );
}
