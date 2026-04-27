import { Platform } from "react-native";

export type AppThemeName =
  | "pastel"
  | "light"
  | "dark"
  | "focus"
  | "sunset"
  | "ocean"
  | "midnight"
  | "obsidian"
  | "emberNight";

type ThemePalette = {
  text: string;
  background: string;
  card: string;
  surface: string;
  tint: string;
  icon: string;
  tabIconDefault: string;
  tabIconSelected: string;
  subtle: string;
  border: string;
  danger: string;
  success: string;
  warning: string;
  statusBar: "light" | "dark";
  navigationTone: "light" | "dark";
};

export const ThemeLabels: Record<AppThemeName, string> = {
  pastel: "Pastel",
  light: "Light",
  dark: "Dark",
  focus: "Focus",
  sunset: "Sunset",
  ocean: "Ocean",
  midnight: "Midnight",
  obsidian: "Obsidian",
  emberNight: "Ember Night",
};

export const Colors: Record<AppThemeName, ThemePalette> = {
  pastel: {
    text: "#4a3f55",
    background: "#fdf6ff",
    card: "#ffffff",
    surface: "#f8f0fb",
    tint: "#c4a8d4",
    icon: "#9b8aa8",
    tabIconDefault: "#baa8c6",
    tabIconSelected: "#c4a8d4",
    subtle: "#9b8aa8",
    border: "#e8d8f0",
    danger: "#e07a9b",
    success: "#8dcf9f",
    warning: "#f2b97f",
    statusBar: "dark",
    navigationTone: "light",
  },
  light: {
    text: "#2b2f38",
    background: "#f8fafc",
    card: "#ffffff",
    surface: "#eef2f7",
    tint: "#6c8ef5",
    icon: "#7a8599",
    tabIconDefault: "#9aa3b2",
    tabIconSelected: "#6c8ef5",
    subtle: "#6b7280",
    border: "#dbe3ef",
    danger: "#dc6f7d",
    success: "#5fa97a",
    warning: "#e0a84f",
    statusBar: "dark",
    navigationTone: "light",
  },
  dark: {
    text: "#f3f4f6",
    background: "#121418",
    card: "#1b1f27",
    surface: "#252b36",
    tint: "#8ca8ff",
    icon: "#9aa4b2",
    tabIconDefault: "#657080",
    tabIconSelected: "#8ca8ff",
    subtle: "#b3bcc8",
    border: "#2f3744",
    danger: "#ff8ba0",
    success: "#7ad79d",
    warning: "#f4c27a",
    statusBar: "light",
    navigationTone: "dark",
  },
  focus: {
    text: "#1f2a1f",
    background: "#f4f1e8",
    card: "#fffdf7",
    surface: "#ece6d7",
    tint: "#6f8a56",
    icon: "#7d876f",
    tabIconDefault: "#a0a78f",
    tabIconSelected: "#6f8a56",
    subtle: "#707763",
    border: "#ddd5c2",
    danger: "#c96f5d",
    success: "#7aa06a",
    warning: "#c79a4b",
    statusBar: "dark",
    navigationTone: "light",
  },
  sunset: {
    text: "#4b2c2b",
    background: "#fff4ec",
    card: "#fffdf8",
    surface: "#fde6da",
    tint: "#dd6b4d",
    icon: "#aa7a69",
    tabIconDefault: "#c49b88",
    tabIconSelected: "#dd6b4d",
    subtle: "#8b6a61",
    border: "#f1d1c4",
    danger: "#d95d70",
    success: "#7aa46d",
    warning: "#e7a44d",
    statusBar: "dark",
    navigationTone: "light",
  },
  ocean: {
    text: "#163848",
    background: "#eefbff",
    card: "#ffffff",
    surface: "#dff2f6",
    tint: "#2d8fa3",
    icon: "#5f8b97",
    tabIconDefault: "#8db3bc",
    tabIconSelected: "#2d8fa3",
    subtle: "#5a7e88",
    border: "#c9e6ed",
    danger: "#d56f7b",
    success: "#58a68b",
    warning: "#d7a347",
    statusBar: "dark",
    navigationTone: "light",
  },
  midnight: {
    text: "#f4f7ff",
    background: "#0c1220",
    card: "#141d31",
    surface: "#1d2942",
    tint: "#67d1ff",
    icon: "#8aa0c0",
    tabIconDefault: "#53637d",
    tabIconSelected: "#67d1ff",
    subtle: "#b3c1d8",
    border: "#25324b",
    danger: "#ff8ca2",
    success: "#6fd3a7",
    warning: "#f0c36f",
    statusBar: "light",
    navigationTone: "dark",
  },
  obsidian: {
    text: "#f6f1e8",
    background: "#070707",
    card: "#111111",
    surface: "#1c1a17",
    tint: "#d7b46a",
    icon: "#9a9286",
    tabIconDefault: "#676059",
    tabIconSelected: "#d7b46a",
    subtle: "#b7aa9a",
    border: "#2a2620",
    danger: "#ff7d7d",
    success: "#87d99a",
    warning: "#f0bd62",
    statusBar: "light",
    navigationTone: "dark",
  },
  emberNight: {
    text: "#fff3eb",
    background: "#150c0a",
    card: "#22130f",
    surface: "#321c16",
    tint: "#ff8a4c",
    icon: "#b78978",
    tabIconDefault: "#7e5b50",
    tabIconSelected: "#ff8a4c",
    subtle: "#d4ab9b",
    border: "#43271f",
    danger: "#ff7a93",
    success: "#8ed69d",
    warning: "#ffc46b",
    statusBar: "light",
    navigationTone: "dark",
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
