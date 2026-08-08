import { m } from "framer-motion";
import { forwardRef } from "react";
import type { ReactNode } from "react";
// @mui
import { Box, IconButton } from "@mui/material";
import type { IconButtonProps } from "@mui/material";

// ----------------------------------------------------------------------

type AnimateSize = "small" | "medium" | "large";

interface IconButtonAnimateProps extends Omit<IconButtonProps, "size"> {
  children: ReactNode;
  size?: AnimateSize;
}

const IconButtonAnimate = forwardRef<HTMLButtonElement, IconButtonAnimateProps>(
  ({ children, size = "medium", ...other }, ref) => (
    <AnimateWrap size={size}>
      <IconButton size={size} ref={ref} {...other}>
        {children}
      </IconButton>
    </AnimateWrap>
  )
);

export default IconButtonAnimate;

// ----------------------------------------------------------------------

const varSmall = {
  hover: { scale: 1.1 },
  tap: { scale: 0.95 },
};

const varMedium = {
  hover: { scale: 1.09 },
  tap: { scale: 0.97 },
};

const varLarge = {
  hover: { scale: 1.08 },
  tap: { scale: 0.99 },
};

interface AnimateWrapProps {
  children: ReactNode;
  size: AnimateSize;
}

function AnimateWrap({ size, children }: AnimateWrapProps) {
  const isSmall = size === "small";
  const isLarge = size === "large";

  return (
    <Box
      component={m.div}
      whileTap="tap"
      whileHover="hover"
      variants={(isSmall && varSmall) || (isLarge && varLarge) || varMedium}
      sx={{
        display: "inline-flex",
      }}
    >
      {children}
    </Box>
  );
}
