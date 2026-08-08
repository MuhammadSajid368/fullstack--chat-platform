import { IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { ArrowClockwise, Check, Checks, Clock, WarningCircle } from "phosphor-react";
import type { MessageStatus } from "../../types/chat";

interface MessageStatusIconProps {
  status: MessageStatus;
  onRetry?: () => void;
}

const statusLabels: Record<MessageStatus, string> = {
  sending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Failed to send",
};

const MessageStatusIcon = ({ status, onRetry }: MessageStatusIconProps) => {
  const label = statusLabels[status];

  if (status === "failed") {
    return (
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Tooltip title={label}>
          <WarningCircle size={14} color="#f44336" aria-label={label} />
        </Tooltip>
        {onRetry && (
          <IconButton
            size="small"
            onClick={onRetry}
            aria-label="Retry sending message"
            sx={{ p: 0.25 }}
          >
            <ArrowClockwise size={14} />
          </IconButton>
        )}
        <Typography variant="caption" color="error" sx={{ fontSize: 10 }}>
          Failed
        </Typography>
      </Stack>
    );
  }

  let icon = <Clock size={14} aria-label={label} />;
  if (status === "sent") {
    icon = <Check size={14} aria-label={label} />;
  }
  if (status === "delivered" || status === "read") {
    icon = (
      <Checks
        size={14}
        color={status === "read" ? "#4fc3f7" : undefined}
        aria-label={label}
      />
    );
  }

  return (
    <Stack direction="row" alignItems="center" spacing={0.25}>
      <Tooltip title={label}>{icon}</Tooltip>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
        {label}
      </Typography>
    </Stack>
  );
};

export default MessageStatusIcon;
