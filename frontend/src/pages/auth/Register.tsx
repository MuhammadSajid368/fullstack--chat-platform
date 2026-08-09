import { Link, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import RegisterForm from "../../sections/auth/RegisterForm";

const Register = () => {
  return (
    <Stack spacing={3.5}>
      <Stack spacing={1}>
        <Typography
          component="h1"
          sx={{
            fontFamily: '"Sora", "Manrope", sans-serif',
            fontWeight: 700,
            fontSize: { xs: 28, sm: 32 },
            letterSpacing: "-0.035em",
            lineHeight: 1.2,
            color: "text.primary",
          }}
        >
          Create your account
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
          Join the workspace and start chatting in minutes.
        </Typography>
      </Stack>

      <RegisterForm />

      <Typography
        component="div"
        variant="caption"
        sx={{
          color: "text.secondary",
          textAlign: "center",
          lineHeight: 1.6,
          fontWeight: 500,
        }}
      >
        By signing up, you agree to our{" "}
        <Link underline="hover" color="text.primary" sx={{ fontWeight: 700 }}>
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link underline="hover" color="text.primary" sx={{ fontWeight: 700 }}>
          Privacy Policy
        </Link>
        .
      </Typography>

      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ textAlign: "center", fontWeight: 500 }}
      >
        Already have an account?{" "}
        <Link
          component={RouterLink}
          to="/auth/login"
          underline="hover"
          sx={{ fontWeight: 700, color: "primary.main" }}
        >
          Sign in
        </Link>
      </Typography>
    </Stack>
  );
};

export default Register;
