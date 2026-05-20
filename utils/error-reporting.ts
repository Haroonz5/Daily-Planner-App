import Constants from "expo-constants";
import { addDoc, collection, doc, getDoc } from "firebase/firestore";

import { auth, db } from "@/constants/firebaseConfig";

type ReportAppErrorInput = {
  source: string;
  error: unknown;
  metadata?: Record<string, unknown>;
};

const normalizeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }

  return {
    name: "UnknownError",
    message:
      typeof error === "string"
        ? error
        : JSON.stringify(error) ?? "Unknown app error",
    stack: null,
  };
};

export const reportAppError = async ({
  source,
  error,
  metadata,
}: ReportAppErrorInput) => {
  const user = auth.currentUser;
  if (!user) return;

  const profile = await getDoc(doc(db, "users", user.uid)).catch(() => null);
  if (profile?.data()?.crashReportingOptOut === true) return;

  const normalized = normalizeError(error);

  // I added this Firestore reporter as a lightweight Crashlytics-style layer.
  // It gives us production debugging signals in Expo without committing to a
  // native crash SDK before the first tester builds are stable.
  await addDoc(collection(db, "users", user.uid, "appErrors"), {
    ...normalized,
    source,
    metadata: metadata ?? {},
    appVersion: Constants.expoConfig?.version ?? "1.0.0",
    createdAt: new Date(),
  }).catch(() => {});
};
