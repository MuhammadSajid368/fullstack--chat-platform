import { useEffect } from "react";
import { Stack } from "@mui/material";
import { Outlet } from "react-router-dom";
import SideBar from "./SideBar";
import { useDispatch, useSelector } from "../../redux/store";
import { initializeChat } from "../../redux/slices/chatSlice";
import {
  selectChatInitialized,
  selectConversationsLoading,
} from "../../redux/selectors/chatSelectors";
import { selectIsAuthenticated } from "../../redux/selectors/authSelectors";
import { useRealtimeSync } from "../../hooks/useRealtimeSync";
import { fetchUnreadNotificationCount } from "../../redux/slices/notificationSlice";
import { fetchMyPresence } from "../../redux/slices/presenceSlice";

const DashboardLayout = () => {
  const dispatch = useDispatch();
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const initialized = useSelector(selectChatInitialized);
  const loading = useSelector(selectConversationsLoading);

  useRealtimeSync();

  useEffect(() => {
    if (isAuthenticated && !initialized && !loading) {
      void dispatch(initializeChat());
    }
  }, [dispatch, initialized, isAuthenticated, loading]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void dispatch(fetchUnreadNotificationCount());
    void dispatch(fetchMyPresence());
  }, [dispatch, isAuthenticated]);

  return (
    <Stack direction="row" sx={{ width: "100%", minHeight: "100vh" }}>
      <SideBar />
      <Outlet />
    </Stack>
  );
};

export default DashboardLayout;
