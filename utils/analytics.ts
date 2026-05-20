import Constants from "expo-constants";
import { addDoc, collection, doc, getDoc } from "firebase/firestore";

import { auth, db } from "@/constants/firebaseConfig";

export type AnalyticsEventName =
  | "app_opened"
  | "daily_report_exported"
  | "weekly_report_exported"
  | "privacy_opened"
  | "calendar_sync"
  | "friend_nudge_sent"
  | "admin_dashboard_opened";

export type TaskAnalyticsEvent = {
  taskId?: string | null;
  eventType: "created" | "completed" | "skipped" | "rescheduled" | "focused";
  title: string;
  date: string;
  time?: string | null;
  priority?: "Low" | "Medium" | "High" | null;
  completed?: boolean;
  status?: "pending" | "completed" | "skipped";
  durationMinutes?: number | null;
};

const getAnalyticsBaseUrl = () =>
  (process.env.EXPO_PUBLIC_AI_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

const isAnalyticsOptedOut = async (uid: string) => {
  const profile = await getDoc(doc(db, "users", uid)).catch(() => null);
  return profile?.data()?.analyticsOptOut === true;
};

export const logProductionAnalyticsEvent = async (
  eventName: AnalyticsEventName,
  metadata: Record<string, unknown> = {}
) => {
  const user = auth.currentUser;
  if (!user) return;
  if (await isAnalyticsOptedOut(user.uid)) return;

  // I keep this event small and owner-scoped. It gives us production signals
  // without storing private task text unless a caller intentionally includes it.
  await addDoc(collection(db, "users", user.uid, "analyticsEvents"), {
    eventName,
    metadata,
    appVersion: Constants.expoConfig?.version ?? "1.0.0",
    createdAt: new Date(),
  }).catch(() => {});
};

export const logTaskAnalyticsEvent = async (event: TaskAnalyticsEvent) => {
  const user = auth.currentUser;
  if (!user) return;
  if (await isAnalyticsOptedOut(user.uid)) return;

  const payload = {
    user_hash: `user_${user.uid.slice(0, 12)}`,
    task_id: event.taskId ?? null,
    event_type: event.eventType,
    title: event.title,
    date: event.date,
    time: event.time ?? null,
    priority: event.priority ?? "Medium",
    completed: event.completed ?? false,
    status: event.status ?? "pending",
    duration_minutes: event.durationMinutes ?? null,
    created_at: new Date().toISOString(),
  };

  await fetch(`${getAnalyticsBaseUrl()}/v1/analytics/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await user.getIdToken().catch(() => "")}`,
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
};
