import { Box, Skeleton, Stack } from "@mui/material";

const MessageListSkeleton = () => {
  return (
    <Stack spacing={2} p={3}>
      {[0, 1, 2, 3, 4].map((index) => (
        <Box
          key={index}
          sx={{
            display: "flex",
            justifyContent: index % 2 === 0 ? "flex-start" : "flex-end",
          }}
        >
          <Skeleton
            variant="rounded"
            width={index % 2 === 0 ? "55%" : "45%"}
            height={56}
          />
        </Box>
      ))}
    </Stack>
  );
};

export default MessageListSkeleton;
