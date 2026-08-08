import {
  Box,
  Stack,
  IconButton,
  Typography,
  useTheme,
} from "@mui/material";
import { CaretLeft } from "phosphor-react";
import { useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "../redux/store";
import { updateSidebarType } from "../redux/slices/appSlice";
import { fetchMessages } from "../redux/slices/chatSlice";
import {
  selectStarredMessages,
} from "../redux/selectors/chatSelectors";
import { selectCurrentUserId } from "../redux/selectors/authSelectors";
import { formatMessageTime } from "../utils/formatMessageTime";
import {
  DocMessage,
  LinkMessage,
  MediaMessage,
  TextMessage,
} from "./conversation/MessageType";

const StarredMessages = () => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const starredEntries = useSelector(selectStarredMessages);
  const currentUserId = useSelector(selectCurrentUserId);
  const conversations = useSelector((state) => state.chat.conversations);
  const messagePages = useSelector(
    (state) => state.chat.messagePagesByConversationId
  );

  useEffect(() => {
    for (const conversation of conversations) {
      const page = messagePages[conversation.id];
      if (!page || page.initialLoadStatus === "idle") {
        void dispatch(fetchMessages(conversation.id));
      }
    }
  }, [conversations, dispatch, messagePages]);

  const groupedByConversation = useMemo(() => {
    const groups = new Map<
      string,
      { conversationName: string; items: typeof starredEntries }
    >();

    for (const entry of starredEntries) {
      const existing = groups.get(entry.conversation.id);
      if (existing) {
        existing.items.push(entry);
      } else {
        groups.set(entry.conversation.id, {
          conversationName: entry.conversation.name,
          items: [entry],
        });
      }
    }

    return Array.from(groups.values());
  }, [starredEntries]);

  const noop = () => undefined;

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
            spacing={2}
          >
            <IconButton
              onClick={() => dispatch(updateSidebarType({ type: "CONTACT" }))}
              aria-label="Back to contact info"
            >
              <CaretLeft />
            </IconButton>
            <Typography variant="subtitle2">Starred Messages</Typography>
          </Stack>
        </Box>

        <Stack
          sx={{ flexGrow: 1, overflowY: "auto", minHeight: 0 }}
          p={3}
          spacing={3}
        >
          {groupedByConversation.length === 0 && (
            <Stack alignItems="center" spacing={1} py={4}>
              <Typography variant="subtitle1">No starred messages</Typography>
              <Typography variant="body2" color="text.secondary" textAlign="center">
                Star important messages from a conversation to find them here.
              </Typography>
            </Stack>
          )}

          {groupedByConversation.map((group) => (
            <Box key={group.conversationName}>
              <Typography variant="subtitle2" color="primary" gutterBottom>
                {group.conversationName}
              </Typography>
              <Stack spacing={2}>
                {group.items.map(({ message }) => {
                  const bubbleProps = {
                    currentUserId,
                    showMenu: false,
                    onReply: noop,
                    onDelete: noop,
                    onToggleStar: noop,
                    onTogglePin: noop,
                    onRetry: noop,
                  };

                  return (
                    <Box key={message.id}>
                      <Typography variant="caption" color="text.secondary">
                        {formatMessageTime(message.createdAt)}
                      </Typography>
                      {message.type === "image" && (
                        <MediaMessage message={message} {...bubbleProps} />
                      )}
                      {message.type === "document" && (
                        <DocMessage message={message} {...bubbleProps} />
                      )}
                      {message.type === "link" && (
                        <LinkMessage message={message} {...bubbleProps} />
                      )}
                      {(message.type === "text" || message.type === "reply") && (
                        <TextMessage message={message} {...bubbleProps} />
                      )}
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          ))}
        </Stack>
      </Stack>
    </Box>
  );
};

export default StarredMessages;
