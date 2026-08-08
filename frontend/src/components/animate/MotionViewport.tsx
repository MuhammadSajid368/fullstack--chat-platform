import { m } from "framer-motion";
import type { ReactNode } from "react";
// @mui
import { Box } from "@mui/material";
import type { BoxProps } from "@mui/material";
// hooks
import useResponsive from "../../hooks/useResponsive";
//
import { varContainer } from ".";

// ----------------------------------------------------------------------

interface MotionViewportProps extends BoxProps {
  children: ReactNode;
  disableAnimatedMobile?: boolean;
}

export default function MotionViewport({
  children,
  disableAnimatedMobile = false,
  ...other
}: MotionViewportProps) {
  const isMobile = useResponsive("down", "sm");

  if (isMobile && disableAnimatedMobile) {
    return <Box {...other}>{children}</Box>;
  }

  return (
    <Box
      component={m.div}
      initial="initial"
      whileInView="animate"
      viewport={{ once: true, amount: 0.3 }}
      variants={varContainer()}
      {...other}
    >
      {children}
    </Box>
  );
}
