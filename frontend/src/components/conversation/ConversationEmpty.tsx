import { Box, Stack, Typography } from "@mui/material";
import { ChatCircleDots } from "phosphor-react";

const ConversationEmpty = () => {
  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      spacing={2}
      sx={{
        flex: 1,
        minHeight: 0,
        p: 4,
        textAlign: "center",
        bgcolor: (theme) =>
          theme.palette.mode === "light"
            ? "#F0F4FA"
            : theme.palette.background.paper,
      }}
    >
      <Box
        sx={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "primary.lighter",
          color: "primary.main",
        }}
      >
        <ChatCircleDots size={40} weight="duotone" />
      </Box>
      <Typography variant="h6">Select a conversation</Typography>
      <Typography variant="body2" color="text.secondary">
        Choose a chat from the list to view messages and start messaging.
      </Typography>
    </Stack>
  );
};

export default ConversationEmpty;
