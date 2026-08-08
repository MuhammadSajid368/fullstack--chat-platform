import { Avatar } from "@mui/material";
import { getInitials } from "../redux/selectors/chatSelectors";

interface UserAvatarProps {
  name: string;
  src?: string;
  size?: number;
}

const UserAvatar = ({ name, src, size = 40 }: UserAvatarProps) => {
  const hasImage = Boolean(src?.trim());

  return (
    <Avatar
      src={hasImage ? src : undefined}
      alt={name}
      sx={{
        width: size,
        height: size,
        bgcolor: "primary.main",
        color: "#fff !important",
        fontWeight: 600,
        fontSize: Math.max(12, Math.round(size * 0.35)),
        "& .MuiAvatar-fallback, & img": {
          color: "#fff",
        },
      }}
    >
      {getInitials(name)}
    </Avatar>
  );
};

export default UserAvatar;
