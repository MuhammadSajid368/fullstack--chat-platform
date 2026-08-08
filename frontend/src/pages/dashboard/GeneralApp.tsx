import { Box, Stack } from "@mui/material";import Chats from "./Chats";
import Conversation from "../../components/conversation/index";
import ConversationEmpty from "../../components/conversation/ConversationEmpty";
import Contact from "../../components/Contact";
import { useSelector } from "../../redux/store";
import SharedMessages from "../../components/SharedMessages";
import StarredMessages from "../../components/StarredMessages";
import useResponsive from "../../hooks/useResponsive";
import {
  selectActiveConversationId,
  selectMobileView,
} from "../../redux/selectors/chatSelectors";

const GeneralApp = () => {
  const { sidebar } = useSelector((store) => store.app);
  const activeConversationId = useSelector(selectActiveConversationId);
  const mobileView = useSelector(selectMobileView);
  const isMobile = useResponsive("down", "md");

  const showList = !isMobile || mobileView === "list";
  const showConversation = !isMobile || mobileView === "conversation";

  return (
    <Stack
      direction="row"
      sx={{
        width: "100%",
        height: "100vh",
        overflow: "hidden",
        bgcolor: (theme) =>
          theme.palette.mode === "light"
            ? "#F0F4FA"
            : theme.palette.background.paper,
      }}
    >
      {showList && <Chats />}

      {showConversation && (
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            height: "100%",
          }}
        >
          {activeConversationId ? (
            <Conversation />
          ) : (
            <ConversationEmpty />
          )}
        </Box>
      )}

      {sidebar.open && !isMobile && (
        <>
          {sidebar.type === "CONTACT" && <Contact />}
          {sidebar.type === "STARRED" && <StarredMessages />}
          {sidebar.type === "SHARED" && <SharedMessages />}
        </>
      )}
    </Stack>
  );
};

export default GeneralApp;
