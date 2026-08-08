import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PushPin, PushPinSlash } from "phosphor-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useDispatch, useSelector } from "../../redux/store";
import {
  deleteMessageRemote,
  fetchMessages,
  loadOlderMessages,
  retryMessage,
  setReplyToMessage,
  togglePinMessageRemote,
  toggleStarMessageRemote,
} from "../../redux/slices/chatSlice";
import {
  selectActiveConversation,
  selectActiveConversationId,
  selectActiveMessages,
  selectHasMoreMessages,
  selectLoadingOlderFailed,
  selectLoadingOlderMessages,
  selectMessagesError,
  selectMessagesLoading,
  selectPinnedMessagesForActive,
  selectUsers,
} from "../../redux/selectors/chatSelectors";
import { selectCurrentUserId } from "../../redux/selectors/authSelectors";
import {
  groupMessagesWithDividers,
  type MessageListItem,
} from "../../utils/messageGrouping";
import type { Message as ChatMessage } from "../../types/chat";
import { useMessageStatusProgression } from "../../hooks/useMessageStatusProgression";
import MessageListSkeleton from "./MessageListSkeleton";
import {
  DocMessage,
  InfoMessage,
  LinkMessage,
  MediaMessage,
  SystemMessage,
  TextMessage,
  Timeline,
} from "./MessageType";

interface MessageProps {
  conversationId?: string | null;
  showMenu?: boolean;
}

const HIGHLIGHT_MS = 2200;
/** Virtualize once the transcript is large enough to matter. */
const VIRTUALIZE_THRESHOLD = 48;

const Message = ({ conversationId: propConversationId, showMenu = true }: MessageProps) => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const activeConversationId = useSelector(selectActiveConversationId);
  const conversationId = propConversationId ?? activeConversationId;
  const messages = useSelector((state) =>
    conversationId
      ? state.chat.messagePagesByConversationId[conversationId]?.messages ?? []
      : []
  );
  const isLoading = useSelector((state) =>
    selectMessagesLoading(state, conversationId)
  );
  const error = useSelector((state) =>
    selectMessagesError(state, conversationId)
  );
  const hasMore = useSelector((state) =>
    selectHasMoreMessages(state, conversationId)
  );
  const loadingOlder = useSelector((state) =>
    selectLoadingOlderMessages(state, conversationId)
  );
  const loadingOlderFailed = useSelector((state) =>
    selectLoadingOlderFailed(state, conversationId)
  );
  const pinnedMessages = useSelector(selectPinnedMessagesForActive);
  const activeMessages = useSelector(selectActiveMessages);
  const conversation = useSelector(selectActiveConversation);
  const users = useSelector(selectUsers);
  const currentUserId = useSelector(selectCurrentUserId);
  const isGroup = conversation?.type === "group";

  const [deleteTarget, setDeleteTarget] = useState<ChatMessage | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(
    null
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messageNodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const previousMessageCountRef = useRef(0);
  const highlightTimeoutRef = useRef<number | null>(null);
  const shouldAutoScrollRef = useRef(true);

  useMessageStatusProgression(
    conversationId === activeConversationId ? activeMessages : messages,
    conversationId
  );

  const groupedItems = useMemo(
    () => groupMessagesWithDividers(messages),
    [messages]
  );
  const useVirtual = groupedItems.length >= VIRTUALIZE_THRESHOLD;

  const rowVirtualizer = useVirtualizer({
    count: useVirtual ? groupedItems.length : 0,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) =>
      groupedItems[index]?.kind === "divider" ? 40 : 100,
    overscan: 12,
    gap: 24,
  });

  const getReplyPreview = useCallback(
    (replyToMessageId: string | undefined): string | undefined => {
      if (!replyToMessageId) {
        return undefined;
      }
      const replied = messages.find((item) => item.id === replyToMessageId);
      if (!replied || replied.deleted) {
        return "Message deleted";
      }
      return replied.content;
    },
    [messages]
  );

  const scrollToBottom = useCallback(() => {
    if (useVirtual && groupedItems.length > 0) {
      rowVirtualizer.scrollToIndex(groupedItems.length - 1, {
        align: "end",
        behavior: "smooth",
      });
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [useVirtual, groupedItems.length, rowVirtualizer]);

  useEffect(() => {
    previousMessageCountRef.current = 0;
    shouldAutoScrollRef.current = true;
    setHighlightedMessageId(null);
  }, [conversationId]);

  useEffect(() => {
    const previousCount = previousMessageCountRef.current;
    const grew = messages.length > previousCount;
    previousMessageCountRef.current = messages.length;

    if (grew && shouldAutoScrollRef.current) {
      scrollToBottom();
    }
  }, [messages.length, conversationId, scrollToBottom]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  const handleScrollContainer = useCallback(() => {
    const node = scrollContainerRef.current;
    if (!node) {
      return;
    }
    const distanceFromBottom =
      node.scrollHeight - node.scrollTop - node.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 120;
  }, []);

  const scrollToPinnedMessage = useCallback(
    (messageId: string) => {
      shouldAutoScrollRef.current = false;
      setHighlightedMessageId(messageId);

      if (useVirtual) {
        const index = groupedItems.findIndex(
          (item) => item.kind === "message" && item.message.id === messageId
        );
        if (index >= 0) {
          rowVirtualizer.scrollToIndex(index, {
            align: "center",
            behavior: "smooth",
          });
        }
      } else {
        const target = messageNodeRefs.current[messageId];
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
      highlightTimeoutRef.current = window.setTimeout(() => {
        setHighlightedMessageId((current) =>
          current === messageId ? null : current
        );
      }, HIGHLIGHT_MS);
    },
    [useVirtual, groupedItems, rowVirtualizer]
  );

  const handleRetry = useCallback(
    (message: ChatMessage) => {
      if (!conversationId) {
        return;
      }
      void dispatch(retryMessage({ conversationId, messageId: message.id }));
    },
    [conversationId, dispatch]
  );

  const handleReply = useCallback(
    (message: ChatMessage) => {
      dispatch(setReplyToMessage({ messageId: message.id }));
    },
    [dispatch]
  );

  const handleToggleStar = useCallback(
    (message: ChatMessage) => {
      void dispatch(
        toggleStarMessageRemote({
          conversationId: message.conversationId,
          messageId: message.id,
        })
      );
    },
    [dispatch]
  );

  const handleTogglePin = useCallback(
    (message: ChatMessage) => {
      void dispatch(
        togglePinMessageRemote({
          conversationId: message.conversationId,
          messageId: message.id,
        })
      );
    },
    [dispatch]
  );

  const handleDeleteRequest = useCallback((message: ChatMessage) => {
    setDeleteTarget(message);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget) {
      return;
    }
    void dispatch(
      deleteMessageRemote({
        conversationId: deleteTarget.conversationId,
        messageId: deleteTarget.id,
      })
    );
    setDeleteTarget(null);
  }, [deleteTarget, dispatch]);

  const handleRetryLoad = useCallback(() => {
    if (conversationId) {
      void dispatch(fetchMessages(conversationId));
    }
  }, [conversationId, dispatch]);

  const handleLoadOlder = useCallback(() => {
    if (conversationId) {
      void dispatch(loadOlderMessages(conversationId));
    }
  }, [conversationId, dispatch]);

  if (!conversationId) {
    return null;
  }

  if (isLoading && messages.length === 0) {
    return <MessageListSkeleton />;
  }

  if (error && messages.length === 0) {
    return (
      <Stack alignItems="center" justifyContent="center" spacing={2} p={4} sx={{ flex: 1 }}>
        <Alert severity="error" role="alert" sx={{ width: "100%" }}>
          {error}
        </Alert>
        <Button
          variant="contained"
          onClick={handleRetryLoad}
          aria-label="Retry loading messages"
        >
          Retry
        </Button>
      </Stack>
    );
  }

  if (messages.length === 0) {
    return (
      <Stack alignItems="center" justifyContent="center" spacing={1} p={4} sx={{ flex: 1 }}>
        <Typography variant="subtitle1">No messages yet</Typography>
        <Typography variant="body2" color="text.secondary">
          Send a message to start the conversation.
        </Typography>
      </Stack>
    );
  }

  const bubbleProps = {
    showMenu,
    currentUserId,
    onReply: handleReply,
    onDelete: handleDeleteRequest,
    onToggleStar: handleToggleStar,
    onTogglePin: handleTogglePin,
    onRetry: handleRetry,
  };

  const getSenderName = (senderId: string): string | undefined => {
    if (!isGroup || senderId === currentUserId) {
      return undefined;
    }
    return users[senderId]?.name;
  };

  const renderListItem = (item: MessageListItem): ReactNode => {
    if (item.kind === "divider") {
      return <Timeline key={item.id} label={item.label} />;
    }

    const { message } = item;
    const replyPreviewText = getReplyPreview(message.replyToMessageId);
    const senderName = getSenderName(message.senderId);
    const props = { ...bubbleProps, senderName, replyPreviewText };
    const isHighlighted = highlightedMessageId === message.id;

    const wrapMessage = (node: ReactNode) => (
      <Box
        key={message.id}
        id={`message-${message.id}`}
        ref={(nodeRef: HTMLDivElement | null) => {
          messageNodeRefs.current[message.id] = nodeRef;
        }}
        sx={{
          scrollMarginTop: 16,
          scrollMarginBottom: 16,
          borderRadius: 1.5,
          transition: "box-shadow 0.25s ease, background-color 0.25s ease",
          boxShadow: isHighlighted
            ? `0 0 0 2px ${theme.palette.primary.main}`
            : "none",
          bgcolor: isHighlighted
            ? theme.palette.mode === "light"
              ? "rgba(112, 156, 230, 0.12)"
              : "rgba(112, 156, 230, 0.2)"
            : "transparent",
          contentVisibility: "auto",
          containIntrinsicSize: "auto 96px",
        }}
      >
        {node}
      </Box>
    );

    switch (message.type) {
      case "image":
        return wrapMessage(<MediaMessage message={message} {...props} />);
      case "document":
        return wrapMessage(<DocMessage message={message} {...props} />);
      case "link":
        return wrapMessage(<LinkMessage message={message} {...props} />);
      case "system":
        return <SystemMessage key={message.id} message={message} />;
      case "voice":
      case "video":
      case "sticker":
      case "contact":
      case "location":
        return wrapMessage(<InfoMessage message={message} {...props} />);
      default:
        return wrapMessage(<TextMessage message={message} {...props} />);
    }
  };

  const showPinnedBanner =
    conversationId === activeConversationId && pinnedMessages.length > 0;

  return (
    <Stack sx={{ flex: 1, minHeight: 0, height: "100%" }}>
      {showPinnedBanner && (
        <Stack
          spacing={1}
          sx={{
            flexShrink: 0,
            px: 3,
            pt: 1.5,
            pb: 1.5,
            borderBottom: `1px solid ${theme.palette.divider}`,
            bgcolor:
              theme.palette.mode === "light"
                ? "rgba(112, 156, 230, 0.12)"
                : theme.palette.background.paper,
            zIndex: 2,
          }}
          role="region"
          aria-label="Pinned messages"
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <PushPin size={16} weight="fill" color={theme.palette.primary.main} />
            <Typography variant="caption" color="primary" fontWeight={600}>
              Pinned ({pinnedMessages.length})
            </Typography>
          </Stack>
          {pinnedMessages.map((pinned) => (
            <Stack
              key={pinned.id}
              direction="row"
              alignItems="center"
              spacing={1}
              onClick={() => scrollToPinnedMessage(pinned.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  scrollToPinnedMessage(pinned.id);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`Jump to pinned message: ${
                pinned.content || pinned.documentName || "Pinned message"
              }`}
              sx={{
                px: 1.5,
                py: 1,
                borderRadius: 1,
                cursor: "pointer",
                bgcolor: theme.palette.background.paper,
                border: `1px solid ${theme.palette.divider}`,
                "&:hover": {
                  borderColor: theme.palette.primary.main,
                  bgcolor:
                    theme.palette.mode === "light"
                      ? "rgba(112, 156, 230, 0.08)"
                      : theme.palette.action.hover,
                },
                "&:focus-visible": {
                  outline: `2px solid ${theme.palette.primary.main}`,
                  outlineOffset: 1,
                },
              }}
            >
              <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                {pinned.content || pinned.documentName || "Pinned message"}
              </Typography>
              <IconButton
                size="small"
                onClick={(event) => {
                  event.stopPropagation();
                  handleTogglePin(pinned);
                }}
                aria-label="Unpin message"
              >
                <PushPinSlash size={16} />
              </IconButton>
            </Stack>
          ))}
        </Stack>
      )}

      <Box
        ref={scrollContainerRef}
        onScroll={handleScrollContainer}
        p={3}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Message history"
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        <Stack spacing={useVirtual ? 0 : 3}>
          {hasMore && (
            <Stack alignItems="center" spacing={1} sx={{ mb: useVirtual ? 3 : 0 }}>
              <Button
                variant="outlined"
                size="small"
                onClick={handleLoadOlder}
                disabled={loadingOlder}
                aria-label="Load older messages"
              >
                {loadingOlder ? "Loading…" : "Load older messages"}
              </Button>
              {loadingOlder && (
                <CircularProgress size={18} aria-label="Loading older messages" />
              )}
              {loadingOlderFailed && (
                <Alert
                  severity="error"
                  role="alert"
                  action={
                    <Button
                      color="inherit"
                      size="small"
                      onClick={handleLoadOlder}
                      aria-label="Retry loading older messages"
                    >
                      Retry
                    </Button>
                  }
                >
                  Could not load older messages.
                </Alert>
              )}
            </Stack>
          )}

          {useVirtual ? (
            <Box
              sx={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const item = groupedItems[virtualRow.index];
                if (!item) {
                  return null;
                }
                return (
                  <Box
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    sx={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {renderListItem(item)}
                  </Box>
                );
              })}
            </Box>
          ) : (
            groupedItems.map((item) => renderListItem(item))
          )}
          <div ref={bottomRef} />
        </Stack>
      </Box>

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        aria-labelledby="delete-message-title"
      >
        <DialogTitle id="delete-message-title">Delete message?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This message will be deleted for everyone in the chat.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDeleteConfirm}
            aria-label="Confirm delete message"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default Message;
