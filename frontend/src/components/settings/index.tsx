import type { ReactNode } from "react";
//
import SettingsDrawer from "./drawer";
//
import ThemeContrast from "./ThemeContrast";
import ThemeRtlLayout from "./ThemeRtlLayout";
import ThemeColorPresets from "./ThemeColorPresets";
import ThemeLocalization from "./ThemeLocalization";

// ----------------------------------------------------------------------

interface ThemeSettingsProps {
  children: ReactNode;
}

export default function ThemeSettings({ children }: ThemeSettingsProps) {
  return (
    <ThemeColorPresets>
      <ThemeContrast>
        <ThemeLocalization>
          <ThemeRtlLayout>
            {children}
            <SettingsDrawer />
          </ThemeRtlLayout>
        </ThemeLocalization>
      </ThemeContrast>
    </ThemeColorPresets>
  );
}
