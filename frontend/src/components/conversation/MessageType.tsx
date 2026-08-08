import type { Theme } from "@mui/material/styles";
import {
  Box,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { DotsThreeVertical, DownloadSimple, Image as ImageIcon } from "phosphor-react";
import React, { useState } from "react";
import { toast } from "react-toastify";
import type { Message } from "../../types/chat";
import { formatMessageTime } from "../../utils/formatMessageTime";
import { sanitizeHttpUrl } from "../../utils/safeHttpUrl";
import MessageStatusIcon from "./MessageStatusIcon";

interface MessageBubbleProps {
  message: Message;
  currentUserId: string;
  senderName?: string;
  replyPreviewText?: string;
  showMenu?: boolean;
  onReply: (message: Message) => void;
  onDelete: (message: Message) => void;
  onToggleStar: (message: Message) => void;
  onTogglePin: (message: Message) => void;
  onRetry: (message: Message) => void;
}

interface MessageOptionsProps {
  message: Message;
  currentUserId: string;
  onReply: (message: Message) => void;
  onDelete: (message: Message) => void;
  onToggleStar: (message: Message) => void;
  onTogglePin: (message: Message) => void;
}

/** Light-mode incoming bubbles use a tinted surface with white text for contrast. */
function getBubbleStyles(
  theme: Theme,
  incoming: boolean
): { backgroundColor: string; color: string } {
  if (!incoming) {
    return {
      backgroundColor: theme.palette.primary.main,
      color: "#fff",
    };
  }

  if (theme.palette.mode === "light") {
    return {
      backgroundColor: theme.palette.primary.light,
      color: "#fff",
    };
  }

  return {
    backgroundColor: theme.palette.background.default,
    color: theme.palette.text.primary,
  };
}

const MessageOptions = ({
  message,
  currentUserId,
  onReply,
  onDelete,
  onToggleStar,
  onTogglePin,
}: MessageOptionsProps) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  const isOwn = message.senderId === currentUserId;

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleCopy = async () => {
    handleClose();
    const text = message.content.trim();
    if (!text) {
      toast.error("Nothing to copy");
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      toast.success("Message copied");
    } catch {
      toast.error("Could not copy message");
    }
  };

  const handleReply = () => {
    handleClose();
    onReply(message);
  };

  const handleStar = () => {
    handleClose();
    onToggleStar(message);
  };

  const handlePin = () => {
    handleClose();
    onTogglePin(message);
  };

  const handleDelete = () => {
    handleClose();
    onDelete(message);
  };

  return (
    <>
      <IconButton
        size="small"
        onClick={handleOpen}
        aria-label="Message actions"
        aria-controls={open ? "message-actions-menu" : undefined}
        aria-haspopup="true"
        aria-expanded={open ? "true" : undefined}
      >
        <DotsThreeVertical size={20} />
      </IconButton>
      <Menu
        id="message-actions-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
      >
        <MenuItem onClick={handleCopy}>Copy message</MenuItem>
        <MenuItem onClick={handleReply}>Reply</MenuItem>
        <MenuItem onClick={handlePin} aria-label={message.pinned ? "Unpin message" : "Pin message"}>
          {message.pinned ? "Unpin message" : "Pin message"}
        </MenuItem>
        <MenuItem onClick={handleStar}>
          {message.starred ? "Unstar message" : "Star message"}
        </MenuItem>
        {isOwn && <MenuItem onClick={handleDelete}>Delete message</MenuItem>}
      </Menu>
    </>
  );
};

const DeletedMessage = ({ incoming }: { incoming: boolean }) => {
  const theme = useTheme();
  const bubble = getBubbleStyles(theme, incoming);
  return (
    <Stack direction="row" justifyContent={incoming ? "start" : "end"}>
      <Box
        p={1.5}
        sx={{
          backgroundColor: bubble.backgroundColor,
          borderRadius: 1.5,
          width: "max-content",
          opacity: 0.8,
        }}
      >
        <Typography variant="body2" fontStyle="italic" sx={{ color: bubble.color }}>
          Message deleted
        </Typography>
      </Box>
    </Stack>
  );
};

const MessageMeta = ({
  message,
  incoming,
  onRetry,
}: {
  message: Message;
  incoming: boolean;
  onRetry?: () => void;
}) => (
  <Stack
    direction="row"
    alignItems="center"
    justifyContent={incoming ? "flex-start" : "flex-end"}
    spacing={1}
    sx={{ mt: 0.5, px: 0.5 }}
  >
    <Typography variant="caption" color="text.secondary">
      {formatMessageTime(message.createdAt)}
    </Typography>
    {!incoming && (
      <MessageStatusIcon status={message.status} onRetry={onRetry} />
    )}
  </Stack>
);

const SenderLabel = ({ name }: { name: string }) => (
  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, px: 0.5 }}>
    {name}
  </Typography>
);

const TextMessage = ({
  message,
  currentUserId,
  senderName,
  replyPreviewText,
  showMenu,
  onReply,
  onDelete,
  onToggleStar,
  onTogglePin,
  onRetry,
}: MessageBubbleProps) => {
  const theme = useTheme();
  const incoming = message.senderId !== currentUserId;
  const bubble = getBubbleStyles(theme, incoming);

  if (message.deleted) {
    return <DeletedMessage incoming={incoming} />;
  }

  return (
    <Stack>
      {incoming && senderName && <SenderLabel name={senderName} />}
      <Stack direction="row" justifyContent={incoming ? "start" : "end"} alignItems="flex-start">
        <Box
          p={1.5}
          sx={{
            backgroundColor: bubble.backgroundColor,
            borderRadius: 1.5,
            width: "max-content",
            maxWidth: "75%",
          }}
        >
          {message.type === "reply" && replyPreviewText && (
            <Box
              sx={{
                mb: 1,
                p: 1,
                borderLeft: 3,
                borderColor: theme.palette.mode === "light" ? "#fff" : "primary.main",
                bgcolor:
                  theme.palette.mode === "light"
                    ? "rgba(255,255,255,0.18)"
                    : theme.palette.background.paper,
                borderRadius: 1,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  color:
                    theme.palette.mode === "light"
                      ? "rgba(255,255,255,0.85)"
                      : "text.secondary",
                }}
              >
                {replyPreviewText}
              </Typography>
            </Box>
          )}
          <Typography variant="body2" sx={{ color: bubble.color }}>
            {message.content}
          </Typography>
        </Box>
        {showMenu && (
          <MessageOptions
            message={message}
            currentUserId={currentUserId}
            onReply={onReply}
            onDelete={onDelete}
            onToggleStar={onToggleStar}
            onTogglePin={onTogglePin}
          />
        )}
      </Stack>
      <MessageMeta
        message={message}
        incoming={incoming}
        onRetry={message.status === "failed" ? () => onRetry(message) : undefined}
      />
    </Stack>
  );
};

const MediaMessage = (props: MessageBubbleProps) => {
  const theme = useTheme();
  const {
    message,
    currentUserId,
    senderName,
    showMenu,
    onReply,
    onDelete,
    onToggleStar,
    onTogglePin,
    onRetry,
  } = props;
  const incoming = message.senderId !== currentUserId;
  const bubble = getBubbleStyles(theme, incoming);

  if (message.deleted) {
    return <DeletedMessage incoming={incoming} />;
  }

  return (
    <Stack>
      {incoming && senderName && <SenderLabel name={senderName} />}
      <Stack direction="row" justifyContent={incoming ? "start" : "end"} alignItems="flex-start">
        <Box
          p={1.5}
          sx={{
            backgroundColor: bubble.backgroundColor,
            borderRadius: 1.5,
            width: "max-content",
            maxWidth: "75%",
          }}
        >
          {message.imageUrl && (
            <img
              src={message.imageUrl}
              alt={message.content || "Image message"}
              loading="lazy"
              style={{ maxHeight: 210, borderRadius: 10, display: "block" }}
            />
          )}
          {message.content && (
            <Typography variant="body2" sx={{ mt: 1, color: bubble.color }}>
              {message.content}
            </Typography>
          )}
        </Box>
        {showMenu && (
          <MessageOptions
            message={message}
            currentUserId={currentUserId}
            onReply={onReply}
            onDelete={onDelete}
            onToggleStar={onToggleStar}
            onTogglePin={onTogglePin}
          />
        )}
      </Stack>
      <MessageMeta
        message={message}
        incoming={incoming}
        onRetry={message.status === "failed" ? () => onRetry(message) : undefined}
      />
    </Stack>
  );
};

const DocMessage = (props: MessageBubbleProps) => {
  const theme = useTheme();
  const {
    message,
    currentUserId,
    senderName,
    showMenu,
    onReply,
    onDelete,
    onToggleStar,
    onTogglePin,
    onRetry,
  } = props;
  const incoming = message.senderId !== currentUserId;
  const bubble = getBubbleStyles(theme, incoming);

  if (message.deleted) {
    return <DeletedMessage incoming={incoming} />;
  }

  return (
    <Stack>
      {incoming && senderName && <SenderLabel name={senderName} />}
      <Stack direction="row" justifyContent={incoming ? "start" : "end"} alignItems="flex-start">
        <Box
          p={1.5}
          sx={{
            backgroundColor: bubble.backgroundColor,
            borderRadius: 1.5,
            width: "max-content",
            maxWidth: "75%",
          }}
        >
          <Stack
            p={2}
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{
              backgroundColor:
                theme.palette.mode === "light"
                  ? "rgba(255,255,255,0.2)"
                  : theme.palette.background.paper,
              borderRadius: 1,
              color: bubble.color,
            }}
          >
            <ImageIcon size={32} />
            <Typography variant="caption" sx={{ color: bubble.color }}>
              {message.documentName ?? "Document"}
            </Typography>
            <IconButton
              size="small"
              aria-label="Download document"
              disabled
              sx={{ color: bubble.color }}
            >
              <DownloadSimple />
            </IconButton>
          </Stack>
          {message.content && (
            <Typography variant="body2" sx={{ mt: 1, color: bubble.color }}>
              {message.content}
            </Typography>
          )}
        </Box>
        {showMenu && (
          <MessageOptions
            message={message}
            currentUserId={currentUserId}
            onReply={onReply}
            onDelete={onDelete}
            onToggleStar={onToggleStar}
            onTogglePin={onTogglePin}
          />
        )}
      </Stack>
      <MessageMeta
        message={message}
        incoming={incoming}
        onRetry={message.status === "failed" ? () => onRetry(message) : undefined}
      />
    </Stack>
  );
};

const LinkMessage = (props: MessageBubbleProps) => {
  const theme = useTheme();
  const {
    message,
    currentUserId,
    senderName,
    showMenu,
    onReply,
    onDelete,
    onToggleStar,
    onTogglePin,
    onRetry,
  } = props;
  const incoming = message.senderId !== currentUserId;
  const bubble = getBubbleStyles(theme, incoming);
  const previewUrl = sanitizeHttpUrl(message.linkPreview?.url);
  const previewImageUrl = sanitizeHttpUrl(message.linkPreview?.imageUrl);
  const previewTitle = message.linkPreview?.title
    ? String(message.linkPreview.title).slice(0, 200)
    : "";

  if (message.deleted) {
    return <DeletedMessage incoming={incoming} />;
  }

  return (
    <Stack>
      {incoming && senderName && <SenderLabel name={senderName} />}
      <Stack direction="row" justifyContent={incoming ? "start" : "end"} alignItems="flex-start">
        <Box
          p={1.5}
          sx={{
            backgroundColor: bubble.backgroundColor,
            borderRadius: 1.5,
            width: "max-content",
            maxWidth: "75%",
          }}
        >
          {previewUrl && (
            <Stack
              p={2}
              spacing={1}
              sx={{
                backgroundColor:
                  theme.palette.mode === "light"
                    ? "rgba(255,255,255,0.2)"
                    : theme.palette.background.paper,
                borderRadius: 1,
                color: bubble.color,
              }}
            >
              {previewImageUrl && (
                <img
                  src={previewImageUrl}
                  alt={previewTitle || "Link preview"}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  style={{ maxHeight: 160, borderRadius: 4, width: "100%" }}
                />
              )}
              {previewTitle && (
                <Typography variant="subtitle2" sx={{ color: bubble.color }}>
                  {previewTitle}
                </Typography>
              )}
              <Typography
                variant="caption"
                component="a"
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                sx={{
                  color:
                    theme.palette.mode === "light"
                      ? "#fff"
                      : theme.palette.primary.main,
                  textDecoration: "underline",
                  wordBreak: "break-all",
                }}
              >
                {previewUrl}
              </Typography>
            </Stack>
          )}
          {message.content && (
            <Typography variant="body2" sx={{ mt: 1, color: bubble.color }}>
              {message.content}
            </Typography>
          )}
        </Box>
        {showMenu && (
          <MessageOptions
            message={message}
            currentUserId={currentUserId}
            onReply={onReply}
            onDelete={onDelete}
            onToggleStar={onToggleStar}
            onTogglePin={onTogglePin}
          />
        )}
      </Stack>
      <MessageMeta
        message={message}
        incoming={incoming}
        onRetry={message.status === "failed" ? () => onRetry(message) : undefined}
      />
    </Stack>
  );
};

const Timeline = ({ label }: { label: string }) => {
  const theme = useTheme();
  return (
    <Stack alignItems="center" direction="row" spacing={1}>
      <Divider sx={{ flex: 1 }} />
      <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
        {label}
      </Typography>
      <Divider sx={{ flex: 1 }} />
    </Stack>
  );
};

const SystemMessage = ({ message }: { message: Message }) => (
  <Stack alignItems="center" sx={{ my: 1 }}>
    <Typography variant="caption" color="text.secondary">
      {message.content || "System update"}
    </Typography>
  </Stack>
);

const InfoMessage = (props: MessageBubbleProps) => {
  const theme = useTheme();
  const {
    message,
    currentUserId,
    senderName,
    showMenu,
    onReply,
    onDelete,
    onToggleStar,
    onTogglePin,
    onRetry,
  } = props;
  const incoming = message.senderId !== currentUserId;
  const bubble = getBubbleStyles(theme, incoming);

  if (message.deleted) {
    return <DeletedMessage incoming={incoming} />;
  }

  let body = message.content;
  if (message.type === "location") {
    const lat = message.lat ?? Number(message.metadata?.lat);
    const lng = message.lng ?? Number(message.metadata?.lng);
    body =
      Number.isFinite(lat) && Number.isFinite(lng)
        ? `📍 Location: ${lat}, ${lng}`
        : message.content || "Location shared";
  } else if (message.type === "contact") {
    body = `👤 ${
      message.contactName || String(message.metadata?.name || "Contact")
    }${
      message.contactPhone || message.metadata?.phone
        ? ` · ${message.contactPhone || String(message.metadata?.phone)}`
        : ""
    }`;
  } else if (message.type === "voice") {
    body = `🎤 Voice message${
      message.durationMs ? ` (${Math.round(message.durationMs / 1000)}s)` : ""
    }`;
  } else if (message.type === "video") {
    body = `🎬 Video${message.content ? `: ${message.content}` : ""}`;
  } else if (message.type === "sticker") {
    body = message.imageUrl ? "" : "Sticker";
  }

  return (
    <Stack>
      {incoming && senderName && <SenderLabel name={senderName} />}
      <Stack
        direction="row"
        justifyContent={incoming ? "start" : "end"}
        alignItems="flex-start"
      >
        <Box
          p={1.5}
          sx={{
            backgroundColor: bubble.backgroundColor,
            borderRadius: 1.5,
            width: "max-content",
            maxWidth: "75%",
          }}
        >
          {message.type === "sticker" && message.imageUrl && (
            <img
              src={message.imageUrl}
              alt="Sticker"
              loading="lazy"
              style={{ maxHeight: 140, display: "block" }}
            />
          )}
          {body && (
            <Typography variant="body2" sx={{ color: bubble.color }}>
              {body}
            </Typography>
          )}
        </Box>
        {showMenu && (
          <MessageOptions
            message={message}
            currentUserId={currentUserId}
            onReply={onReply}
            onDelete={onDelete}
            onToggleStar={onToggleStar}
            onTogglePin={onTogglePin}
          />
        )}
      </Stack>
      <MessageMeta
        message={message}
        incoming={incoming}
        onRetry={
          message.status === "failed" ? () => onRetry(message) : undefined
        }
      />
    </Stack>
  );
};

export {
  Timeline,
  TextMessage,
  MediaMessage,
  DocMessage,
  LinkMessage,
  SystemMessage,
  InfoMessage,
};
