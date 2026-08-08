// provider === component
import { createContext, useEffect } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { defaultSettings } from "../config";
import type {
  ThemeContrastValue,
  ThemeDirection,
  ThemeLayoutValue,
  ThemeMode,
} from "../config";
import useLocalStorage from "../hooks/useLocalStorage";
import getColorPresets, {
  defaultPreset,
  colorPresets,
} from "../utils/getColorPresets";

export interface ColorPreset {
  name: string;
  lighter: string;
  light: string;
  main: string;
  dark: string;
  darker: string;
  contrastText: string;
}

export interface ColorOption {
  name: string;
  value: string;
}

export interface ThemeSettingsState {
  themeMode: ThemeMode;
  themeLayout: ThemeLayoutValue;
  themeStretch: boolean;
  themeContrast: ThemeContrastValue;
  themeDirection: ThemeDirection;
  themeColorPresets: string;
}

export interface SettingsContextProps extends ThemeSettingsState {
  // Mode
  onToggleMode: () => void;
  onChangeMode: (event: ChangeEvent<HTMLInputElement>) => void;

  // Direction
  onToggleDirection: () => void;
  onChangeDirection: (event: ChangeEvent<HTMLInputElement>) => void;
  onChangeDirectionByLang: (lang: string) => void;

  // Layout
  onToggleLayout: () => void;
  onChangeLayout: (event: ChangeEvent<HTMLInputElement>) => void;

  // Contrast
  onToggleContrast: () => void;
  onChangeContrast: (event: ChangeEvent<HTMLInputElement>) => void;

  // Color
  onChangeColor: (event: ChangeEvent<HTMLInputElement>) => void;
  setColor: ColorPreset;
  colorOption: ColorOption[];

  // Stretch
  onToggleStretch: () => void;

  // Reset
  onResetSetting: () => void;
}

const initialState: SettingsContextProps = {
  ...defaultSettings,

  // Mode
  onToggleMode: () => {},
  onChangeMode: () => {},

  // Direction
  onToggleDirection: () => {},
  onChangeDirection: () => {},
  onChangeDirectionByLang: () => {},

  // Layout
  onToggleLayout: () => {},
  onChangeLayout: () => {},

  // Contrast
  onToggleContrast: () => {},
  onChangeContrast: () => {},

  // Color
  onChangeColor: () => {},
  setColor: defaultPreset as ColorPreset,
  colorOption: [],

  // Stretch
  onToggleStretch: () => {},

  // Reset
  onResetSetting: () => {},
};

const SettingsContext = createContext<SettingsContextProps>(initialState);

interface SettingsProviderProps {
  children: ReactNode;
}

const SettingsProvider = ({ children }: SettingsProviderProps) => {
  const [settings, setSettings] = useLocalStorage<ThemeSettingsState>(
    "settings",
    {
      themeMode: initialState.themeMode,
      themeLayout: initialState.themeLayout,
      themeStretch: initialState.themeStretch,
      themeContrast: initialState.themeContrast,
      themeDirection: initialState.themeDirection,
      themeColorPresets: initialState.themeColorPresets,
    }
  );

  const isArabic = localStorage.getItem("i18nextLng") === "ar";

  useEffect(() => {
    if (isArabic) {
      onChangeDirectionByLang("ar");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isArabic]);

  // Mode

  const onToggleMode = () => {
    setSettings({
      ...settings,
      themeMode: settings.themeMode === "light" ? "dark" : "light",
    });
  };

  const onChangeMode = (event: ChangeEvent<HTMLInputElement>) => {
    setSettings({
      ...settings,
      themeMode: event.target.value as ThemeMode,
    });
  };

  // Direction

  const onToggleDirection = () => {
    setSettings({
      ...settings,
      themeDirection: settings.themeDirection === "rtl" ? "ltr" : "rtl",
    });
  };

  const onChangeDirection = (event: ChangeEvent<HTMLInputElement>) => {
    setSettings({
      ...settings,
      themeDirection: event.target.value as ThemeDirection,
    });
  };

  const onChangeDirectionByLang = (lang: string) => {
    setSettings({
      ...settings,
      themeDirection: lang === "ar" ? "rtl" : "ltr",
    });
  };

  // Layout

  const onToggleLayout = () => {
    setSettings({
      ...settings,
      themeLayout:
        settings.themeLayout === "vertical" ? "horizontal" : "vertical",
    });
  };

  const onChangeLayout = (event: ChangeEvent<HTMLInputElement>) => {
    setSettings({
      ...settings,
      themeLayout: event.target.value as ThemeLayoutValue,
    });
  };

  // Contrast

  const onToggleContrast = () => {
    setSettings({
      ...settings,
      themeContrast: settings.themeContrast === "default" ? "bold" : "default",
    });
  };

  const onChangeContrast = (event: ChangeEvent<HTMLInputElement>) => {
    setSettings({
      ...settings,
      themeContrast: event.target.value as ThemeContrastValue,
    });
  };

  // Color

  const onChangeColor = (event: ChangeEvent<HTMLInputElement>) => {
    setSettings({
      ...settings,
      themeColorPresets: event.target.value,
    });
  };

  // Stretch

  const onToggleStretch = () => {
    setSettings({
      ...settings,
      themeStretch: !settings.themeStretch,
    });
  };

  // Reset

  const onResetSetting = () => {
    setSettings({
      themeMode: initialState.themeMode,
      themeLayout: initialState.themeLayout,
      themeStretch: initialState.themeStretch,
      themeContrast: initialState.themeContrast,
      themeDirection: initialState.themeDirection,
      themeColorPresets: initialState.themeColorPresets,
    });
  };

  return (
    <SettingsContext.Provider
      value={{
        ...settings, // Mode
        onToggleMode,
        onChangeMode,

        // Direction
        onToggleDirection,
        onChangeDirection,
        onChangeDirectionByLang,

        // Layout
        onToggleLayout,
        onChangeLayout,

        // Contrast
        onChangeContrast,
        onToggleContrast,

        // Stretch
        onToggleStretch,

        // Color
        onChangeColor,
        setColor: getColorPresets(settings.themeColorPresets) as ColorPreset,
        colorOption: (colorPresets as ColorPreset[]).map((color) => ({
          name: color.name,
          value: color.main,
        })),

        // Reset
        onResetSetting,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export { SettingsContext };

export default SettingsProvider;
