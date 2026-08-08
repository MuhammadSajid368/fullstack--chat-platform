import {
  Box,
  IconButton,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { ArrowLeft, Users } from "phosphor-react";
import { useDispatch, useSelector } from "../../redux/store";
import { toggleSidebar } from "../../redux/slices/appSlice";
import { setMobileView } from "../../redux/slices/chatSlice";
import {
  selectActiveConversation,
  selectActiveGroupMembers,
  selectOtherParticipantPresence,
} from "../../redux/selectors/chatSelectors";
import { selectCurrentUserId } from "../../redux/selectors/authSelectors";
import useResponsive from "../../hooks/useResponsive";
import UserAvatar from "../UserAvatar";
import { formatLastSeen } from "../../utils/formatLastSeen";

const Header = () => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const isMobile = useResponsive("down", "md");
  const conversation = useSelector(selectActiveConversation);
  const groupMembers = useSelector(selectActiveGroupMembers);
  const presence = useSelector(selectOtherParticipantPresence);
  const currentUserId = useSelector(selectCurrentUserId);
  const lastSeenByUserId = useSelector(
    (state) => state.presence.lastSeenByUserId
  );

  if (!conversation) {
    return null;
  }

  const isGroup = conversation.type === "group";
  const memberCount = isGroup ? groupMembers.length : 0;
  const peerId =
    !isGroup && currentUserId
      ? conversation.memberIds.find((id) => id !== currentUserId)
      : undefined;
  const lastSeenLabel =
    !isGroup && presence !== "online" && presence !== "away" && peerId
      ? formatLastSeen(lastSeenByUserId[peerId])
      : null;

  const statusLabel = isGroup
    ? `${memberCount} members`
    : presence === "online"
      ? "Online"
      : presence === "away"
        ? "Away"
        : lastSeenLabel ?? "Offline";

  const handleBack = () => {
    dispatch(setMobileView("list"));
  };

  return (
    <Box
      p={2}
      sx={{
        width: "100%",
        backgroundColor:
          theme.palette.mode === "light"
            ? "#F8FAFF"
            : theme.palette.background.paper,
        boxShadow: "0px 0px 2px rgba(0, 0, 0, 0.25)",
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5}>
        {isMobile && (
          <IconButton onClick={handleBack} aria-label="Back to conversation list">
            <ArrowLeft />
          </IconButton>
        )}
        <Stack
          onClick={() => dispatch(toggleSidebar())}
          direction="row"
          spacing={2}
          alignItems="center"
          sx={{ cursor: "pointer", flex: 1, minWidth: 0 }}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              dispatch(toggleSidebar());
            }
          }}
          aria-label={isGroup ? "Open group info" : "Open contact info"}
        >
          {isGroup ? (
            <Box sx={{ position: "relative" }}>
              <UserAvatar name={conversation.name} src={conversation.avatar} />
              <Users
                size={16}
                style={{ position: "absolute", bottom: 0, right: 0 }}
                aria-hidden
              />
            </Box>
          ) : (
            <UserAvatar name={conversation.name} src={conversation.avatar} />
          )}
          <Stack spacing={0.2} sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" noWrap>
              {conversation.name}
            </Typography>
            <Typography variant="caption">{statusLabel}</Typography>
          </Stack>
        </Stack>
      </Stack>
    </Box>
  );
};

export default Header;
