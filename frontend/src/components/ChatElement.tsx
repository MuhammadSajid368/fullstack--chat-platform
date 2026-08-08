import { memo, useCallback, type KeyboardEvent } from "react";
import { Badge, Box, Chip, Stack, Typography, useTheme } from "@mui/material";
import { Users } from "phosphor-react";
import { StyledBadge } from "./StyledBadge";
import UserAvatar from "./UserAvatar";
import { formatConversationTime } from "../utils/formatMessageTime";

interface ChatElementProps {
  id: string;
  name: string;
  avatar: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  unread: number;
  isOnline: boolean;
  isGroup?: boolean;
  statusLabel: string;
  selected: boolean;
  onSelect: (id: string) => void;
}

const ChatElementComponent = ({
  id,
  name,
  avatar,
  lastMessagePreview,
  lastMessageAt,
  unread,
  isOnline,
  isGroup = false,
  statusLabel,
  selected,
  onSelect,
}: ChatElementProps) => {
  const theme = useTheme();

  const handleClick = useCallback(() => {
    onSelect(id);
  }, [id, onSelect]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(id);
    }
  };

  return (
    <Box
      role="option"
      aria-selected={selected}
      aria-label={isGroup ? `Group chat ${name}` : `Chat with ${name}`}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      sx={{
        width: "100%",
        borderRadius: 1,
        cursor: "pointer",
        backgroundColor: selected
          ? theme.palette.action.selected
          : theme.palette.mode === "light"
            ? "#fff"
            : theme.palette.background.default,
        outline: selected ? `2px solid ${theme.palette.primary.main}` : "none",
        "&:focus-visible": {
          outline: `2px solid ${theme.palette.primary.main}`,
        },
      }}
      p={2}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
      >
        <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0 }}>
          {isGroup ? (
            <Box sx={{ position: "relative" }}>
              <UserAvatar name={name} src={avatar} />
              <Box
                sx={{
                  position: "absolute",
                  bottom: -2,
                  right: -2,
                  bgcolor: "primary.main",
                  borderRadius: "50%",
                  p: 0.25,
                  display: "flex",
                }}
                aria-hidden
              >
                <Users size={12} color="#fff" weight="fill" />
              </Box>
            </Box>
          ) : isOnline ? (
            <StyledBadge
              overlap="circular"
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              variant="dot"
            >
              <UserAvatar name={name} src={avatar} />
            </StyledBadge>
          ) : (
            <UserAvatar name={name} src={avatar} />
          )}

          <Stack spacing={0.3} sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="subtitle2" noWrap>
                {name}
              </Typography>
              {isGroup && (
                <Chip
                  label="Group"
                  size="small"
                  sx={{ height: 18, fontSize: 10 }}
                />
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary" noWrap>
              {lastMessagePreview || "No messages yet"}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
              {statusLabel}
            </Typography>
          </Stack>
        </Stack>
        <Stack alignItems="flex-end" spacing={0.5} sx={{ flexShrink: 0, ml: 1 }}>
          <Typography sx={{ fontWeight: 600 }} variant="caption">
            {formatConversationTime(lastMessageAt)}
          </Typography>
          {unread > 0 && (
            <Badge
              color="primary"
              badgeContent={unread}
              aria-label={`${unread} unread messages`}
            />
          )}
        </Stack>
      </Stack>
    </Box>
  );
};

export const ChatElement = memo(ChatElementComponent);
