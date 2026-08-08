import SimpleBarReact from "simplebar-react";
import type { ReactNode } from "react";
// @mui
import { alpha, styled } from "@mui/material/styles";
import type { SxProps, Theme } from "@mui/material/styles";
import { Box } from "@mui/material";

// ----------------------------------------------------------------------

const RootStyle = styled("div")(() => ({
  flexGrow: 1,
  height: "100%",
  overflow: "scroll",
}));

const SimpleBarStyle = styled(SimpleBarReact)(({ theme }) => ({
  maxHeight: "100%",
  height: "100%",
  "& .simplebar-scrollbar": {
    "&:before": {
      backgroundColor: alpha(theme.palette.grey[600], 0.48),
    },
    "&.simplebar-visible:before": {
      opacity: 1,
    },
  },
  "& .simplebar-track.simplebar-vertical": {
    width: 10,
  },
  "& .simplebar-track.simplebar-horizontal .simplebar-scrollbar": {
    height: 6,
  },
  "& .simplebar-mask": {
    zIndex: "inherit",
  },
}));

// ----------------------------------------------------------------------

interface ScrollbarProps {
  children: ReactNode;
  sx?: SxProps<Theme>;
  [key: string]: unknown;
}

export default function Scrollbar({ children, sx, ...other }: ScrollbarProps) {
  const userAgent = typeof navigator === "undefined" ? "SSR" : navigator.userAgent;

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    userAgent
  );

  if (isMobile) {
    return (
      <Box
        sx={[{ overflowX: "auto" }, ...(Array.isArray(sx) ? sx : [sx])]}
        {...(other as object)}
      >
        {children}
      </Box>
    );
  }

  return (
    <RootStyle>
      <SimpleBarStyle timeout={500} clickOnTrack={false} sx={sx} {...(other as object)}>
        {children}
      </SimpleBarStyle>
    </RootStyle>
  );
}

export { SimpleBarStyle };
