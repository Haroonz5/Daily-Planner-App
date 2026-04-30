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
import { ActivityIndicator, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

import {
  AppThemeContext,
  getStoredTheme,
  hasSeenOnboarding,
  setStoredTheme,
} from "@/constants/appTheme";
import { AppThemeName, Colors } from "@/constants/theme";
import { ensureBaseReminders } from "../utils/notifications";
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
    const loadTheme = async () => {
      const savedTheme = await getStoredTheme();
      setThemeNameState(savedTheme);
      setThemeLoaded(true);
    };

    loadTheme();
  }, []);

  useEffect(() => {
    const loadOnboardingStatus = async () => {
      const seen = await hasSeenOnboarding();
      setOnboardingSeen(seen);
    };

    loadOnboardingStatus();
  }, [segments]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    ensureBaseReminders().catch(() => {});
  }, []);

  useEffect(() => {
    if (loading || !themeLoaded || onboardingSeen === null) return;

    const firstSegment = segments[0];
    const inProtectedTabs = firstSegment === "(tabs)";
    const inSummary = firstSegment === "summary";
    const inFocus = firstSegment === "focus";
    const inSettings = firstSegment === "settings";
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

    if (!user && (inProtectedTabs || inSummary || inFocus || inSettings)) {
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
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            backgroundColor: "#030647",
          }}
        >
          <ActivityIndicator color="#c4a8d4" size="large" />
          <Text
            style={{
              marginTop: 16,
              color: "#fff",
              fontSize: 18,
              fontWeight: "800",
            }}
          >
            Loading Daily Discipline
          </Text>
          <Text
            style={{
              marginTop: 6,
              color: "rgba(255,255,255,0.68)",
              fontSize: 13,
              textAlign: "center",
            }}
          >
            Checking your account, theme, and reminders.
          </Text>
        </View>
      </GestureHandlerRootView>
    );
  }

  const palette = Colors[themeName];
  const navigationTheme =
    palette.navigationTone === "dark"
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppThemeContext.Provider value={{ themeName, setThemeName }}>
        <ThemeProvider value={navigationTheme}>
          <Stack>
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="signup" options={{ headerShown: false }} />
            <Stack.Screen name="summary" options={{ headerShown: false }} />
            <Stack.Screen name="focus" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ headerShown: false }} />
          </Stack>
          <StatusBar style={palette.statusBar} />
        </ThemeProvider>
      </AppThemeContext.Provider>
    </GestureHandlerRootView>
  );
}
