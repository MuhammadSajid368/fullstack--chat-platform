import { m } from "framer-motion";
import type { MotionProps } from "framer-motion";
// @mui
import { Box } from "@mui/material";
import type { BoxProps } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
//
import { varFade } from "./variants";

// ----------------------------------------------------------------------

interface TextAnimateProps extends BoxProps {
  text: string;
  variants?: MotionProps["variants"];
  sx?: SxProps<Theme>;
}

export default function TextAnimate({
  text,
  variants,
  sx,
  ...other
}: TextAnimateProps) {
  return (
    <Box
      component={m.h1}
      sx={[
        {
          typography: "h1",
          overflow: "hidden",
          display: "inline-flex",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...other}
    >
      {text.split("").map((letter, index) => (
        <m.span key={index} variants={variants || varFade().inUp}>
          {letter}
        </m.span>
      ))}
    </Box>
  );
}
