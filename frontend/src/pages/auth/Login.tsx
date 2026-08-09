import { Link, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import LoginForm from "../../sections/auth/LoginForm";

const Login = () => {
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
          Welcome back
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
          Sign in to continue to your conversations.
        </Typography>
      </Stack>

      <LoginForm />

      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ textAlign: "center", fontWeight: 500 }}
      >
        New here?{" "}
        <Link
          component={RouterLink}
          to="/auth/register"
          underline="hover"
          sx={{ fontWeight: 700, color: "primary.main" }}
        >
          Create an account
        </Link>
      </Typography>
    </Stack>
  );
};

export default Login;
