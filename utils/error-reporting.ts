import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { addDoc, collection, doc, getDoc, setDoc } from "firebase/firestore";
import { Platform } from "react-native";

import { auth, db } from "@/constants/firebaseConfig";

export type ErrorSeverity = "info" | "warning" | "error" | "fatal";

type ReportAppErrorInput = {
  source: string;
  error: unknown;
  severity?: ErrorSeverity;
  metadata?: Record<string, unknown>;
};

export type LocalErrorReport = {
  source: string;
  severity: ErrorSeverity;
  name: string;
  message: string;
  stack: string | null;
  metadata: Record<string, unknown>;
  fingerprint: string;
  appVersion: string;
  createdAtIso: string;
  device: {
    platform: string;
    osVersion: string | number;
    appOwnership: string | null;
    executionEnvironment: string | null;
  };
};

const LOCAL_ERROR_BUFFER_KEY = "daily-discipline.local-error-buffer";
const MAX_LOCAL_ERRORS = 25;

const safeJson = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch {
    return "Unserializable error";
  }
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
        : safeJson(error) ?? "Unknown app error",
    stack: null,
  };
};

const getDeviceContext = () => ({
  platform: Platform.OS,
  osVersion: Platform.Version,
  appOwnership: Constants.appOwnership ?? null,
  executionEnvironment: Constants.executionEnvironment ?? null,
});

const buildFingerprint = (source: string, name: string, message: string) =>
  `${source}:${name}:${message}`.slice(0, 240);

export const getLocalErrorReports = async () => {
  const raw = await AsyncStorage.getItem(LOCAL_ERROR_BUFFER_KEY);
  if (!raw) return [] as LocalErrorReport[];

  try {
    return JSON.parse(raw) as LocalErrorReport[];
  } catch {
    return [] as LocalErrorReport[];
  }
};

export const clearLocalErrorReports = async () => {
  await AsyncStorage.removeItem(LOCAL_ERROR_BUFFER_KEY);
};

const cacheLocalErrorReport = async (report: LocalErrorReport) => {
  const current = await getLocalErrorReports();
  await AsyncStorage.setItem(
    LOCAL_ERROR_BUFFER_KEY,
    JSON.stringify([report, ...current].slice(0, MAX_LOCAL_ERRORS))
  );
};

export const reportAppError = async ({
  source,
  error,
  severity = "error",
  metadata,
}: ReportAppErrorInput) => {
  const normalized = normalizeError(error);
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  const report: LocalErrorReport = {
    ...normalized,
    source,
    severity,
    metadata: metadata ?? {},
    fingerprint: buildFingerprint(source, normalized.name, normalized.message),
    appVersion,
    createdAtIso: new Date().toISOString(),
    device: getDeviceContext(),
  };

  await cacheLocalErrorReport(report).catch(() => {});

  const user = auth.currentUser;
  if (!user) return;

  const profile = await getDoc(doc(db, "users", user.uid)).catch(() => null);
  if (profile?.data()?.crashReportingOptOut === true) return;

  // I added this Firestore reporter as a lightweight Crashlytics-style layer.
  // It gives us production debugging signals in Expo without committing to a
  // native crash SDK before the first tester builds are stable.
  await addDoc(collection(db, "users", user.uid, "appErrors"), {
    ...report,
    createdAt: new Date(),
  }).catch(() => {});

  await setDoc(
    doc(db, "users", user.uid, "diagnosticSummary", "latest"),
    {
      lastErrorSource: source,
      lastErrorSeverity: severity,
      lastErrorMessage: normalized.message,
      lastErrorFingerprint: report.fingerprint,
      lastErrorAt: new Date(),
      appVersion,
    },
    { merge: true }
  ).catch(() => {});
};
