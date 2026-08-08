import { useState } from "react";
import type { SyntheticEvent } from "react";
import {
  Box,
  Grid,
  IconButton,
  Stack,
  Tab,
  Tabs,
  Typography,
  useTheme,
} from "@mui/material";
import { CaretLeft } from "phosphor-react";
import { useDispatch, useSelector } from "../redux/store";
import { updateSidebarType } from "../redux/slices/appSlice";
import { selectActiveMessages } from "../redux/selectors/chatSelectors";
import { selectCurrentUserId } from "../redux/selectors/authSelectors";
import { DocMessage, LinkMessage } from "./conversation/MessageType";
import type { Message } from "../types/chat";

const SharedMessages = () => {
  const [value, setValue] = useState(0);
  const theme = useTheme();
  const dispatch = useDispatch();
  const messages = useSelector(selectActiveMessages);
  const currentUserId = useSelector(selectCurrentUserId);

  const handleChange = (_event: SyntheticEvent, newValue: number) => {
    setValue(newValue);
  };

  const mediaMessages = messages.filter(
    (message: Message) => message.type === "image" && message.imageUrl
  );
  const linkMessages = messages.filter((message: Message) => message.type === "link");
  const docMessages = messages.filter(
    (message: Message) => message.type === "document"
  );

  const noop = () => undefined;
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
          <Stack sx={{ p: 2 }} direction="row" alignItems="center" spacing={2}>
            <IconButton
              onClick={() => dispatch(updateSidebarType({ type: "CONTACT" }))}
              aria-label="Back to contact info"
            >
              <CaretLeft />
            </IconButton>
            <Typography variant="subtitle2">Shared Messages</Typography>
          </Stack>
        </Box>

        <Tabs sx={{ px: 2, pt: 2 }} value={value} onChange={handleChange} centered>
          <Tab label="Media" />
          <Tab label="Links" />
          <Tab label="Docs" />
        </Tabs>

        <Stack
          sx={{ flexGrow: 1, overflowY: "auto", minHeight: 0 }}
          p={3}
          spacing={value === 1 ? 1 : 3}
        >
          {value === 0 && (
            <>
              {mediaMessages.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  No shared media in this conversation.
                </Typography>
              )}
              <Grid container spacing={2}>
                {mediaMessages.map((message) => (
                  <Grid item xs={4} key={message.id}>
                    <img
                      src={message.imageUrl}
                      alt={message.content || "Shared media"}
                      loading="lazy"
                      style={{ width: "100%", borderRadius: 8 }}
                    />
                  </Grid>
                ))}
              </Grid>
            </>
          )}
          {value === 1 &&
            (linkMessages.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No shared links in this conversation.
              </Typography>
            ) : (
              linkMessages.map((message) => (
                <LinkMessage key={message.id} message={message} {...bubbleProps} />
              ))
            ))}
          {value === 2 &&
            (docMessages.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No shared documents in this conversation.
              </Typography>
            ) : (
              docMessages.map((message) => (
                <DocMessage key={message.id} message={message} {...bubbleProps} />
              ))
            ))}
        </Stack>
      </Stack>
    </Box>
  );
};

export default SharedMessages;
