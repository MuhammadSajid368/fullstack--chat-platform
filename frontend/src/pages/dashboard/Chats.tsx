import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useTheme } from "@mui/material/styles";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import { MagnifyingGlass } from "phosphor-react";
import { ChatElement } from "../../components/ChatElement";
import { SimpleBarStyle } from "../../components/Scrollbar";
import {
  Search,
  SearchIconWrapper,
  StyledInputBase,
} from "../../components/Search";
import { useDispatch, useSelector } from "../../redux/store";
import {
  fetchMessages,
  initializeChat,
  markConversationRead,
  selectConversation,
} from "../../redux/slices/chatSlice";
import {
  getPresenceForConversation,
  selectActiveConversationId,
  selectConversations,
  selectConversationsError,
  selectConversationsLoading,
  selectPresence,
  selectUnreadCounts,
} from "../../redux/selectors/chatSelectors";
import { selectCurrentUserId } from "../../redux/selectors/authSelectors";

const Chats = () => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const conversations = useSelector(selectConversations);
  const activeConversationId = useSelector(selectActiveConversationId);
  const unreadCounts = useSelector(selectUnreadCounts);
  const presence = useSelector(selectPresence);
  const lastSeenByUserId = useSelector(
    (state) => state.presence.lastSeenByUserId
  );
  const isLoading = useSelector(selectConversationsLoading);
  const error = useSelector(selectConversationsError);
  const currentUserId = useSelector(selectCurrentUserId);
  const [searchQuery, setSearchQuery] = useState("");
  const isRateLimited =
    typeof error === "string" && /too many requests/i.test(error);

  useEffect(() => {
    void dispatch(initializeChat());
  }, [dispatch]);

  const messagePages = useSelector(
    (state) => state.chat.messagePagesByConversationId
  );

  const handleSelect = useCallback(
    (conversationId: string) => {
      dispatch(selectConversation(conversationId));
      const page = messagePages[conversationId];
      if (!page || page.initialLoadStatus === "idle" || page.initialLoadStatus === "failed") {
        void dispatch(fetchMessages(conversationId));
      }
      void dispatch(markConversationRead(conversationId));
    },
    [dispatch, messagePages]
  );

  const handleRetry = useCallback(() => {
    void dispatch(initializeChat());
  }, [dispatch]);

  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return conversations;
    }
    return conversations.filter((conversation) =>
      conversation.name.toLowerCase().includes(query)
    );
  }, [conversations, searchQuery]);

  const pinnedConversations = useMemo(
    () => filteredConversations.filter((conversation) => conversation.pinned),
    [filteredConversations]
  );

  const otherConversations = useMemo(
    () => filteredConversations.filter((conversation) => !conversation.pinned),
    [filteredConversations]
  );

  const allVisibleIds = useMemo(
    () => [...pinnedConversations, ...otherConversations].map((c) => c.id),
    [pinnedConversations, otherConversations]
  );

  const handleListKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
        return;
      }
      event.preventDefault();
      const currentIndex = activeConversationId
        ? allVisibleIds.indexOf(activeConversationId)
        : -1;
      let nextIndex = currentIndex;
      if (event.key === "ArrowDown") {
        nextIndex = Math.min(allVisibleIds.length - 1, currentIndex + 1);
      } else {
        nextIndex = Math.max(0, currentIndex - 1);
      }
      if (nextIndex < 0 && allVisibleIds.length > 0) {
        nextIndex = 0;
      }
      const nextId = allVisibleIds[nextIndex];
      if (nextId) {
        handleSelect(nextId);
      }
    },
    [activeConversationId, allVisibleIds, handleSelect]
  );

  const renderConversation = (conversation: (typeof conversations)[number]) => {
    const { isOnline, statusLabel } = getPresenceForConversation(
      conversation,
      presence,
      currentUserId,
      lastSeenByUserId
    );

    return (
      <ChatElement
        key={conversation.id}
        id={conversation.id}
        name={conversation.name}
        avatar={conversation.avatar}
        lastMessagePreview={conversation.lastMessagePreview}
        lastMessageAt={conversation.lastMessageAt}
        unread={unreadCounts[conversation.id] ?? 0}
        isOnline={isOnline}
        isGroup={conversation.type === "group"}
        statusLabel={statusLabel}
        selected={activeConversationId === conversation.id}
        onSelect={handleSelect}
      />
    );
  };

  return (
    <Box
      sx={{
        position: "relative",
        height: { xs: "100vh", md: "100%" },
        width: { xs: "100%", md: 320 },
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        backgroundColor:
          theme.palette.mode === "light"
            ? "#F8FAFF"
            : theme.palette.background.paper,
        boxShadow: "0px 0px 2px rgba(0, 0, 0, 0.25)",
      }}
    >
      <Stack
        spacing={2}
        sx={{
          height: "100%",
          minHeight: 0,
          p: 3,
          pb: 2,
        }}
      >
        <Typography variant="h6">Chats</Typography>

        <Search>
          <SearchIconWrapper>
            <MagnifyingGlass color="#709CE6" size={18} />
          </SearchIconWrapper>
          <StyledInputBase
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            inputProps={{ "aria-label": "Search conversations" }}
            fullWidth
          />
        </Search>

        {isLoading && (
          <Stack alignItems="center" py={4}>
            <CircularProgress size={28} />
            <Typography variant="body2" color="text.secondary" mt={1}>
              Loading conversations...
            </Typography>
          </Stack>
        )}

        {error && !isLoading && (
          <Stack spacing={2}>
            <Alert severity={isRateLimited ? "warning" : "error"}>
              {isRateLimited
                ? "Too many requests. Please wait a moment, then retry. Your session is still active."
                : error}
            </Alert>
            <Button variant="contained" onClick={handleRetry}>
              Retry
            </Button>
          </Stack>
        )}

        {!isLoading && !error && filteredConversations.length === 0 && (
          <Stack alignItems="center" py={4} spacing={1}>
            <Typography variant="subtitle2">No conversations found</Typography>
            <Typography variant="body2" color="text.secondary">
              Try a different search term.
            </Typography>
          </Stack>
        )}

        {!isLoading && !error && filteredConversations.length > 0 && (
          <Box
            sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}
            role="listbox"
            aria-label="Conversations"
            onKeyDown={handleListKeyDown}
          >
            <SimpleBarStyle
              timeout={500}
              style={{ height: "100%", maxHeight: "100%" }}
              autoHide={false}
            >
              <Stack spacing={2} sx={{ pr: 0.5, pb: 2 }}>
                {pinnedConversations.length > 0 && (
                  <Stack spacing={1.5}>
                    <Typography variant="subtitle2" sx={{ color: "#767676" }}>
                      Pinned
                    </Typography>
                    <Stack spacing={1.5}>
                      {pinnedConversations.map(renderConversation)}
                    </Stack>
                  </Stack>
                )}
                <Divider />
                <Stack spacing={1.5}>
                  <Typography variant="subtitle2" sx={{ color: "#767676" }}>
                    All Chats
                  </Typography>
                  <Stack spacing={1.5}>
                    {otherConversations.map(renderConversation)}
                  </Stack>
                </Stack>
              </Stack>
            </SimpleBarStyle>
          </Box>
        )}
      </Stack>
    </Box>
  );
};

export default Chats;
