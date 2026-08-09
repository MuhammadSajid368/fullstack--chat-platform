import { yupResolver } from "@hookform/resolvers/yup";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { SubmitHandler, UseFormReturn, FieldValues } from "react-hook-form";
import * as Yup from "yup";
import FormProvider from "../../components/hook-form/FormProvider";
import {
  Alert,
  Button,
  IconButton,
  InputAdornment,
  Stack,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import type { SxProps, Theme } from "@mui/material/styles";
import RHFTextField from "../../components/hook-form/RHFTextField";
import { Eye, EyeSlash } from "phosphor-react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "../../redux/store";
import { register as registerUser } from "../../redux/slices/authSlice";
import { selectAuthError } from "../../redux/selectors/authSelectors";
import { DEFAULT_PATH } from "../../config";

interface RegisterFormValues {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  afterSubmit?: string;
}

const RegisterForm = () => {
  const [showPassword, setShowPassword] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const authError = useSelector(selectAuthError);

  const RegisterSchema = Yup.object().shape({
    firstName: Yup.string().required("Please enter your First name"),
    lastName: Yup.string().required("Please enter your Last name"),
    email: Yup.string()
      .required("Email is required")
      .email("Email must be a valid email address"),
    password: Yup.string()
      .required("Password is required")
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password must be at most 72 characters"),
  });

  const defaultValues = {
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  };

  const methods = useForm<RegisterFormValues>({
    resolver: yupResolver(RegisterSchema),
    defaultValues,
  });

  const {
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = methods;

  const onSubmit: SubmitHandler<RegisterFormValues> = async (data) => {
    const name = `${data.firstName} ${data.lastName}`.trim();
    const result = await dispatch(
      registerUser({
        name,
        email: data.email.trim().toLowerCase(),
        password: data.password,
      })
    );
    if (registerUser.fulfilled.match(result)) {
      navigate(DEFAULT_PATH);
      return;
    }
    setError("afterSubmit", {
      message:
        typeof result.payload === "string"
          ? result.payload
          : authError || "Registration failed",
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
        {(!!errors.afterSubmit || authError) && (
          <Alert severity="error" sx={{ borderRadius: 1.5 }}>
            {errors.afterSubmit?.message || authError}
          </Alert>
        )}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <RHFTextField
            name="firstName"
            label="First name"
            autoComplete="given-name"
            sx={fieldSx}
          />
          <RHFTextField
            name="lastName"
            label="Last name"
            autoComplete="family-name"
            sx={fieldSx}
          />
        </Stack>
        <RHFTextField
          name="email"
          label="Email"
          autoComplete="email"
          sx={fieldSx}
        />
        <RHFTextField
          name="password"
          label="Password"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          helperText="At least 8 characters"
          sx={fieldSx}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => {
                    setShowPassword(!showPassword);
                  }}
                  edge="end"
                >
                  {showPassword ? <Eye size={20} /> : <EyeSlash size={20} />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        <Button
          fullWidth
          color="primary"
          size="large"
          type="submit"
          variant="contained"
          disabled={isSubmitting}
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
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </Stack>
    </FormProvider>
  );
};

export default RegisterForm;
