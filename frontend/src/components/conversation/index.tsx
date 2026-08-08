import { Box, Stack } from "@mui/material";
import Footer from "./Footer";
import Header from "./Header";
import Message from "./Message";

const Conversation = () => {
  return (
    <Stack height="100%" maxHeight="100vh" width="100%" sx={{ minWidth: 0 }}>
      <Header />
      {/*
        Message owns its own scroll area so the pinned banner can sit sticky
        above the list without being pushed into the scroll container.
      */}
      <Box sx={{ flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Message showMenu />
      </Box>
      <Footer />
    </Stack>
  );
};

export default Conversation;
