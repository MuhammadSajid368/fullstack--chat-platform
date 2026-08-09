import { Outlet } from "react-router-dom";
import { Box, Container, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import logo from "../../assets/Images/logo.png";
import AuthBrandPanel from "./AuthBrandPanel";

const APP_NAME = import.meta.env.VITE_APP_NAME?.trim() || "Chat";

/**
 * Auth shell: brand panel + centered form. Replaces the placeholder "Main Layout".
 */
const MainLayout = () => {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1.05fr) minmax(0, 1fr)" },
        bgcolor: "background.default",
      }}
    >
      <Box
        sx={{
          display: { xs: "none", md: "block" },
          position: "sticky",
          top: 0,
          height: "100vh",
          alignSelf: "start",
        }}
      >
        <AuthBrandPanel />
      </Box>

      <Box
        sx={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
          background: (theme) =>
            theme.palette.mode === "light"
              ? `
                radial-gradient(ellipse 80% 50% at 100% 0%, ${alpha(theme.palette.primary.main, 0.08)} 0%, transparent 50%),
                radial-gradient(ellipse 60% 40% at 0% 100%, ${alpha("#0E7490", 0.07)} 0%, transparent 45%),
                ${theme.palette.background.default}
              `
              : theme.palette.background.default,
        }}
      >
        {/* Mobile brand header */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.25}
          sx={{
            display: { xs: "flex", md: "none" },
            px: 2.5,
            pt: 2.5,
            pb: 1,
          }}
        >
          <Box
            component="img"
            src={logo}
            alt=""
            sx={{ width: 36, height: 36, borderRadius: 1.25, objectFit: "cover" }}
          />
          <Typography
            sx={{
              fontFamily: '"Sora", "Manrope", sans-serif',
              fontWeight: 700,
              fontSize: 18,
              letterSpacing: "-0.03em",
            }}
          >
            {APP_NAME}
          </Typography>
        </Stack>

        <Container
          maxWidth="sm"
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            py: { xs: 3, md: 6 },
            px: { xs: 2.5, sm: 3 },
          }}
        >
          <Box
            sx={{
              width: "100%",
              maxWidth: 440,
              mx: "auto",
              animation: "authFadeIn 0.45s ease-out both",
              "@keyframes authFadeIn": {
                from: { opacity: 0, transform: "translateY(10px)" },
                to: { opacity: 1, transform: "translateY(0)" },
              },
            }}
          >
            <Outlet />
          </Box>
        </Container>

        <Typography
          variant="caption"
          sx={{
            textAlign: "center",
            color: "text.disabled",
            pb: 2.5,
            px: 2,
          }}
        >
          © {new Date().getFullYear()} {APP_NAME}
        </Typography>
      </Box>
    </Box>
  );
};

export default MainLayout;
