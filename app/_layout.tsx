import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { onAuthStateChanged, User } from "firebase/auth";
import { useEffect, useState } from "react";
import "react-native-reanimated";

import {
  AppThemeContext,
  getStoredTheme,
  hasSeenOnboarding,
  setStoredTheme,
} from "@/constants/appTheme";
import { AppThemeName, Colors } from "@/constants/theme";
import { auth } from "../constants/firebaseConfig";

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [themeName, setThemeNameState] = useState<AppThemeName>("pastel");
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [onboardingSeen, setOnboardingSeen] = useState<boolean | null>(null);

  useEffect(() => {
    const loadAppState = async () => {
      const [savedTheme, seenOnboarding] = await Promise.all([
        getStoredTheme(),
        hasSeenOnboarding(),
      ]);

      setThemeNameState(savedTheme);
      setThemeLoaded(true);
      setOnboardingSeen(seenOnboarding);
    };

    loadAppState();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    Notifications.requestPermissionsAsync();

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }, []);

  useEffect(() => {
    if (loading || !themeLoaded || onboardingSeen === null) return;

    const firstSegment = segments[0];
    const inProtectedTabs = firstSegment === "(tabs)";
    const inSummary = firstSegment === "summary";
    const inOnboarding = firstSegment === "onboarding";
    const inAuthScreen = firstSegment === "login" || firstSegment === "signup";

    if (!onboardingSeen && !inOnboarding) {
      router.replace("/onboarding");
      return;
    }

    if (onboardingSeen && inOnboarding) {
      router.replace(user ? "/(tabs)" : "/login");
      return;
    }

    if (!user && (inProtectedTabs || inSummary)) {
      router.replace("/login");
      return;
    }

    if (user && inAuthScreen) {
      router.replace("/(tabs)");
    }
  }, [loading, onboardingSeen, router, segments, themeLoaded, user]);

  const setThemeName = async (theme: AppThemeName) => {
    setThemeNameState(theme);
    await setStoredTheme(theme);
  };

  if (loading || !themeLoaded || onboardingSeen === null) {
    return null;
  }

  const palette = Colors[themeName];
  const navigationTheme =
    themeName === "dark"
      ? {
          ...DarkTheme,
          colors: {
            ...DarkTheme.colors,
            background: palette.background,
            card: palette.card,
            primary: palette.tint,
            text: palette.text,
            border: palette.border,
            notification: palette.tint,
          },
        }
      : {
          ...DefaultTheme,
          colors: {
            ...DefaultTheme.colors,
            background: palette.background,
            card: palette.card,
            primary: palette.tint,
            text: palette.text,
            border: palette.border,
            notification: palette.tint,
          },
        };

  return (
    <AppThemeContext.Provider value={{ themeName, setThemeName }}>
      <ThemeProvider value={navigationTheme}>
        <Stack>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="signup" options={{ headerShown: false }} />
          <Stack.Screen name="summary" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style={themeName === "dark" ? "light" : "dark"} />
      </ThemeProvider>
    </AppThemeContext.Provider>
  );
}
