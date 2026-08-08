import {
  Box,
  Button,
  Divider,
  IconButton,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MagnifyingGlass, Plus } from "phosphor-react";
import {
  Search,
  SearchIconWrapper,
  StyledInputBase,
} from "../../components/Search";
import { SimpleBarStyle } from "../../components/Scrollbar";
import { ChatElement } from "../../components/ChatElement";
import CreateGroup from "../../sections/main/CreateGroup";
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
  selectChatInitialized,
  selectConversationsLoading,
  selectGroupConversations,
  selectPresence,
  selectUnreadCounts,
} from "../../redux/selectors/chatSelectors";
import { selectCurrentUserId } from "../../redux/selectors/authSelectors";

const Group = () => {
  const [openDialog, setOpenDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const theme = useTheme();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const groups = useSelector(selectGroupConversations);
  const activeConversationId = useSelector(selectActiveConversationId);
  const unreadCounts = useSelector(selectUnreadCounts);
  const presence = useSelector(selectPresence);
  const currentUserId = useSelector(selectCurrentUserId);
  const initialized = useSelector(selectChatInitialized);
  const loading = useSelector(selectConversationsLoading);
  const messagePages = useSelector(
    (state) => state.chat.messagePagesByConversationId
  );

  useEffect(() => {
    if (!initialized && !loading) {
      void dispatch(initializeChat());
    }
  }, [dispatch, initialized, loading]);

  const filteredGroups = groups.filter((group) =>
    group.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  const handleSelect = useCallback(
    (conversationId: string) => {
      dispatch(selectConversation(conversationId));
      const page = messagePages[conversationId];
      if (!page || page.initialLoadStatus === "idle" || page.initialLoadStatus === "failed") {
        void dispatch(fetchMessages(conversationId));
      }
      void dispatch(markConversationRead(conversationId));
      navigate("/app");
    },
    [dispatch, messagePages, navigate]
  );

  return (
    <>
      <Stack direction="row" sx={{ width: "100%", flex: 1 }}>
        <Box
          sx={{
            height: { xs: "100vh", md: "100%" },
            width: { xs: "100%", md: 320 },
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            backgroundColor:
              theme.palette.mode === "light"
                ? "#F8FAFF"
                : theme.palette.background.paper,
            boxShadow: "0px 0px 2px rgba(0, 0, 0.25)",
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
            <Typography variant="h5">Groups</Typography>
            <Search>
              <SearchIconWrapper>
                <MagnifyingGlass color="#709CE6" size={18} />
              </SearchIconWrapper>
              <StyledInputBase
                placeholder="Search groups..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                inputProps={{ "aria-label": "Search groups" }}
                fullWidth
              />
            </Search>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle2">Create New Group</Typography>
              <IconButton
                onClick={() => setOpenDialog(true)}
                aria-label="Create new group"
              >
                <Plus style={{ color: theme.palette.primary.main }} />
              </IconButton>
            </Stack>
            <Divider />
            {filteredGroups.length === 0 ? (
              <Stack spacing={2} py={4} alignItems="center" textAlign="center">
                <Typography variant="subtitle1">No groups yet</Typography>
                <Typography variant="body2" color="text.secondary">
                  Create a group to start collaborating with your team.
                </Typography>
                <Button variant="contained" onClick={() => setOpenDialog(true)}>
                  Create group
                </Button>
              </Stack>
            ) : (
              <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                <SimpleBarStyle
                  timeout={500}
                  style={{ height: "100%", maxHeight: "100%" }}
                  autoHide={false}
                >
                  <Stack spacing={1.5} role="listbox" aria-label="Groups" sx={{ pb: 2 }}>
                    {filteredGroups.map((group) => {
                      const { isOnline, statusLabel } = getPresenceForConversation(
                        group,
                        presence,
                        currentUserId
                      );
                      return (
                        <ChatElement
                          key={group.id}
                          id={group.id}
                          name={group.name}
                          avatar={group.avatar}
                          lastMessagePreview={group.lastMessagePreview}
                          lastMessageAt={group.lastMessageAt}
                          unread={unreadCounts[group.id] ?? 0}
                          isOnline={isOnline}
                          isGroup
                          statusLabel={statusLabel}
                          selected={activeConversationId === group.id}
                          onSelect={handleSelect}
                        />
                      );
                    })}
                  </Stack>
                </SimpleBarStyle>
              </Box>
            )}
          </Stack>
        </Box>
      </Stack>
      {openDialog && (
        <CreateGroup open={openDialog} handleClose={() => setOpenDialog(false)} />
      )}
    </>
  );
};

export default Group;
