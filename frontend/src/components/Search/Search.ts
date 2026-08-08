import { styled, alpha } from "@mui/material";

const Search = styled("div")(({ theme }) => ({
  position: "relative",
  display: "flex",
  alignItems: "center",
  width: "100%",
  minHeight: 44,
  borderRadius: 12,
  border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
  backgroundColor:
    theme.palette.mode === "light"
      ? alpha(theme.palette.common.white, 0.9)
      : alpha(theme.palette.background.default, 0.7),
  boxShadow:
    theme.palette.mode === "light"
      ? `0 1px 2px ${alpha(theme.palette.common.black, 0.04)}`
      : "none",
  transition: theme.transitions.create(
    ["border-color", "box-shadow", "background-color"],
    { duration: theme.transitions.duration.shorter }
  ),
  "&:hover": {
    borderColor: alpha(theme.palette.primary.main, 0.35),
    backgroundColor:
      theme.palette.mode === "light"
        ? theme.palette.common.white
        : theme.palette.background.paper,
  },
  "&:focus-within": {
    borderColor: theme.palette.primary.main,
    boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.16)}`,
    backgroundColor:
      theme.palette.mode === "light"
        ? theme.palette.common.white
        : theme.palette.background.paper,
  },
}));

export default Search;
