import { forwardRef, useMemo, useState } from "react";
import type { ReactElement, Ref } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  useTheme,
  Slide,
} from "@mui/material";
import type { TransitionProps } from "@mui/material/transitions";
import { Bell, CaretRight, Star, Users, X } from "phosphor-react";
import { useDispatch, useSelector } from "../redux/store";
import { toggleSidebar, updateSidebarType } from "../redux/slices/appSlice";
import {
  leaveGroup,
  muteConversation,
  removeGroupMember,
  transferGroupOwnership,
  updateGroup,
  deleteGroup,
  changeGroupMemberRole,
} from "../redux/slices/chatSlice";
import AntSwitch from "./AntSwitch";
import UserAvatar from "./UserAvatar";
import {
  selectActiveConversation,
  selectActiveGroupMembers,
  selectActiveMessages,
  selectCurrentUserGroupRole,
  selectInvitableUsers,
  selectOtherParticipant,
  selectOtherParticipantPresence,
} from "../redux/selectors/chatSelectors";
import { canManageMembers, canRemoveMember } from "../utils/groupPermissions";
import AddMembersDialog from "./group/AddMembersDialog";
import { formatLastSeen } from "../utils/formatLastSeen";

const Transition = forwardRef(function Transition(
  props: TransitionProps & { children: ReactElement },
  ref: Ref<unknown>
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

const roleLabel = (role: string): string => {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Member";
};

const Contact = () => {
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [transferUserId, setTransferUserId] = useState("");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const theme = useTheme();
  const dispatch = useDispatch();
  const conversation = useSelector(selectActiveConversation);
  const participant = useSelector(selectOtherParticipant);
  const presence = useSelector(selectOtherParticipantPresence);
  const lastSeenByUserId = useSelector(
    (state) => state.presence.lastSeenByUserId
  );
  const messages = useSelector(selectActiveMessages);
  const groupMembers = useSelector(selectActiveGroupMembers);
  const currentRole = useSelector(selectCurrentUserGroupRole);
  const invitableUsers = useSelector(selectInvitableUsers);
  const groupActionError = useSelector((state) => state.chat.groupActionError);

  const muted = Boolean(conversation?.muted);

  const mediaImages = useMemo(
    () =>
      messages
        .filter((message) => message.type === "image" && message.imageUrl)
        .map((message) => message.imageUrl as string)
        .slice(0, 3),
    [messages]
  );

  if (!conversation) {
    return (
      <Box sx={{ width: { xs: "100%", md: 320 }, p: 3 }}>
        <Alert severity="info">Select a conversation to view details.</Alert>
      </Box>
    );
  }

  const isGroup = conversation.type === "group";
  const canManage = canManageMembers(currentRole);

  const handleLeaveGroup = async () => {
    if (!conversation) return;
    const result = await dispatch(leaveGroup(conversation.id));
    if (leaveGroup.fulfilled.match(result)) {
      setLeaveOpen(false);
      dispatch(toggleSidebar());
    }
  };

  const handleTransferAndLeave = async () => {
    if (!conversation || !transferUserId) return;
    const transferResult = await dispatch(
      transferGroupOwnership({
        conversationId: conversation.id,
        toUserId: transferUserId,
      })
    );
    if (transferGroupOwnership.fulfilled.match(transferResult)) {
      await dispatch(leaveGroup(conversation.id));
      setLeaveOpen(false);
      dispatch(toggleSidebar());
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    if (!conversation) return;
    await dispatch(
      removeGroupMember({
        conversationId: conversation.id,
        targetUserId,
      })
    );
  };

  return (
    <Box sx={{ width: { xs: "100%", md: 320 }, height: "100vh", flexShrink: 0 }}>
      <Stack sx={{ height: "100%" }}>
        <Box
          sx={{
            boxShadow: "0px 0px 2px rgba(0, 0, 0, 0.25)",
            width: "100%",
            backgroundColor:
              theme.palette.mode === "light"
                ? "#F8FAFF"
                : theme.palette.background.paper,
          }}
        >
          <Stack
            sx={{ p: 2 }}
            direction="row"
            alignItems="center"
            justifyContent="space-between"
          >
            <Typography variant="subtitle2">
              {isGroup ? "Group Info" : "Contact Info"}
            </Typography>
            <IconButton
              onClick={() => dispatch(toggleSidebar())}
              aria-label="Close details panel"
            >
              <X />
            </IconButton>
          </Stack>
        </Box>

        <Stack sx={{ flexGrow: 1, overflowY: "auto", minHeight: 0 }} p={3} spacing={3}>
          {groupActionError && (
            <Alert severity="error" role="alert">
              {groupActionError}
            </Alert>
          )}

          {isGroup ? (
            <>
              <Stack alignItems="center" spacing={2}>
                <Box sx={{ position: "relative" }}>
                  <UserAvatar name={conversation.name} src={conversation.avatar} size={64} />
                  <Users
                    size={20}
                    style={{ position: "absolute", bottom: 0, right: 0 }}
                    aria-hidden
                  />
                </Box>
                <Typography variant="subtitle1" fontWeight={600}>
                  {conversation.name}
                </Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  {conversation.description || "No description"}
                </Typography>
                <Typography variant="caption" aria-label={`${groupMembers.length} members`}>
                  {groupMembers.length} members
                </Typography>
              </Stack>

              <Divider />

              <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="subtitle2">Members</Typography>
                  {canManage && (
                    <Button
                      size="small"
                      onClick={() => setAddMembersOpen(true)}
                      aria-label="Add members to group"
                    >
                      Add members
                    </Button>
                  )}
                </Stack>
                <List dense aria-label="Group members">
                  {groupMembers.map(({ user, role, isCurrentUser }) => (
                    <ListItem
                      key={user.id}
                      secondaryAction={
                        <Stack direction="row" spacing={1} alignItems="center">
                          {currentRole === "owner" &&
                            !isCurrentUser &&
                            role !== "owner" && (
                              <Select
                                size="small"
                                value={role}
                                aria-label={`Change role for ${user.name}`}
                                onChange={(event) => {
                                  const nextRole = event.target.value as
                                    | "admin"
                                    | "member";
                                  void dispatch(
                                    changeGroupMemberRole({
                                      conversationId: conversation.id,
                                      targetUserId: user.id,
                                      role: nextRole,
                                    })
                                  );
                                }}
                              >
                                <MenuItem value="admin">Admin</MenuItem>
                                <MenuItem value="member">Member</MenuItem>
                              </Select>
                            )}
                          {canRemoveMember(currentRole, role) &&
                            !isCurrentUser && (
                              <Button
                                size="small"
                                color="error"
                                onClick={() => void handleRemoveMember(user.id)}
                                aria-label={`Remove ${user.name} from group`}
                              >
                                Remove
                              </Button>
                            )}
                        </Stack>
                      }
                    >
                      <UserAvatar name={user.name} size={32} />
                      <ListItemText
                        sx={{ ml: 2 }}
                        primary={isCurrentUser ? `${user.name} (You)` : user.name}
                        secondary={
                          <Chip
                            label={roleLabel(role)}
                            size="small"
                            sx={{ mt: 0.5, height: 20 }}
                          />
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              </Stack>

              <Divider />

              <Button
                color="error"
                variant="outlined"
                fullWidth
                onClick={() => setLeaveOpen(true)}
                aria-label="Leave group"
              >
                Leave group
              </Button>
            </>
          ) : (
            participant && (
              <>
                <Stack alignItems="center" direction="row" spacing={2}>
                  <UserAvatar name={participant.name} size={64} />
                  <Stack spacing={0.5}>
                    <Typography variant="subtitle1" fontWeight={600}>
                      {participant.name}
                    </Typography>
                    <Typography variant="body2">{participant.phone}</Typography>
                    <Typography variant="caption" aria-label={`Status: ${presence}`}>
                      {presence === "online"
                        ? "Online"
                        : presence === "away"
                          ? "Away"
                          : formatLastSeen(
                              participant
                                ? lastSeenByUserId[participant.id]
                                : null
                            ) ?? "Offline"}
                    </Typography>
                  </Stack>
                </Stack>
                <Divider />
                <Stack spacing={0.5}>
                  <Typography variant="subtitle2">About</Typography>
                  <Typography variant="body2">{participant.about}</Typography>
                </Stack>
              </>
            )
          )}

          <Divider />

          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="subtitle2">Media, Links & Docs</Typography>
            <Button
              onClick={() => dispatch(updateSidebarType({ type: "SHARED" }))}
              endIcon={<CaretRight />}
              aria-label="View shared media"
            >
              {mediaImages.length}
            </Button>
          </Stack>

          {mediaImages.length > 0 && (
            <Stack direction="row" spacing={2}>
              {mediaImages.map((src) => (
                <Box key={src} sx={{ width: 64, height: 64, overflow: "hidden", borderRadius: 1 }}>
                  <img
                    src={src}
                    alt="Shared media"
                    loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </Box>
              ))}
            </Stack>
          )}

          <Divider />

          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack direction="row" alignItems="center" spacing={2}>
              <Star />
              <Typography variant="subtitle2">Starred Messages</Typography>
            </Stack>
            <IconButton
              onClick={() => dispatch(updateSidebarType({ type: "STARRED" }))}
              aria-label="View starred messages"
            >
              <CaretRight />
            </IconButton>
          </Stack>

          {!isGroup && (
            <>
              <Divider />
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Bell size={21} />
                  <Typography variant="subtitle2">Mute notifications</Typography>
                </Stack>
                <AntSwitch
                  checked={muted}
                  onChange={(event) => {
                    void dispatch(
                      muteConversation({
                        conversationId: conversation.id,
                        muted: event.target.checked,
                      })
                    );
                  }}
                  inputProps={{ "aria-label": "Mute notifications" }}
                />
              </Stack>
            </>
          )}

          {isGroup && canManage && (
            <>
              <Divider />
              <Stack spacing={1.5}>
                <Typography variant="subtitle2">Group settings</Typography>
                <TextField
                  size="small"
                  label="Name"
                  value={editName || conversation.name}
                  onChange={(e) => setEditName(e.target.value)}
                  fullWidth
                />
                <TextField
                  size="small"
                  label="Description"
                  value={
                    editDescription ||
                    conversation.description ||
                    ""
                  }
                  onChange={(e) => setEditDescription(e.target.value)}
                  fullWidth
                  multiline
                  minRows={2}
                />
                <Button
                  variant="outlined"
                  onClick={() =>
                    void dispatch(
                      updateGroup({
                        conversationId: conversation.id,
                        name: (editName || conversation.name).trim(),
                        description: (
                          editDescription ||
                          conversation.description ||
                          ""
                        ).trim() || null,
                      })
                    )
                  }
                >
                  Save group
                </Button>
                {currentRole === "owner" && (
                  <Button
                    color="error"
                    variant="outlined"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Delete this group for everyone? This cannot be undone."
                        )
                      ) {
                        void dispatch(deleteGroup(conversation.id));
                      }
                    }}
                  >
                    Delete group
                  </Button>
                )}
              </Stack>
            </>
          )}
        </Stack>
      </Stack>

      {conversation && (
        <AddMembersDialog
          open={addMembersOpen}
          onClose={() => setAddMembersOpen(false)}
          conversationId={conversation.id}
          candidates={invitableUsers}
        />
      )}

      <Dialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        TransitionComponent={Transition}
        aria-labelledby="leave-group-title"
      >
        <DialogTitle id="leave-group-title">Leave group?</DialogTitle>
        <DialogContent>
          {currentRole === "owner" && groupMembers.length > 1 ? (
            <Stack spacing={2}>
              <DialogContentText>
                You are the only owner. Transfer ownership before leaving.
              </DialogContentText>
              <Select
                fullWidth
                value={transferUserId}
                onChange={(event) => setTransferUserId(event.target.value)}
                displayEmpty
                inputProps={{ "aria-label": "Select new owner" }}
              >
                <MenuItem value="" disabled>
                  Select new owner
                </MenuItem>
                {groupMembers
                  .filter((member) => member.role !== "owner")
                  .map(({ user }) => (
                    <MenuItem key={user.id} value={user.id}>
                      {user.name}
                    </MenuItem>
                  ))}
              </Select>
            </Stack>
          ) : (
            <DialogContentText>
              Are you sure you want to leave {conversation.name}?
            </DialogContentText>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLeaveOpen(false)}>Cancel</Button>
          {currentRole === "owner" && groupMembers.length > 1 ? (
            <Button
              color="error"
              variant="contained"
              disabled={!transferUserId}
              onClick={() => void handleTransferAndLeave()}
              aria-label="Transfer ownership and leave group"
            >
              Transfer and leave
            </Button>
          ) : (
            <Button
              color="error"
              variant="contained"
              onClick={() => void handleLeaveGroup()}
              aria-label="Confirm leave group"
            >
              Leave group
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Contact;
