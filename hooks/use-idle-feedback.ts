import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";

import {
  playIdleNudgeFeedback,
  type FeedbackPreferences,
} from "@/utils/feedback";

const DEFAULT_IDLE_TIMEOUT_MS = 3 * 60 * 1000;

export const useIdleFeedback = (
  preferences?: FeedbackPreferences,
  enabled = true,
  timeoutMs = DEFAULT_IDLE_TIMEOUT_MS
) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appIsActiveRef = useRef(AppState.currentState === "active");
  const preferencesRef = useRef(preferences);

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  const clearIdleTimer = useCallback(() => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const scheduleIdleTimer = useCallback(() => {
    clearIdleTimer();

    if (!enabled || !appIsActiveRef.current) return;

    timerRef.current = setTimeout(() => {
      // I added this as a gentle "still with you" cue. It uses the same user
      // sound/haptic preferences from Settings and then re-arms itself.
      void playIdleNudgeFeedback(preferencesRef.current);
      scheduleIdleTimer();
    }, timeoutMs);
  }, [clearIdleTimer, enabled, timeoutMs]);

  useEffect(() => {
    scheduleIdleTimer();
    return clearIdleTimer;
  }, [clearIdleTimer, scheduleIdleTimer]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      appIsActiveRef.current = state === "active";

      if (appIsActiveRef.current) {
        scheduleIdleTimer();
      } else {
        clearIdleTimer();
      }
    });

    return () => subscription.remove();
  }, [clearIdleTimer, scheduleIdleTimer]);

  return useCallback(() => {
    scheduleIdleTimer();
  }, [scheduleIdleTimer]);
};
