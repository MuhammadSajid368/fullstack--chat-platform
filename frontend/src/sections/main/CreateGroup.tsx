import { forwardRef, useState } from "react";
import type { ReactElement, Ref } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Slide,
  Stack,
} from "@mui/material";
import type { TransitionProps } from "@mui/material/transitions";
import * as Yup from "yup";
import FormProvider from "../../components/hook-form/FormProvider";
import type { FieldValues, SubmitHandler, Resolver, UseFormReturn } from "react-hook-form";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useNavigate } from "react-router-dom";
import RHFTextField from "../../components/hook-form/RHFTextField";
import RHFAutoComplete from "../../components/hook-form/RHFAutoComplete";
import { useDispatch, useSelector } from "../../redux/store";
import { createGroup, fetchMessages } from "../../redux/slices/chatSlice";
import { selectUsers } from "../../redux/selectors/chatSelectors";
import { selectCurrentUserId } from "../../redux/selectors/authSelectors";
import { normalizeGroupText } from "../../utils/groupPermissions";

const Transition = forwardRef(function Transition(
  props: TransitionProps & { children: ReactElement },
  ref: Ref<unknown>
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

interface CreateGroupValues {
  title: string;
  description: string;
  members: string[];
}

interface CreateGroupFormProps {
  handleClose: () => void;
}

const CreateGroupForm = ({ handleClose }: CreateGroupFormProps) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const users = useSelector(selectUsers);
  const currentUserId = useSelector(selectCurrentUserId);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const memberOptions = Object.values(users)
    .filter((user) => user.id !== currentUserId)
    .map((user) => user.id);

  const memberLabels = Object.fromEntries(
    Object.values(users).map((user) => [user.id, user.name])
  );

  const NewGroupSchema = Yup.object().shape({
    title: Yup.string()
      .required("Group name is required")
      .test("not-empty", "Group name is required", (value) =>
        Boolean(value && normalizeGroupText(value))
      ),
    description: Yup.string(),
    members: Yup.array()
      .of(Yup.string().required())
      .min(2, "Select at least 2 members"),
  });

  const methods = useForm<CreateGroupValues>({
    resolver: yupResolver(NewGroupSchema) as unknown as Resolver<CreateGroupValues>,
    defaultValues: { title: "", description: "", members: [] },
  });

  const { handleSubmit } = methods;

  const onSubmit: SubmitHandler<CreateGroupValues> = async (data) => {
    setSubmitError(null);
    const result = await dispatch(
      createGroup({
        name: normalizeGroupText(data.title),
        description: normalizeGroupText(data.description),
        memberUserIds: data.members,
      })
    );

    if (createGroup.fulfilled.match(result)) {
      void dispatch(fetchMessages(result.payload.id));
      handleClose();
      navigate("/app");
      return;
    }

    const payload = result.payload as
      | { message?: string; fieldErrors?: Record<string, string> | null }
      | string
      | undefined;

    if (payload && typeof payload === "object") {
      if (payload.fieldErrors?.name) {
        methods.setError("title", {
          type: "server",
          message: payload.fieldErrors.name,
        });
      }
      if (payload.fieldErrors?.members) {
        methods.setError("members", {
          type: "server",
          message: payload.fieldErrors.members,
        });
      }
      setSubmitError(payload.message ?? "Failed to create group");
      return;
    }

    setSubmitError(
      typeof payload === "string" ? payload : "Failed to create group"
    );
  };

  return (
    <FormProvider
      methods={methods as unknown as UseFormReturn<FieldValues>}
      onSubmit={handleSubmit(onSubmit)}
    >
      <Stack spacing={3}>
        {submitError && <Alert severity="error">{submitError}</Alert>}
        <RHFTextField name="title" label="Group name" />
        <RHFTextField
          name="description"
          label="Description"
          inputProps={{ style: { height: "80px" } }}
        />
        <RHFAutoComplete
          name="members"
          label="Members"
          multiple
          options={memberOptions}
          getOptionLabel={(option: string) =>
            memberLabels[option] ?? option
          }
          ChipProps={{ size: "medium" }}
        />
        <Stack direction="row" spacing={2} justifyContent="flex-end">
          <Button onClick={handleClose}>Cancel</Button>
          <Button type="submit" variant="contained" aria-label="Create group">
            Create
          </Button>
        </Stack>
      </Stack>
    </FormProvider>
  );
};

interface CreateGroupProps {
  open: boolean;
  handleClose: () => void;
}

const CreateGroup = ({ open, handleClose }: CreateGroupProps) => {
  return (
    <Dialog
      fullWidth
      maxWidth="xs"
      open={open}
      TransitionComponent={Transition}
      aria-labelledby="create-group-title"
    >
      <DialogTitle id="create-group-title" sx={{ mb: 1 }}>
        Create New Group
      </DialogTitle>
      <DialogContent>
        <CreateGroupForm handleClose={handleClose} />
      </DialogContent>
    </Dialog>
  );
};

export default CreateGroup;
