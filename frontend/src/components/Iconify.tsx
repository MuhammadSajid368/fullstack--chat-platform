// icons
import { Icon } from "@iconify/react";
import type { IconifyIcon } from "@iconify/react";
// @mui
import { Box } from "@mui/material";
import type { BoxProps } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";

// ----------------------------------------------------------------------

interface IconifyProps extends Omit<BoxProps, "sx"> {
  icon: IconifyIcon | string;
  sx?: SxProps<Theme>;
}

export default function Iconify({ icon, sx, ...other }: IconifyProps) {
  return <Box component={Icon} icon={icon} sx={sx} {...other} />;
}
