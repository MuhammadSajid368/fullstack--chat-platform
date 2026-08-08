import {
  Alert,
  Box,
  Button,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  useTheme,
  List,
  ListItemButton,
  ListItemText,
} from "@mui/material";
import { MagnifyingGlass } from "phosphor-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "../../redux/store";
import {
  runSearch,
  setSearchQuery,
  setSearchScope,
  type SearchScope,
} from "../../redux/slices/searchSlice";
import {
  selectConversation,
  openDirectChat,
} from "../../redux/slices/chatSlice";

const SearchPage = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { query, scope, loading, error, messages, users, groups, conversations } =
    useSelector((state) => state.search);

  useEffect(() => {
    if (!query.trim()) return;
    const handle = window.setTimeout(() => {
      void dispatch(runSearch({ q: query, scope }));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [dispatch, query, scope]);

  const scopes: SearchScope[] = [
    "messages",
    "users",
    "groups",
    "conversations",
  ];

  return (
    <Stack direction="row" sx={{ width: "100%" }}>
      <Box
        sx={{
          height: "100vh",
          width: { xs: "100%", md: 420 },
          backgroundColor:
            theme.palette.mode === "light"
              ? "#F8FAFF"
              : theme.palette.background.paper,
          boxShadow: "0px 0px 2px rgba(0,0,0,0.25)",
          p: 3,
        }}
      >
        <Stack spacing={2} sx={{ height: "100%" }}>
          <Typography variant="h5">Search</Typography>
          <TextField
            value={query}
            onChange={(e) => dispatch(setSearchQuery(e.target.value))}
            placeholder="Search…"
            InputProps={{
              startAdornment: <MagnifyingGlass style={{ marginRight: 8 }} />,
            }}
            fullWidth
            size="small"
            aria-label="Search query"
          />
          <Tabs
            value={scope}
            onChange={(_, value: SearchScope) =>
              dispatch(setSearchScope(value))
            }
            variant="scrollable"
            allowScrollButtonsMobile
          >
            {scopes.map((s) => (
              <Tab key={s} value={s} label={s} />
            ))}
          </Tabs>

          {error && <Alert severity="error">{error}</Alert>}
          {loading && (
            <Typography variant="body2" color="text.secondary">
              Searching…
            </Typography>
          )}

          <Box sx={{ overflowY: "auto", flex: 1 }}>
            {scope === "messages" && (
              <List>
                {messages.map((hit) => (
                  <ListItemButton
                    key={hit.id}
                    onClick={() => {
                      dispatch(selectConversation(hit.conversationId));
                      navigate("/app");
                    }}
                  >
                    <ListItemText
                      primary={hit.snippet || hit.content}
                      secondary={new Date(hit.createdAt).toLocaleString()}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
            {scope === "users" && (
              <List>
                {users.map((hit) => (
                  <ListItemButton
                    key={hit.id}
                    onClick={() => {
                      void dispatch(
                        openDirectChat({
                          peerUserId: hit.id,
                          name: hit.name,
                          avatar: hit.avatar,
                        })
                      ).then((result) => {
                        if (openDirectChat.fulfilled.match(result)) {
                          navigate("/app");
                        }
                      });
                    }}
                  >
                    <ListItemText
                      primary={hit.name}
                      secondary={hit.email || hit.about || undefined}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
            {scope === "groups" && (
              <List>
                {groups.map((hit) => (
                  <ListItemButton
                    key={hit.id}
                    onClick={() => {
                      dispatch(selectConversation(hit.id));
                      navigate("/group");
                    }}
                  >
                    <ListItemText
                      primary={hit.name}
                      secondary={
                        hit.description || `${hit.memberCount} members`
                      }
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
            {scope === "conversations" && (
              <List>
                {conversations.map((hit) => (
                  <ListItemButton
                    key={hit.id}
                    onClick={() => {
                      dispatch(selectConversation(hit.id));
                      navigate("/app");
                    }}
                  >
                    <ListItemText
                      primary={hit.name}
                      secondary={hit.lastMessagePreview || hit.type}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
            {!loading &&
              query.trim() &&
              ((scope === "messages" && messages.length === 0) ||
                (scope === "users" && users.length === 0) ||
                (scope === "groups" && groups.length === 0) ||
                (scope === "conversations" && conversations.length === 0)) && (
                <Typography variant="body2" color="text.secondary">
                  No results.
                </Typography>
              )}
          </Box>

          {!query.trim() && (
            <Button disabled variant="outlined">
              Enter a search term
            </Button>
          )}
        </Stack>
      </Box>
    </Stack>
  );
};

export default SearchPage;
