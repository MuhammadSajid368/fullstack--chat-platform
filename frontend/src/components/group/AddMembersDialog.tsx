import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { useDispatch } from "../../redux/store";
import { addGroupMembers } from "../../redux/slices/chatSlice";
import type { User } from "../../types/chat";
import UserAvatar from "../UserAvatar";

interface AddMembersDialogProps {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  candidates: User[];
}

const AddMembersDialog = ({
  open,
  onClose,
  conversationId,
  candidates,
}: AddMembersDialogProps) => {
  const dispatch = useDispatch();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const toggleUser = (userId: string) => {
    setSelectedIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleAdd = async () => {
    if (selectedIds.length === 0) {
      setError("Select at least one member");
      return;
    }
    const result = await dispatch(
      addGroupMembers({ conversationId, memberUserIds: selectedIds })
    );
    if (addGroupMembers.fulfilled.match(result)) {
      setSelectedIds([]);
      setError(null);
      onClose();
      return;
    }
    setError(
      typeof result.payload === "string"
        ? result.payload
        : "Failed to add members"
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="add-members-title"
    >
      <DialogTitle id="add-members-title">Add members</DialogTitle>
      <DialogContent>
        {candidates.length === 0 ? (
          <Stack py={2}>No users available to add.</Stack>
        ) : (
          <Stack spacing={1} py={1}>
            {candidates.map((user) => {
              const selected = selectedIds.includes(user.id);
              return (
                <Button
                  key={user.id}
                  variant={selected ? "contained" : "outlined"}
                  onClick={() => toggleUser(user.id)}
                  startIcon={<UserAvatar name={user.name} size={24} />}
                  aria-pressed={selected}
                  aria-label={`${selected ? "Deselect" : "Select"} ${user.name}`}
                  sx={{ justifyContent: "flex-start" }}
                >
                  {user.name}
                </Button>
              );
            })}
          </Stack>
        )}
        {error && (
          <Typography color="error" variant="caption" mt={1}>
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => void handleAdd()}
          disabled={candidates.length === 0}
          aria-label="Confirm add members"
        >
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddMembersDialog;
