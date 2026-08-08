import {
  Avatar,
  Badge,
  Box,
  Divider,
  IconButton,
  Stack,
  Typography,
  useTheme,
  Menu,
  MenuItem,
} from "@mui/material";
import {
  Gear,
  MagnifyingGlass,
  Bell,
  ShieldCheck,
} from "phosphor-react";
import { useState } from "react";
import type { MouseEvent } from "react";
import logo from "../../assets/Images/logo.png";
import AntSwitch from "../../components/AntSwitch";
import { Nav_Buttons, Profile_Menu } from "../../data";
import useSettings from "../../hooks/useSettings";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "../../redux/store";
import { logout } from "../../redux/slices/authSlice";
import { PATH_AUTH } from "../../routes/paths";
import {
  selectAuthUser,
  selectCurrentUserId,
} from "../../redux/selectors/authSelectors";

const SideBar = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [selected, setSelected] = useState(0);
  const theme = useTheme();
  const { onToggleMode } = useSettings();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  const authUser = useSelector(selectAuthUser);
  const currentUserId = useSelector(selectCurrentUserId);
  const unreadNotifications = useSelector(
    (state) => state.notifications.unreadCount
  );
  const isAdmin =
    authUser?.globalRole === "ADMIN" ||
    authUser?.globalRole === "SUPER_ADMIN";

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const getPath = (index: number): string | undefined => {
    switch (index) {
      case 0:
        return "/app";
      case 1:
        return "/group";
      case 2:
        return "/call";
      case 3:
        return "/setting";
      default:
        break;
    }
  };

  const getMenuPath = (index: number): string | undefined => {
    switch (index) {
      case 0:
        return "/profile";
      case 1:
        return "/setting";
      case 2:
        return PATH_AUTH.login;
      default:
        break;
    }
  };

  return (
    <Box
      p={2}
      sx={{
        backgroundColor: theme.palette.background.paper,
        boxShadow: "0px 0px 2px rgba(0 ,0 ,0 , 0.25)",
        height: "100vh",
        width: 100,
      }}
    >
      <Stack
        direction={"column"}
        alignItems="center"
        justifyContent="space-between"
        sx={{ height: "100%" }}
        spacing={3}
      >
        <Stack sx={{ alignItems: "center" }} spacing={4}>
          <Box
            sx={{
              height: 64,
              width: 64,
              borderRadius: 2.5,
              overflow: "hidden",
              bgcolor: "#000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Box
              component="img"
              src={logo}
              alt="App logo"
              sx={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </Box>
          <Stack
            sx={{ width: "max-content" }}
            direction={"column"}
            alignItems={"center"}
            spacing={3}
          >
            {Nav_Buttons.map((el) => {
              const NavIcon = el.icon;
              return el.index === selected ? (
                <Box
                  key={el.index}
                  sx={{
                    backgroundColor: theme.palette.primary.main,
                    borderRadius: 1.5,
                  }}
                >
                  <IconButton
                    sx={{ width: "max-content", color: "#fff" }}
                    aria-label={el.index === 0 ? "Chats" : el.index === 1 ? "Groups" : "Calls"}
                  >
                    <NavIcon />
                  </IconButton>
                </Box>
              ) : (
                <IconButton
                  onClick={() => {
                    setSelected(el.index);
                    navigate(getPath(el.index)!);
                  }}
                  sx={{
                    width: "max-content",
                    color:
                      theme.palette.mode === "light"
                        ? "#000"
                        : theme.palette.text.primary,
                  }}
                  key={el.index}
                  aria-label={el.index === 0 ? "Chats" : el.index === 1 ? "Groups" : "Calls"}
                >
                  <NavIcon />
                </IconButton>
              );
            })}

            <IconButton
              aria-label="Search"
              onClick={() => {
                setSelected(-1);
                navigate("/search");
              }}
              sx={{
                color:
                  theme.palette.mode === "light"
                    ? "#000"
                    : theme.palette.text.primary,
              }}
            >
              <MagnifyingGlass />
            </IconButton>

            <IconButton
              aria-label="Notifications"
              onClick={() => {
                setSelected(-2);
                navigate("/notifications");
              }}
              sx={{
                color:
                  theme.palette.mode === "light"
                    ? "#000"
                    : theme.palette.text.primary,
              }}
            >
              <Badge
                badgeContent={unreadNotifications}
                color="primary"
                max={99}
              >
                <Bell />
              </Badge>
            </IconButton>

            {isAdmin && (
              <IconButton
                aria-label="Admin"
                onClick={() => {
                  setSelected(-3);
                  navigate("/admin");
                }}
                sx={{
                  color:
                    theme.palette.mode === "light"
                      ? "#000"
                      : theme.palette.text.primary,
                }}
              >
                <ShieldCheck />
              </IconButton>
            )}

            <Divider sx={{ width: "48px" }} />
            {selected === 3 ? (
              <Box
                sx={{
                  backgroundColor: theme.palette.primary.main,
                  borderRadius: 1.5,
                }}
              >
                <IconButton
                  sx={{ width: "max-content", color: "white" }}
                  aria-label="Settings"
                >
                  <Gear />
                </IconButton>
              </Box>
            ) : (
              <IconButton
                onClick={() => {
                  navigate(getPath(3)!);
                  setSelected(3);
                }}
                aria-label="Settings"
                sx={{
                  color:
                    theme.palette.mode === "light"
                      ? "#000"
                      : theme.palette.text.primary,
                }}
              >
                <Gear />
              </IconButton>
            )}
          </Stack>
        </Stack>
        <Stack alignItems="center">
          <AntSwitch
            onChange={() => onToggleMode()}
            defaultChecked
            sx={{ marginBottom: 4 }}
            inputProps={{ "aria-label": "Toggle dark mode" }}
          />
          <Avatar
            sx={{ cursor: "pointer" }}
            id="basic-button"
            aria-controls={open ? "basic-menu" : undefined}
            aria-haspopup="true"
            aria-expanded={open ? true : undefined}
            onClick={handleClick}
            src={authUser?.avatar || undefined}
            alt={authUser?.name || "User avatar"}
          />
          <Menu
            id="demo-positioned-menu"
            aria-labelledby="demo-positioned-button"
            anchorEl={anchorEl}
            open={open}
            onClose={handleClose}
            MenuListProps={{
              "aria-labelledby": "basic-button",
            }}
            anchorOrigin={{
              vertical: "bottom",
              horizontal: "right",
            }}
            transformOrigin={{
              vertical: "bottom",
              horizontal: "left",
            }}
          >
            <Stack spacing={1} px={1}>
              {Profile_Menu.map((el, idx) => {
                const MenuIcon = el.icon;
                return (
                  <MenuItem
                    key={el.title}
                    onClick={() => {
                      handleClose();
                      if (idx === 2) {
                        void dispatch(logout()).then(() => {
                          navigate(PATH_AUTH.login);
                        });
                        return;
                      }
                      const path = getMenuPath(idx);
                      if (path) {
                        navigate(path);
                      }
                    }}
                  >
                    <Stack
                      sx={{
                        width: 100,
                        direction: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span>{el.title}</span>
                      <MenuIcon />
                    </Stack>
                  </MenuItem>
                );
              })}
            </Stack>
          </Menu>
          <Typography sx={{ fontSize: "14px", mt: 1, textAlign: "center" }}>
            {authUser?.name || currentUserId}
          </Typography>
        </Stack>
      </Stack>
    </Box>
  );
};

export default SideBar;
