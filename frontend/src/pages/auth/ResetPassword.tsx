import { Link, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { CaretLeft } from "phosphor-react";
import ResetPasswordForm from "../../sections/auth/ResetPasswordForm";

const ResetPassword = () => {
  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography
          component="h1"
          sx={{
            fontFamily: '"Sora", "Manrope", sans-serif',
            fontWeight: 700,
            fontSize: { xs: 26, sm: 30 },
            letterSpacing: "-0.03em",
            lineHeight: 1.2,
          }}
        >
          Forgot password?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
          Enter the email linked to your account and we&apos;ll send reset
          instructions.
        </Typography>
      </Stack>
      <ResetPasswordForm />
      <Link
        component={RouterLink}
        to="/auth/login"
        variant="subtitle2"
        underline="hover"
        sx={{
          mx: "auto",
          alignItems: "center",
          display: "inline-flex",
          gap: 0.5,
          fontWeight: 700,
          color: "primary.main",
        }}
      >
        <CaretLeft size={16} weight="bold" />
        Back to sign in
      </Link>
    </Stack>
  );
};

export default ResetPassword;
