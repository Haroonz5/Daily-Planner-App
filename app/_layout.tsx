import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

import { ErrorBoundary } from "@/components/error-boundary";
import {
  AppThemeContext,
  getStoredTheme,
  hasSeenOnboarding,
  setStoredTheme,
} from "@/constants/appTheme";
import { featureFlags } from "@/constants/featureFlags";
import { AppThemeName, Colors } from "@/constants/theme";
import {
  configureTaskNotificationActions,
  ensureBaseReminders,
  handleTaskNotificationResponse,
} from "../utils/notifications";
import { getStartupQuote } from "../utils/discipline-quotes";
import { getEmailVerificationSkipped } from "../utils/email-verification";
import { useIdleFeedback } from "@/hooks/use-idle-feedback";
import { useUserProfile } from "@/hooks/use-user-profile";
import { reportAppError } from "../utils/error-reporting";
import { flushOfflineTaskQueue } from "../utils/offline-task-queue";
import { auth, db } from "../constants/firebaseConfig";

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { profile } = useUserProfile();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [themeName, setThemeNameState] = useState<AppThemeName>("pastel");
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [onboardingSeen, setOnboardingSeen] = useState<boolean | null>(null);
  const [tutorialCompleted, setTutorialCompleted] = useState<
    boolean | undefined
  >(undefined);
  const [emailVerificationSkipped, setEmailVerificationSkippedState] = useState<
    boolean | undefined
  >(undefined);

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
    let active = true;

    if (!user) {
      setEmailVerificationSkippedState(false);
      return;
    }

    setEmailVerificationSkippedState(undefined);
    void getEmailVerificationSkipped(user.uid)
      .then((skipped) => {
        if (active) setEmailVerificationSkippedState(skipped);
      })
      .catch(() => {
        if (active) setEmailVerificationSkippedState(false);
      });

    return () => {
      active = false;
    };
  }, [segments, user]);

  useEffect(() => {
    if (!user) {
      setTutorialCompleted(undefined);
      return;
    }

    setTutorialCompleted(undefined);

    const profileRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(
      profileRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setTutorialCompleted(true);
          return;
        }

        const completed = snapshot.data().tutorialCompleted;
        setTutorialCompleted(typeof completed === "boolean" ? completed : true);
      },
      () => {
        setTutorialCompleted(true);
      }
    );

    return unsubscribe;
  }, [user]);

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

    configureTaskNotificationActions().catch(() => {});
    ensureBaseReminders().catch(() => {});

    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        handleTaskNotificationResponse(response).catch(() => {});
      });

    return () => {
      responseSubscription.remove();
    };
  }, []);

  useEffect(() => {
    const errorUtils = (globalThis as any).ErrorUtils;
    if (!errorUtils?.setGlobalHandler || !errorUtils?.getGlobalHandler) return;

    const previousHandler = errorUtils.getGlobalHandler();

    // I added this lightweight global reporter for async/native errors that do
    // not pass through React's ErrorBoundary. It logs and still lets React
    // Native's original red-screen handler do its normal work.
    errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      reportAppError({
        source: "GlobalErrorHandler",
        error,
        metadata: { isFatal: Boolean(isFatal) },
      }).catch(() => {});

      previousHandler?.(error, isFatal);
    });

    return () => {
      errorUtils.setGlobalHandler(previousHandler);
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    // I added this offline flush here because RootLayout is the first place that
    // reliably knows the user is signed in again. Queued task intent gets synced
    // quietly instead of making the user hunt for a manual retry button.
    flushOfflineTaskQueue(user.uid).catch(() => {});

    const response = Notifications.getLastNotificationResponse();
    if (!response) return;

    handleTaskNotificationResponse(response)
      .then((handled) => {
        if (handled) Notifications.clearLastNotificationResponse();
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (
      loading ||
      !themeLoaded ||
      onboardingSeen === null ||
      (user && emailVerificationSkipped === undefined)
    ) {
      return;
    }

    const firstSegment = String(segments[0] ?? "");
    const inProtectedTabs = firstSegment === "(tabs)";
    const inSummary = firstSegment === "summary";
    const inFocus = firstSegment === "focus";
    const inSettings = firstSegment === "settings";
    const inPetHome = firstSegment === "pet-home";
    const inWeek = firstSegment === "week";
    const inFriends = firstSegment === "friends";
    const inTutorial = firstSegment === "tutorial";
    const inVerifyEmail = firstSegment === "verify-email";
    const inOnboarding = firstSegment === "onboarding";
    const inLanding = firstSegment === "landing";
    const inAuthScreen = firstSegment === "login" || firstSegment === "signup";

    if (!onboardingSeen && !inOnboarding && !inLanding && !inAuthScreen) {
      router.replace("/onboarding");
      return;
    }

    if (onboardingSeen && inOnboarding) {
      if (user && tutorialCompleted === undefined) return;
      router.replace(
        (user && tutorialCompleted === false
          ? "/tutorial"
          : user
            ? "/(tabs)"
            : "/login") as never
      );
      return;
    }

    if (
      !user &&
      (inProtectedTabs ||
        inSummary ||
        inFocus ||
        inSettings ||
        inPetHome ||
        inWeek ||
        inFriends ||
        inTutorial ||
        inVerifyEmail)
    ) {
      router.replace("/login");
      return;
    }

    if (user && !user.emailVerified && !emailVerificationSkipped) {
      // I added this email gate so signup is protected twice: Firebase account
      // auth first, then verified email before tasks, friends, and progress open.
      if (!inVerifyEmail) {
        router.replace("/verify-email" as never);
      }
      return;
    }

    if (user && (user.emailVerified || emailVerificationSkipped) && inVerifyEmail) {
      if (tutorialCompleted === undefined) return;
      router.replace(
        (tutorialCompleted === false ? "/tutorial" : "/(tabs)") as never
      );
      return;
    }

    if (user && tutorialCompleted === false && !inTutorial) {
      router.replace("/tutorial" as never);
      return;
    }

    if (user && tutorialCompleted === true && inTutorial) {
      router.replace("/(tabs)");
      return;
    }

    if (user && inAuthScreen) {
      if (tutorialCompleted === undefined) return;
      router.replace(
        (tutorialCompleted === false ? "/tutorial" : "/(tabs)") as never
      );
    }
  }, [
    loading,
    emailVerificationSkipped,
    onboardingSeen,
    router,
    segments,
    themeLoaded,
    tutorialCompleted,
    user,
  ]);

  const setThemeName = async (theme: AppThemeName) => {
    setThemeNameState(theme);
    await setStoredTheme(theme);
  };

  const startupQuote = getStartupQuote();
  const markAppInteraction = useIdleFeedback(
    profile,
    Boolean(user) && featureFlags.enableIdleSounds
  );

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
          <View
            style={{
              marginTop: 22,
              padding: 16,
              borderRadius: 20,
              backgroundColor: "rgba(255,255,255,0.08)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.14)",
            }}
          >
            <Text
              style={{
                color: "#fff",
                fontSize: 15,
                lineHeight: 22,
                textAlign: "center",
                fontWeight: "700",
              }}
            >
              {startupQuote.text}
            </Text>
            <Text
              style={{
                marginTop: 8,
                color: "rgba(255,255,255,0.68)",
                fontSize: 12,
                textAlign: "center",
              }}
            >
              {startupQuote.author}
            </Text>
          </View>
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
    <GestureHandlerRootView style={{ flex: 1 }} onTouchStart={markAppInteraction}>
      <AppThemeContext.Provider value={{ themeName, setThemeName }}>
        <ThemeProvider value={navigationTheme}>
          <ErrorBoundary>
            <Stack>
              <Stack.Screen name="onboarding" options={{ headerShown: false }} />
              <Stack.Screen name="landing" options={{ headerShown: false }} />
              <Stack.Screen name="tutorial" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="login" options={{ headerShown: false }} />
              <Stack.Screen name="signup" options={{ headerShown: false }} />
              <Stack.Screen name="verify-email" options={{ headerShown: false }} />
              <Stack.Screen name="summary" options={{ headerShown: false }} />
              <Stack.Screen name="focus" options={{ headerShown: false }} />
              <Stack.Screen name="pet-home" options={{ headerShown: false }} />
              <Stack.Screen name="week" options={{ headerShown: false }} />
              <Stack.Screen name="friends" options={{ headerShown: false }} />
              <Stack.Screen name="settings" options={{ headerShown: false }} />
              <Stack.Screen name="modal" options={{ headerShown: false }} />
            </Stack>
          </ErrorBoundary>
          <StatusBar style={palette.statusBar} />
        </ThemeProvider>
      </AppThemeContext.Provider>
    </GestureHandlerRootView>
  );
}
