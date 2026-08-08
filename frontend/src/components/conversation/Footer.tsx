import styled from "@emotion/styled";
import {
  Box,
  IconButton,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import data from "@emoji-mart/data";
import EmojiPicker from "@emoji-mart/react";
import {
  CalendarBlank,
  Camera,
  ChartBar,
  File,
  Headphones,
  Image,
  LinkSimple,
  PaperPlaneTilt,
  Smiley,
  Sticker,
  User,
  X,
} from "phosphor-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { toast } from "react-toastify";
import { useDispatch, useSelector } from "../../redux/store";
import {
  addOptimisticMessage,
  clearReply,
  sendMessage,
  setDraft,
} from "../../redux/slices/chatSlice";
import { selectCurrentUserId } from "../../redux/selectors/authSelectors";
import {
  selectActiveConversationId,
  selectDraftForActiveConversation,
  selectIsSending,
  selectReplyToMessage,
} from "../../redux/selectors/chatSelectors";
import { isRestMode } from "../../config/env";
import { emitSocketEvent } from "../../services/socket/socketClient";
import { getUploadService } from "../../services/serviceRegistry";
import type { UploadType } from "../../services/uploadService";
import type { MessageType } from "../../types/chat";

const StyledInput = styled(TextField)(() => ({
  "& .MuiInputBase-input": {
    paddingTop: "12px",
    paddingBottom: "12px",
  },
}));

interface AttachmentAction {
  id: string;
  label: string;
  icon: ReactNode;
  color: string;
  accept?: string;
  toastMessage: string;
}

const ATTACHMENT_ACTIONS: AttachmentAction[] = [
  {
    id: "document",
    label: "Document",
    icon: <File size={22} weight="fill" />,
    color: "#7B61FF",
    accept: ".pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx",
    toastMessage: "Document picker opened. File upload API comes in a later phase.",
  },
  {
    id: "media",
    label: "Photos & videos",
    icon: <Image size={22} weight="fill" />,
    color: "#2A9DF4",
    accept: "image/*,video/*",
    toastMessage: "Media picker opened. Uploads with progress come in a later phase.",
  },
  {
    id: "camera",
    label: "Camera",
    icon: <Camera size={22} weight="fill" />,
    color: "#E91E8C",
    accept: "image/*",
    toastMessage: "Camera capture is not wired yet. Coming with uploads support.",
  },
  {
    id: "audio",
    label: "Audio",
    icon: <Headphones size={22} weight="fill" />,
    color: "#F5A623",
    accept: "audio/*",
    toastMessage: "Audio picker opened. Voice/audio upload comes in a later phase.",
  },
  {
    id: "contact",
    label: "Contact",
    icon: <User size={22} weight="fill" />,
    color: "#4FC3F7",
    toastMessage: "Share contact is available in the UI. Backend sharing comes later.",
  },
  {
    id: "poll",
    label: "Poll",
    icon: <ChartBar size={22} weight="fill" />,
    color: "#F7C948",
    toastMessage: "Poll creation UI will ship in a later phase.",
  },
  {
    id: "event",
    label: "Event",
    icon: <CalendarBlank size={22} weight="fill" />,
    color: "#FF6B6B",
    toastMessage: "Event sharing will ship in a later phase.",
  },
  {
    id: "sticker",
    label: "New sticker",
    icon: <Sticker size={22} weight="fill" />,
    color: "#00BFA5",
    toastMessage: "Sticker pack picker will ship with uploads support.",
  },
];

const Footer = () => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const conversationId = useSelector(selectActiveConversationId);
  const draft = useSelector(selectDraftForActiveConversation);
  const replyToMessage = useSelector(selectReplyToMessage);
  const isSending = useSelector(selectIsSending);
  const currentUserId = useSelector(selectCurrentUserId);
  const [openPicker, setOpenPicker] = useState(false);
  const [openActions, setOpenActions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const actionsAnchorRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileAccept, setFileAccept] = useState<string>("*/*");
  const [pendingUploadType, setPendingUploadType] = useState<UploadType | null>(
    null
  );
  const actionsMenuId = useId();
  const typingTimerRef = useRef<number | null>(null);
  const typingActiveRef = useRef(false);

  const trimmedDraft = draft.trim();
  const canSend = Boolean(conversationId) && trimmedDraft.length > 0 && !isSending;

  const stopTyping = useCallback(() => {
    if (!conversationId || !typingActiveRef.current) return;
    typingActiveRef.current = false;
    if (isRestMode()) {
      void emitSocketEvent("typing.stop", { conversationId }).catch(() => undefined);
    }
  }, [conversationId]);

  const pingTyping = useCallback(() => {
    if (!conversationId || !isRestMode()) return;
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      void emitSocketEvent("typing.start", { conversationId }).catch(() => undefined);
    }
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
    }
    typingTimerRef.current = window.setTimeout(() => {
      stopTyping();
    }, 2000);
  }, [conversationId, stopTyping]);

  useEffect(() => {
    if (conversationId) {
      inputRef.current?.focus();
    }
    return () => {
      stopTyping();
    };
  }, [conversationId, stopTyping]);

  useEffect(() => {
    setOpenActions(false);
    setOpenPicker(false);
  }, [conversationId]);

  const handleDraftChange = useCallback(
    (value: string) => {
      if (!conversationId) {
        return;
      }
      dispatch(setDraft({ conversationId, draft: value }));
      if (value.trim()) {
        pingTyping();
      } else {
        stopTyping();
      }
    },
    [conversationId, dispatch, pingTyping, stopTyping]
  );

  const uploadAndSendFile = useCallback(
    async (file: File, uploadType: UploadType) => {
      if (!conversationId) return;
      try {
        toast.info(`Uploading ${file.name}…`);
        const created = await getUploadService().createUpload({
          type: uploadType,
          mimeType: file.type || "application/octet-stream",
          fileName: file.name,
          byteSize: file.size,
          conversationId,
          checksum: `client-${file.name}-${file.size}-${file.lastModified}`,
        });
        try {
          const completed = await getUploadService().completeUpload(created.id, {
            byteSize: file.size,
            checksum: `client-${file.name}-${file.size}-${file.lastModified}`,
          });
          const messageType: MessageType =
            uploadType === "image"
              ? "image"
              : uploadType === "video"
                ? "video"
                : uploadType === "voice"
                  ? "voice"
                  : uploadType === "sticker"
                    ? "sticker"
                    : "document";
          const clientMessageId =
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `client-${Date.now()}`;
          const optimisticId = `optimistic-${clientMessageId}`;
          dispatch(
            addOptimisticMessage({
              conversationId,
              optimisticId,
              content: file.name,
              senderId: currentUserId,
              clientMessageId,
            })
          );
          await dispatch(
            sendMessage({
              conversationId,
              content: file.name,
              type: messageType,
              attachmentIds: [completed.id],
              optimisticId,
              clientMessageId,
            })
          );
          toast.success("Attachment sent");
        } catch (inner) {
          await getUploadService()
            .failUpload(created.id, { reason: "client_upload_failed" })
            .catch(() => undefined);
          throw inner;
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Upload failed"
        );
      }
    },
    [conversationId, currentUserId, dispatch]
  );

  const handleSend = useCallback(async () => {
    if (!conversationId || !canSend) {
      return;
    }

    const content = trimmedDraft;
    const replyToMessageId = replyToMessage?.id;
    const clientMessageId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `client-${Date.now()}`;
    const optimisticId = `optimistic-${clientMessageId}`;

    dispatch(
      addOptimisticMessage({
        conversationId,
        optimisticId,
        content,
        replyToMessageId,
        senderId: currentUserId,
        clientMessageId,
      })
    );
    dispatch(setDraft({ conversationId, draft: "" }));
    dispatch(clearReply());

    await dispatch(
      sendMessage({
        conversationId,
        content,
        replyToMessageId,
        optimisticId,
        clientMessageId,
      })
    );

    inputRef.current?.focus();
  }, [
    canSend,
    conversationId,
    dispatch,
    replyToMessage?.id,
    trimmedDraft,
    currentUserId,
  ]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handleEmojiSelect = (emoji: { native?: string }) => {
    if (!conversationId || !emoji.native) {
      return;
    }
    handleDraftChange(draft + emoji.native);
    setOpenPicker(false);
    inputRef.current?.focus();
  };

  const handleAttachmentSelect = (action: AttachmentAction) => {
    setOpenActions(false);
    setOpenPicker(false);

    if (action.accept) {
      const uploadType: UploadType =
        action.id === "media"
          ? "image"
          : action.id === "audio"
            ? "voice"
            : action.id === "sticker"
              ? "sticker"
              : "document";
      setPendingUploadType(uploadType);
      setFileAccept(action.accept);
      window.setTimeout(() => {
        fileInputRef.current?.click();
      }, 0);
      return;
    }

    toast.info(action.toastMessage, { toastId: `attach-${action.id}` });
    inputRef.current?.focus();
  };

  const handleFileChosen = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    let uploadType = pendingUploadType ?? "document";
    if (file.type.startsWith("image/")) uploadType = "image";
    else if (file.type.startsWith("video/")) uploadType = "video";
    else if (file.type.startsWith("audio/")) uploadType = "voice";
    void uploadAndSendFile(file, uploadType);
    setPendingUploadType(null);
  };

  if (!conversationId) {
    return null;
  }

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
      <input
        ref={fileInputRef}
        type="file"
        accept={fileAccept}
        hidden
        aria-hidden
        tabIndex={-1}
        onChange={handleFileChosen}
      />

      {replyToMessage && (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{
            mb: 1,
            px: 1.5,
            py: 1,
            borderRadius: 1,
            bgcolor: "background.default",
            borderLeft: 3,
            borderColor: "primary.main",
          }}
        >
          <Box>
            <Typography variant="caption" color="primary" fontWeight={600}>
              Replying to
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {replyToMessage.deleted
                ? "Message deleted"
                : replyToMessage.content}
            </Typography>
          </Box>
          <IconButton
            size="small"
            onClick={() => dispatch(clearReply())}
            aria-label="Cancel reply"
          >
            <X size={16} />
          </IconButton>
        </Stack>
      )}

      <Stack direction="row" alignItems="center" spacing={2}>
        <Stack width="100%" sx={{ position: "relative" }}>
          {openPicker && (
            <Box
              sx={{
                zIndex: 20,
                position: "absolute",
                bottom: "100%",
                right: 0,
                mb: 1,
              }}
            >
              <EmojiPicker
                theme={theme.palette.mode}
                data={data}
                onEmojiSelect={handleEmojiSelect}
              />
            </Box>
          )}

          <Menu
            id={actionsMenuId}
            anchorEl={actionsAnchorRef.current}
            open={openActions}
            onClose={() => setOpenActions(false)}
            anchorOrigin={{ vertical: "top", horizontal: "left" }}
            transformOrigin={{ vertical: "bottom", horizontal: "left" }}
            MenuListProps={{
              "aria-label": "Attachment options",
              dense: true,
            }}
            PaperProps={{
              sx: {
                minWidth: 220,
                borderRadius: 2,
                bgcolor:
                  theme.palette.mode === "light"
                    ? theme.palette.primary.main
                    : theme.palette.background.paper,
                color:
                  theme.palette.mode === "light"
                    ? "#fff"
                    : theme.palette.text.primary,
              },
            }}
          >
            {ATTACHMENT_ACTIONS.map((action) => (
              <MenuItem
                key={action.id}
                onClick={() => handleAttachmentSelect(action)}
                aria-label={action.label}
                sx={{
                  py: 1.1,
                  px: 1.5,
                  gap: 0.5,
                  color: "inherit",
                  "&:hover": {
                    bgcolor:
                      theme.palette.mode === "light"
                        ? "rgba(255,255,255,0.12)"
                        : theme.palette.action.hover,
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 36, color: action.color }}>
                  {action.icon}
                </ListItemIcon>
                <ListItemText
                  primary={action.label}
                  primaryTypographyProps={{
                    variant: "body2",
                    fontWeight: 500,
                    color: "inherit",
                  }}
                />
              </MenuItem>
            ))}
          </Menu>

          <StyledInput
            inputRef={inputRef}
            fullWidth
            placeholder="Write a message"
            variant="filled"
            value={draft}
            onChange={(event) => handleDraftChange(event.target.value)}
            onKeyDown={handleKeyDown}
            multiline
            maxRows={4}
            InputProps={{
              disableUnderline: true,
              startAdornment: (
                <InputAdornment position="start">
                  <IconButton
                    ref={actionsAnchorRef}
                    onClick={() => {
                      setOpenPicker(false);
                      setOpenActions((open) => !open);
                    }}
                    aria-label="Open attachment options"
                    aria-haspopup="menu"
                    aria-expanded={openActions}
                    aria-controls={openActions ? actionsMenuId : undefined}
                  >
                    <LinkSimple />
                  </IconButton>
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => {
                      setOpenActions(false);
                      setOpenPicker((open) => !open);
                    }}
                    aria-label="Toggle emoji picker"
                    aria-expanded={openPicker}
                  >
                    <Smiley />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </Stack>
        <Box
          sx={{
            height: 48,
            width: 48,
            backgroundColor: canSend
              ? theme.palette.primary.main
              : theme.palette.action.disabledBackground,
            borderRadius: 1.5,
            flexShrink: 0,
          }}
        >
          <Stack
            sx={{
              height: "100%",
              width: "100%",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconButton
              onClick={() => void handleSend()}
              disabled={!canSend}
              aria-label="Send message"
            >
              <PaperPlaneTilt color="#fff" />
            </IconButton>
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
};

export default Footer;
