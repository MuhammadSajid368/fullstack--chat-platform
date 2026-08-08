import { m, AnimatePresence } from "framer-motion";
import type { MotionProps } from "framer-motion";
// @mui
import { Dialog, Box, Paper } from "@mui/material";
import type { DialogProps, PaperProps } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { ReactNode } from "react";
//
import { varFade } from "./variants";

// ----------------------------------------------------------------------

type MotionVariantProps = Pick<MotionProps, "initial" | "animate" | "exit">;

interface DialogAnimateProps extends Omit<DialogProps, "open" | "onClose" | "title"> {
  open?: boolean;
  onClose?: () => void;
  children?: ReactNode;
  sx?: SxProps<Theme>;
  variants?: MotionVariantProps;
}

export default function DialogAnimate({
  open = false,
  variants,
  onClose,
  children,
  sx,
  ...other
}: DialogAnimateProps) {
  return (
    <AnimatePresence>
      {open && (
        <Dialog
          fullWidth
          maxWidth="xs"
          open={open}
          onClose={onClose}
          PaperComponent={(props: PaperProps) => (
            <Box
              component={m.div}
              {...(variants ||
                varFade({
                  distance: 120,
                  durationIn: 0.32,
                  durationOut: 0.24,
                  easeIn: "easeInOut",
                }).inUp)}
              sx={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Box
                onClick={onClose}
                sx={{ width: "100%", height: "100%", position: "fixed" }}
              />
              <Paper sx={sx} {...props}>
                {props.children}
              </Paper>
            </Box>
          )}
          {...other}
        >
          {children}
        </Dialog>
      )}
    </AnimatePresence>
  );
}
