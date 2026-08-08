import { Box, IconButton, Stack, Typography } from "@mui/material";
import { CaretLeft } from "phosphor-react";
import { useNavigate } from "react-router-dom";
import ProfileForm from "../../sections/settings/ProfileForm";

const Profile = () => {
  const navigate = useNavigate();

  return (
    <>
      <Stack direction={"row"} sx={{ width: "100%" }}>
        <Box
          sx={{
            height: "100vh",
            width: 320,
            backgroundColor: (theme) =>
              theme.palette.mode === "light"
                ? "#F8FAFF"
                : (theme.palette.background as unknown as string),
            boxShadow: "0px 0px 2px rgba(0, 0 , 0, 0.25)",
          }}
        >
          <Stack p={4} spacing={5}>
            {/* Header */}
            <Stack direction={"row"} alignItems="center" spacing={3}>
              <IconButton
                aria-label="Back to settings"
                onClick={() => navigate("/setting")}
              >
                <CaretLeft size={24} color="#4B4B4B" />
              </IconButton>
              <Typography variant="h5">Profile</Typography>
            </Stack>
            {/* Form */}
            <ProfileForm />
          </Stack>
        </Box>
      </Stack>
    </>
  );
};

export default Profile;
