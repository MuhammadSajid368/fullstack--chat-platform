import type { ThemeComponentsOverride } from "../types";
import { InputSelectIcon } from "./CustomIcons";

// ----------------------------------------------------------------------

export default function Select(): ThemeComponentsOverride {
  return {
    MuiSelect: {
      defaultProps: {
        IconComponent: InputSelectIcon,
      },
    },
  };
}
