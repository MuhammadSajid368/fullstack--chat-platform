import { InputBase, styled } from "@mui/material";

/**
 * Sidebar-friendly full-width search input.
 * Avoid fixed `ch` widths that truncate placeholders like "Search conversations...".
 */
const StyledInputBase = styled(InputBase)(({ theme }) => ({
  color: "inherit",
  width: "100%",
  "& .MuiInputBase-input": {
    width: "100%",
    padding: theme.spacing(1.25, 1.5, 1.25, 0),
    paddingLeft: `calc(1em + ${theme.spacing(4.5)})`,
    fontSize: theme.typography.body2.fontSize,
    lineHeight: 1.5,
    boxSizing: "border-box",
    "&::placeholder": {
      opacity: 0.72,
      color: theme.palette.text.secondary,
    },
  },
}));

export default StyledInputBase;
