import FormProvider from "../../components/hook-form/FormProvider";
import * as Yup from "yup";
import { yupResolver } from "@hookform/resolvers/yup";
import { useForm } from "react-hook-form";
import type { UseFormReturn, FieldValues, Resolver } from "react-hook-form";
import type { ChangeEvent } from "react";
import { Alert, Avatar, Box, Button, Stack, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import RHFTextField from "../../components/hook-form/RHFTextField";
import { useDispatch, useSelector } from "../../redux/store";
import { selectAuthUser } from "../../redux/selectors/authSelectors";
import { setAuthenticatedUser } from "../../redux/slices/authSlice";
import { getUserService } from "../../services/serviceRegistry";

interface ProfileFormValues {
  name: string;
  about: string;
  phone: string;
  avatarUrl: string;
  afterSubmit?: string;
}

const DATA_IMAGE_REGEX = /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i;

const ProfileForm = () => {
  const dispatch = useDispatch();
  const authUser = useSelector(selectAuthUser);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const ProfileSchema = Yup.object().shape({
    name: Yup.string().required("Name is required").max(120),
    about: Yup.string().max(500),
    phone: Yup.string().max(32),
    avatarUrl: Yup.string()
      .test(
        "avatar-url-or-data-image",
        "Avatar must be an http(s) URL or uploaded image",
        (value) => {
          if (!value) return true;
          if (DATA_IMAGE_REGEX.test(value)) return true;
          try {
            const url = new URL(value);
            return url.protocol === "http:" || url.protocol === "https:";
          } catch {
            return false;
          }
        }
      )
      .nullable()
      .optional(),
  });

  const methods = useForm<ProfileFormValues>({
    resolver: yupResolver(ProfileSchema) as unknown as Resolver<ProfileFormValues>,
    defaultValues: {
      name: authUser?.name ?? "",
      about: "",
      phone: "",
      avatarUrl: authUser?.avatar ?? "",
    },
  });

  const {
    reset,
    setError,
    setValue,
    handleSubmit,
    watch,
    formState: { errors },
  } = methods;
  const avatarPreview = watch("avatarUrl");

  const handleAvatarPick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("avatarUrl", {
        type: "manual",
        message: "Please select an image file.",
      });
      return;
    }
    if (file.size > 1_500_000) {
      setError("avatarUrl", {
        type: "manual",
        message: "Please upload an image smaller than 1.5MB.",
      });
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Unable to read file"));
        reader.readAsDataURL(file);
      });
      setValue("avatarUrl", dataUrl, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
    } catch {
      setError("avatarUrl", {
        type: "manual",
        message: "Unable to process image. Please try another file.",
      });
    } finally {
      event.target.value = "";
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!authUser?.id) return;
      try {
        const me = await getUserService().getUserById(authUser.id);
        if (cancelled) return;
        reset({
          name: me.name,
          about: me.about ?? "",
          phone: me.phone ?? "",
          avatarUrl: me.avatar ?? "",
        });
      } catch {
        // Keep auth defaults when profile fetch fails.
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [authUser?.id, authUser?.name, authUser?.avatar, reset]);

  const onSubmit = async (data: ProfileFormValues) => {
    setSaving(true);
    try {
      const updated = await getUserService().updateMyProfile({
        name: data.name.trim(),
        about: data.about.trim() || null,
        phone: data.phone.trim() || null,
        avatarUrl: data.avatarUrl.trim() || null,
      });
      if (authUser) {
        dispatch(
          setAuthenticatedUser({
            ...authUser,
            name: updated.name,
            avatar: updated.avatar,
          })
        );
      }
      reset({
        name: updated.name,
        about: updated.about ?? "",
        phone: updated.phone ?? "",
        avatarUrl: updated.avatar ?? "",
      });
      toast.success("Profile updated");
    } catch (error) {
      setError("afterSubmit", {
        message: error instanceof Error ? error.message : "Update failed",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormProvider
      methods={methods as unknown as UseFormReturn<FieldValues>}
      onSubmit={handleSubmit(onSubmit)}
    >
      <Stack spacing={3}>
        <Stack spacing={3}>
          {!!errors.afterSubmit && (
            <Alert severity="error">{errors.afterSubmit.message}</Alert>
          )}
          <Stack direction="row" alignItems="center" spacing={2}>
            <Avatar
              src={avatarPreview || undefined}
              alt={watch("name") || "Profile"}
              sx={{ width: 64, height: 64 }}
            />
            <Box>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                hidden
                onChange={handleAvatarFileChange}
              />
              <Button variant="outlined" onClick={handleAvatarPick}>
                Upload photo
              </Button>
              <Typography variant="caption" display="block" mt={1}>
                PNG/JPG/WEBP/GIF, max 1.5MB
              </Typography>
            </Box>
          </Stack>

          <RHFTextField
            name="name"
            label="Name"
            helperText="This name is visible to your contacts"
          />
          <RHFTextField name="phone" label="Phone" />
          <RHFTextField
            multiline
            rows={3}
            maxRows={5}
            name="about"
            label="About"
          />
        </Stack>
        <Stack direction={"row"} justifyContent={"end"}>
          <Button
            color="primary"
            size="large"
            type="submit"
            variant="outlined"
            disabled={saving}
          >
            Save
          </Button>
        </Stack>
      </Stack>
    </FormProvider>
  );
};

export default ProfileForm;
