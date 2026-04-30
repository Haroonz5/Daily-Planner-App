import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext } from "react";
import type { AppThemeName } from "./theme";

export const THEME_STORAGE_KEY = "appTheme";
export const ONBOARDING_STORAGE_KEY = "hasSeenOnboarding";

export const themeOptions: AppThemeName[] = [
  "pastel",
  "light",
  "dark",
  "focus",
  "sunset",
  "ocean",
  "midnight",
  "obsidian",
  "emberNight",
  "amazonLight",
  "githubDark",
  "auroraDark",
];

export const getStoredTheme = async (): Promise<AppThemeName> => {
  const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);

  if (saved && themeOptions.includes(saved as AppThemeName)) {
    return saved as AppThemeName;
  }

  return "pastel";
};

export const setStoredTheme = async (theme: AppThemeName) => {
  await AsyncStorage.setItem(THEME_STORAGE_KEY, theme);
};

export const hasSeenOnboarding = async () => {
  const value = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
  return value === "true";
};

export const markOnboardingSeen = async () => {
  await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
};

type ThemeContextValue = {
  themeName: AppThemeName;
  setThemeName: (theme: AppThemeName) => Promise<void>;
};

export const AppThemeContext = createContext<ThemeContextValue>({
  themeName: "pastel",
  setThemeName: async () => {},
});

export const useAppTheme = () => useContext(AppThemeContext);
