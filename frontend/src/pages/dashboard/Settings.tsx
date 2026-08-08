import {
  Avatar,
  Box,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import {
  Bell,
  CaretLeft,
  Image,
  Info,
  Keyboard,
  Note,
  PencilCircle,
  UserCircle,
} from "phosphor-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import Shortcuts from "../../sections/settings/Shortcuts";
import { useDispatch, useSelector } from "../../redux/store";
import {
  setMyPresencePrivacy,
  setMyPresenceStatus,
} from "../../redux/slices/presenceSlice";
import type {
  PresencePreferredStatus,
  PresencePrivacy,
} from "../../services/presenceService";

interface SettingOption {
  key: number;
  icon: ReactNode;
  title: string;
  onclick?: () => void;
}

function resolvePreferredStatus(
  preferred: PresencePreferredStatus | undefined,
  status: string | undefined
): PresencePreferredStatus {
  if (
    preferred === "ONLINE" ||
    preferred === "AWAY" ||
    preferred === "INVISIBLE"
  ) {
    return preferred;
  }
  const normalized = (status ?? "online").toLowerCase();
  if (normalized === "away") return "AWAY";
  if (normalized === "invisible") return "INVISIBLE";
  return "ONLINE";
}

const Settings = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [openShortcuts, setOpenShortcust] = useState(false);
  const selfPresence = useSelector((state) => state.presence.self);

  const handleOpenShortcuts = () => {
    setOpenShortcust(true);
  };

  const handleCloseShortcust = () => {
    setOpenShortcust(false);
  };

  const list: SettingOption[] = [
    {
      key: 0,
      icon: <Bell size={20} />,
      title: "Notifications",
      onclick: () => navigate("/notifications"),
    },
    {
      key: 1,
      icon: <UserCircle size={20} />,
      title: "Profile",
      onclick: () => navigate("/profile"),
    },
    {
      key: 2,
      icon: <PencilCircle size={20} />,
      title: "Theme",
      onclick: () => {},
    },
    {
      key: 3,
      icon: <Image size={20} />,
      title: "Chat wallpaper",
      onclick: () => {},
    },
    {
      key: 4,
      icon: <Note size={20} />,
      title: "Request account info",
      onclick: () => {},
    },
    {
      key: 5,
      icon: <Keyboard size={20} />,
      title: "Keyboard shortcuts",
      onclick: handleOpenShortcuts,
    },
    {
      key: 6,
      icon: <Info size={20} />,
      title: "Help",
      onclick: () => {},
    },
  ];

  return (
    <>
      <Stack direction={"row"} sx={{ width: "100%" }}>
        <Box
          sx={{
            overflowY: "scroll",
            height: "100vh",
            width: { xs: "100%", md: 320 },
            backgroundColor:
              theme.palette.mode === "light"
                ? "#F8FAFF"
                : theme.palette.background.paper,
            boxShadow: "0px 0px 2px rgba(0,0,0,0.25)",
          }}
        >
          <Stack p={4} spacing={5}>
            <Stack direction={"row"} alignItems={"center"} spacing={3}>
              <IconButton aria-label="Back" onClick={() => navigate(-1)}>
                <CaretLeft size={24} color={"#4B4B4B"} />
              </IconButton>
              <Typography variant="h5">Settings</Typography>
            </Stack>

            <Stack direction="row" spacing={3} alignItems="center">
              <Avatar
                sx={{ width: 56, height: 56 }}
                src={selfPresence ? undefined : undefined}
              />
              <Stack spacing={0.5}>
                <Typography variant="article">Presence</Typography>
                <Typography variant="body2" color="text.secondary">
                  {resolvePreferredStatus(
                    selfPresence?.preferredStatus,
                    selfPresence?.status
                  )
                    .toLowerCase()
                    .replace(/^\w/, (c) => c.toUpperCase())}
                </Typography>
              </Stack>
            </Stack>

            <Stack spacing={2}>
              <FormControl fullWidth size="small">
                <InputLabel id="presence-status-label">Status</InputLabel>
                <Select
                  labelId="presence-status-label"
                  label="Status"
                  value={resolvePreferredStatus(
                    selfPresence?.preferredStatus,
                    selfPresence?.status
                  )}
                  onChange={(e) => {
                    const value = e.target.value as PresencePreferredStatus;
                    void dispatch(setMyPresenceStatus(value));
                  }}
                >
                  <MenuItem value="ONLINE">Online</MenuItem>
                  <MenuItem value="AWAY">Away</MenuItem>
                  <MenuItem value="INVISIBLE">Invisible</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth size="small">
                <InputLabel id="presence-privacy-label">
                  Last seen privacy
                </InputLabel>
                <Select
                  labelId="presence-privacy-label"
                  label="Last seen privacy"
                  value={selfPresence?.privacy ?? "EVERYONE"}
                  onChange={(e) => {
                    void dispatch(
                      setMyPresencePrivacy(e.target.value as PresencePrivacy)
                    );
                  }}
                >
                  <MenuItem value="EVERYONE">Everyone</MenuItem>
                  <MenuItem value="CONTACTS">Contacts</MenuItem>
                  <MenuItem value="NOBODY">Nobody</MenuItem>
                </Select>
              </FormControl>
            </Stack>

            <Stack spacing={4}>
              {list.map(({ key, icon, title, onclick }) => (
                <Stack
                  key={key}
                  spacing={2}
                  sx={{ cursor: "pointer" }}
                  onClick={onclick}
                >
                  <Stack direction="row" spacing={2} alignItems="center">
                    {icon}
                    <Typography variant="body2">{title}</Typography>
                  </Stack>
                  {key !== list.length - 1 && <Divider />}
                </Stack>
              ))}
            </Stack>
          </Stack>
        </Box>
      </Stack>
      {openShortcuts && (
        <Shortcuts open={openShortcuts} handleClose={handleCloseShortcust} />
      )}
    </>
  );
};

export default Settings;
