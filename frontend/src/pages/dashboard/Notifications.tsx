import {
  Alert,
  Box,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { ArrowLeft, Checks, Trash } from "phosphor-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "../../redux/store";
import {
  deleteNotification,
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../redux/slices/notificationSlice";
import { selectConversation } from "../../redux/slices/chatSlice";

const NotificationsPage = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { items, loading, error, unreadCount, hasMore, nextCursor } =
    useSelector((state) => state.notifications);

  useEffect(() => {
    void dispatch(fetchNotifications(undefined));
    void dispatch(fetchUnreadNotificationCount());
  }, [dispatch]);

  return (
    <Stack direction="row" sx={{ width: "100%" }}>
      <Box
        sx={{
          height: "100vh",
          width: { xs: "100%", md: 360 },
          backgroundColor:
            theme.palette.mode === "light"
              ? "#F8FAFF"
              : theme.palette.background.paper,
          boxShadow: "0px 0px 2px rgba(0,0,0,0.25)",
        }}
      >
        <Stack p={3} spacing={2} sx={{ height: "100%" }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <IconButton
              aria-label="Back"
              onClick={() => navigate("/app")}
            >
              <ArrowLeft />
            </IconButton>
            <Typography variant="h5" flex={1}>
              Notifications
            </Typography>
            {unreadCount > 0 && (
              <Button
                size="small"
                startIcon={<Checks />}
                onClick={() => void dispatch(markAllNotificationsRead())}
              >
                Mark all read
              </Button>
            )}
          </Stack>

          {error && <Alert severity="error">{error}</Alert>}
          {loading && items.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Loading…
            </Typography>
          )}
          {!loading && items.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No notifications yet.
            </Typography>
          )}

          <List sx={{ overflowY: "auto", flex: 1 }}>
            {items.map((item) => (
              <ListItem
                key={item.id}
                alignItems="flex-start"
                secondaryAction={
                  <IconButton
                    edge="end"
                    aria-label="Delete notification"
                    onClick={() => void dispatch(deleteNotification(item.id))}
                  >
                    <Trash size={18} />
                  </IconButton>
                }
                sx={{
                  bgcolor:
                    item.status === "unread"
                      ? theme.palette.mode === "light"
                        ? "rgba(1,98,196,0.08)"
                        : "rgba(1,98,196,0.16)"
                      : "transparent",
                  borderRadius: 1,
                  mb: 0.5,
                  cursor: "pointer",
                }}
                onClick={() => {
                  if (item.status === "unread") {
                    void dispatch(markNotificationRead(item.id));
                  }
                  if (item.conversationId) {
                    dispatch(selectConversation(item.conversationId));
                    navigate("/app");
                  }
                }}
              >
                <ListItemText
                  primary={item.title}
                  secondary={item.body}
                  primaryTypographyProps={{
                    fontWeight: item.status === "unread" ? 700 : 500,
                  }}
                />
              </ListItem>
            ))}
          </List>

          {hasMore && nextCursor && (
            <Button
              onClick={() => void dispatch(fetchNotifications(nextCursor))}
            >
              Load more
            </Button>
          )}
        </Stack>
      </Box>
    </Stack>
  );
};

export default NotificationsPage;
