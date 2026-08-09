import { useEffect, useState } from "react";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import type { SubmitHandler, UseFormReturn, FieldValues } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as Yup from "yup";
import {
  Alert,
  Button,
  IconButton,
  InputAdornment,
  Link,
  Stack,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import type { SxProps, Theme } from "@mui/material/styles";
import { Eye, EyeSlash } from "phosphor-react";
import FormProvider from "../../components/hook-form/FormProvider";
import RHFTextField from "../../components/hook-form/RHFTextField";
import { useDispatch, useSelector } from "../../redux/store";
import { clearAuthError, login } from "../../redux/slices/authSlice";
import { initializeChat } from "../../redux/slices/chatSlice";
import { selectAuthError } from "../../redux/selectors/authSelectors";
import { isDevEnvironment, isMockMode } from "../../config/env";
import { DEFAULT_PATH } from "../../config";

interface LoginFormValues {
  email: string;
  password: string;
}

const LoginForm = () => {
  const [showPassword, setShowPassword] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const authError = useSelector(selectAuthError);
  const [sessionExpiredFromRedirect, setSessionExpiredFromRedirect] =
    useState(false);
  const sessionExpiredNotice =
    sessionExpiredFromRedirect ||
    (authError && /session has expired/i.test(authError))
      ? "Your session has expired. Please sign in again."
      : null;
  const from =
    (location.state as { from?: { pathname: string } } | null)?.from
      ?.pathname ?? DEFAULT_PATH;

  const LoginSchema = Yup.object().shape({
    email: Yup.string()
      .required("Email is required")
      .email("Email must be a valid email address"),
    password: Yup.string().required("Password is required"),
  });

  const methods = useForm<LoginFormValues>({
    resolver: yupResolver(LoginSchema),
    defaultValues: { email: "", password: "" },
  });

  const {
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = methods;

  useEffect(() => {
    try {
      if (sessionStorage.getItem("auth:sessionExpired") === "1") {
        sessionStorage.removeItem("auth:sessionExpired");
        setSessionExpiredFromRedirect(true);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    // Drop stale session-expiry banner once the user leaves the login screen.
    return () => {
      dispatch(clearAuthError());
    };
  }, [dispatch]);

  const onSubmit: SubmitHandler<LoginFormValues> = async (data) => {
    dispatch(clearAuthError());
    clearErrors("root");
    const result = await dispatch(login(data));
    if (login.fulfilled.match(result)) {
      await dispatch(initializeChat());
      navigate(from, { replace: true });
      return;
    }
    setError("root", {
      type: "manual",
      message:
        typeof result.payload === "string"
          ? result.payload
          : "Invalid email or password",
    });
  };

  const fieldSx: SxProps<Theme> = {
    "& .MuiOutlinedInput-root": {
      borderRadius: 1.5,
      bgcolor: (theme) =>
        theme.palette.mode === "light" ? "common.white" : "background.paper",
      transition: "box-shadow 0.2s ease, border-color 0.2s ease",
      "&.Mui-focused": {
        boxShadow: (theme) =>
          `0 0 0 3px ${alpha(theme.palette.primary.main, 0.16)}`,
      },
    },
  };

  return (
    <FormProvider
      methods={methods as unknown as UseFormReturn<FieldValues>}
      onSubmit={handleSubmit(onSubmit)}
    >
      <Stack spacing={2.5}>
        {sessionExpiredNotice && (
          <Alert severity="warning" role="alert" sx={{ borderRadius: 1.5 }}>
            {sessionExpiredNotice}
          </Alert>
        )}
        {isDevEnvironment && isMockMode() && (
          <Alert severity="info" role="note" sx={{ borderRadius: 1.5 }}>
            Mock mode is active. Development demo credentials are documented in
            docs/DEV_AUTH.md.
          </Alert>
        )}
        {errors.root && (
          <Alert severity="error" role="alert" sx={{ borderRadius: 1.5 }}>
            {errors.root.message}
          </Alert>
        )}
        <RHFTextField
          name="email"
          label="Email"
          autoComplete="email"
          inputProps={{ "aria-label": "Email address" }}
          sx={fieldSx}
        />
        <RHFTextField
          name="password"
          label="Password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          inputProps={{ "aria-label": "Password" }}
          sx={fieldSx}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  edge="end"
                >
                  {showPassword ? <Eye size={20} /> : <EyeSlash size={20} />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        <Stack alignItems="flex-end" sx={{ mt: -0.5 }}>
          <Link
            component={RouterLink}
            to="/auth/reset-password"
            variant="body2"
            underline="hover"
            sx={{ fontWeight: 600, color: "text.secondary" }}
          >
            Forgot password?
          </Link>
        </Stack>
        <Button
          fullWidth
          color="primary"
          size="large"
          type="submit"
          variant="contained"
          disabled={isSubmitting}
          aria-label="Sign in"
          sx={{
            mt: 0.5,
            py: 1.35,
            borderRadius: 1.5,
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: "-0.01em",
            textTransform: "none",
            boxShadow: (theme) =>
              `0 8px 20px ${theme.palette.primary.main}33`,
            transition: "transform 0.15s ease, box-shadow 0.15s ease",
            "&:hover": {
              boxShadow: (theme) =>
                `0 10px 24px ${theme.palette.primary.main}44`,
              transform: "translateY(-1px)",
            },
            "&:active": {
              transform: "translateY(0)",
            },
          }}
        >
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </Stack>
    </FormProvider>
  );
};

export default LoginForm;
