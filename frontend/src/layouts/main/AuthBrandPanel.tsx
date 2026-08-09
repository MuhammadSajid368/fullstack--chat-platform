import { Box, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { ChatsCircle, LockKey, Lightning } from "phosphor-react";
import logo from "../../assets/Images/logo.png";

const APP_NAME = import.meta.env.VITE_APP_NAME?.trim() || "Chat";

const highlights = [
  {
    icon: ChatsCircle,
    title: "Real-time conversations",
    body: "Messages, groups, and presence that stay in sync.",
  },
  {
    icon: LockKey,
    title: "Secure sessions",
    body: "Cookie-based auth and protected access token handling.",
  },
  {
    icon: Lightning,
    title: "Built for teams",
    body: "Search, notifications, and admin tools when you need them.",
  },
] as const;

/**
 * Left-hand brand panel for auth screens (desktop / large tablets).
 */
export default function AuthBrandPanel() {
  return (
    <Box
      sx={{
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        height: "100%",
        minHeight: { md: "100vh" },
        px: { md: 5, lg: 7 },
        py: { md: 5, lg: 6 },
        color: "#F4F7FB",
        background: `
          radial-gradient(ellipse 90% 70% at 10% 0%, ${alpha("#3D8BFF", 0.35)} 0%, transparent 55%),
          radial-gradient(ellipse 70% 60% at 100% 100%, ${alpha("#0E7490", 0.4)} 0%, transparent 50%),
          linear-gradient(155deg, #071525 0%, #0B2A45 42%, #0A3A4A 100%)
        `,
      }}
    >
      {/* Soft grid atmosphere */}
      <Box
        aria-hidden
        sx={{
          pointerEvents: "none",
          position: "absolute",
          inset: 0,
          opacity: 0.14,
          backgroundImage: `
            linear-gradient(${alpha("#fff", 0.06)} 1px, transparent 1px),
            linear-gradient(90deg, ${alpha("#fff", 0.06)} 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse 80% 70% at 50% 40%, #000 20%, transparent 75%)",
        }}
      />

      <Stack spacing={2.5} sx={{ position: "relative", zIndex: 1 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box
            component="img"
            src={logo}
            alt=""
            sx={{
              width: 44,
              height: 44,
              borderRadius: 1.5,
              objectFit: "cover",
              boxShadow: `0 8px 24px ${alpha("#000", 0.35)}`,
            }}
          />
          <Typography
            component="span"
            sx={{
              fontFamily: '"Sora", "Manrope", sans-serif',
              fontWeight: 700,
              fontSize: 22,
              letterSpacing: "-0.03em",
              lineHeight: 1.2,
            }}
          >
            {APP_NAME}
          </Typography>
        </Stack>

        <Box sx={{ maxWidth: 420, pt: { md: 6, lg: 10 } }}>
          <Typography
            component="h1"
            sx={{
              fontFamily: '"Sora", "Manrope", sans-serif',
              fontWeight: 700,
              fontSize: { md: 36, lg: 42 },
              lineHeight: 1.15,
              letterSpacing: "-0.035em",
              mb: 2,
            }}
          >
            Conversations that feel close—wherever you are
          </Typography>
          <Typography
            sx={{
              color: alpha("#F4F7FB", 0.78),
              fontSize: 16,
              lineHeight: 1.65,
              maxWidth: 380,
            }}
          >
            Sign in to continue messaging, join groups, and stay online with
            your team in one focused workspace.
          </Typography>
        </Box>
      </Stack>

      <Stack spacing={2.5} sx={{ position: "relative", zIndex: 1, mt: 6 }}>
        {highlights.map(({ icon: Icon, title, body }) => (
          <Stack
            key={title}
            direction="row"
            spacing={2}
            sx={{
              p: 2,
              borderRadius: 2,
              bgcolor: alpha("#fff", 0.06),
              border: `1px solid ${alpha("#fff", 0.08)}`,
              backdropFilter: "blur(8px)",
              transition: "transform 0.25s ease, background-color 0.25s ease",
              "&:hover": {
                transform: "translateY(-2px)",
                bgcolor: alpha("#fff", 0.09),
              },
            }}
          >
            <Box
              sx={{
                width: 40,
                height: 40,
                flexShrink: 0,
                borderRadius: 1.5,
                display: "grid",
                placeItems: "center",
                bgcolor: alpha("#5BA8FF", 0.18),
                color: "#9FD0FF",
              }}
            >
              <Icon size={22} weight="duotone" />
            </Box>
            <Box>
              <Typography
                sx={{
                  fontWeight: 700,
                  fontSize: 14,
                  mb: 0.35,
                  letterSpacing: "-0.01em",
                }}
              >
                {title}
              </Typography>
              <Typography
                sx={{ color: alpha("#F4F7FB", 0.7), fontSize: 13, lineHeight: 1.5 }}
              >
                {body}
              </Typography>
            </Box>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
