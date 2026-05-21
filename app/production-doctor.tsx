import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { AmbientBackground } from "@/components/ambient-background";
import { useAppTheme } from "@/constants/appTheme";
import { Colors } from "@/constants/theme";
import { auth, db } from "@/constants/firebaseConfig";
import { getAppCheckClientStatus } from "@/utils/app-check";
import { checkAiBackendHealth, type AiBackendHealth } from "@/utils/ai";
import { getCrashProviderStatus } from "@/utils/crash-provider";
import { playSaveFeedback, playSelectionFeedback, playWarningFeedback } from "@/utils/feedback";
import { getOfflineSyncSummary, type OfflineSyncSummary } from "@/utils/offline-task-queue";
import { getScheduledNotificationAudit, registerExpoPushTokenForUser, type ScheduledNotificationAudit } from "@/utils/notifications";

type CheckStatus = "pass" | "warn" | "fail";

type PushReceiptRow = {
  id: string;
  status?: string;
  reason?: string;
  receiptStatus?: string | null;
  receiptReason?: string | null;
  type?: string;
};

const statusLabel = {
  pass: "PASS",
  warn: "WARN",
  fail: "FAIL",
} as const;

const statusScore = { pass: 2, warn: 1, fail: 0 } as const;

export default function ProductionDoctorScreen() {
  const router = useRouter();
  const { themeName } = useAppTheme();
  const colors = Colors[themeName];
  const [busy, setBusy] = useState(false);
  const [aiHealth, setAiHealth] = useState<AiBackendHealth | null>(null);
  const [notificationAudit, setNotificationAudit] = useState<ScheduledNotificationAudit | null>(null);
  const [offlineSummary, setOfflineSummary] = useState<OfflineSyncSummary | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [pushReceipts, setPushReceipts] = useState<PushReceiptRow[]>([]);
  const [appCheck, setAppCheck] = useState({ hasBridge: false, hasDebugToken: false, hasToken: false });
  const [crashProvider, setCrashProvider] = useState({ configured: false });
  const [notificationPermission, setNotificationPermission] = useState<string>("unknown");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const runChecks = async () => {
    setBusy(true);
    const uid = auth.currentUser?.uid;

    try {
      const [health, audit, offline, appCheckStatus, permission] = await Promise.all([
        checkAiBackendHealth().catch(() => null),
        getScheduledNotificationAudit().catch(() => null),
        getOfflineSyncSummary().catch(() => null),
        getAppCheckClientStatus().catch(() => ({ hasBridge: false, hasDebugToken: false, hasToken: false })),
        Notifications.getPermissionsAsync().catch(() => null),
      ]);

      setAiHealth(health);
      setNotificationAudit(audit);
      setOfflineSummary(offline);
      setAppCheck(appCheckStatus);
      setCrashProvider(getCrashProviderStatus());
      setNotificationPermission(permission?.granted ? "granted" : permission?.status ?? "unknown");

      if (uid) {
        const token = await registerExpoPushTokenForUser(uid).catch(() => null);
        setPushToken(token);

        const receiptSnapshot = await getDocs(
          query(collection(db, "users", uid, "pushReceipts"), orderBy("createdAt", "desc"), limit(8))
        ).catch(() => null);
        setPushReceipts(
          receiptSnapshot?.docs.map((item) => ({ id: item.id, ...item.data() }) as PushReceiptRow) ?? []
        );
      }

      setLastChecked(new Date());
      await playSaveFeedback({});
    } catch {
      await playWarningFeedback({});
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void runChecks();
  }, []);

  const checks = useMemo(() => {
    const latestReceipt = pushReceipts[0];
    const receiptStatus = latestReceipt?.receiptStatus;
    const receiptHealthy = receiptStatus === "delivered" || receiptStatus === "pending";

    return [
      {
        label: "AI gateway/backend",
        status: aiHealth?.ok ? "pass" : "fail",
        detail: aiHealth?.ok
          ? `${aiHealth.provider} responded in ${aiHealth.responseMs}ms at ${aiHealth.url}`
          : "AI backend is unreachable. Local fallback still protects task creation.",
      },
      {
        label: "Gateway security",
        status: aiHealth?.provider === "gateway" && aiHealth.authMode === "firebase" ? "pass" : "warn",
        detail:
          aiHealth?.provider === "gateway"
            ? `Auth ${aiHealth.authMode ?? "unknown"}, App Check ${aiHealth.appCheckMode ?? "off"}, audit ${aiHealth.auditDb ? "DB" : "stdout"}`
            : "Point production builds at the Go security gateway.",
      },
      {
        label: "Mobile App Check client",
        status: appCheck.hasToken ? "pass" : appCheck.hasBridge || appCheck.hasDebugToken ? "warn" : "warn",
        detail: appCheck.hasToken
          ? "App Check token is available for gateway requests."
          : appCheck.hasBridge
            ? "Native bridge exists but did not return a token yet."
            : "No native App Check bridge yet. Keep gateway App Check optional for testers.",
      },
      {
        label: "Push token",
        status: pushToken ? "pass" : notificationPermission === "granted" ? "warn" : "fail",
        detail: pushToken
          ? `Expo token ending ${pushToken.slice(-10)} registered.`
          : `Notification permission is ${notificationPermission}.`,
      },
      {
        label: "Push receipts",
        status: latestReceipt ? (receiptHealthy ? "pass" : "warn") : "warn",
        detail: latestReceipt
          ? `${latestReceipt.type ?? "push"}: send ${latestReceipt.status ?? "unknown"}, receipt ${latestReceipt.receiptStatus ?? "not checked"}`
          : "No server push receipts yet. Send a nudge or due-task push after Functions deploy.",
      },
      {
        label: "Local reminders",
        status: notificationAudit && notificationAudit.duplicateCount === 0 ? "pass" : "warn",
        detail: notificationAudit
          ? `${notificationAudit.total} scheduled, ${notificationAudit.duplicateCount} duplicate.`
          : "Could not read scheduled notifications.",
      },
      {
        label: "Offline sync queue",
        status: offlineSummary?.total === 0 ? "pass" : offlineSummary ? "warn" : "fail",
        detail: offlineSummary
          ? `${offlineSummary.total} queued, ${offlineSummary.ready} ready, ${offlineSummary.failed} retried.`
          : "Offline queue summary unavailable.",
      },
      {
        label: "Crash provider",
        status: crashProvider.configured ? "pass" : "warn",
        detail: crashProvider.configured
          ? "Native crash provider bridge is configured."
          : "Firestore Crash Viewer is active; Sentry/Crashlytics bridge not installed yet.",
      },
    ] as { label: string; status: CheckStatus; detail: string }[];
  }, [aiHealth, appCheck, crashProvider, notificationAudit, notificationPermission, offlineSummary, pushReceipts, pushToken]);

  const readiness = useMemo(() => {
    const score = checks.reduce((sum, check) => sum + statusScore[check.status], 0);
    const max = checks.length * 2;
    return Math.round((score / max) * 100);
  }, [checks]);

  const shareDoctorReport = async () => {
    await Share.share({
      message: [
        `Daily Discipline Production Doctor: ${readiness}% ready`,
        lastChecked ? `Checked ${lastChecked.toLocaleString()}` : "Not checked yet",
        ...checks.map((check) => `${statusLabel[check.status]} ${check.label}: ${check.detail}`),
      ].join("\n"),
    });
    await playSelectionFeedback({});
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <AmbientBackground colors={colors} variant="signal" />
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
        <Text style={[styles.back, { color: colors.tint }]}>Back</Text>
      </TouchableOpacity>

      <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}> 
        <Text style={[styles.kicker, { color: colors.tint }]}>Production Doctor</Text>
        <Text style={[styles.title, { color: colors.text }]}>Can this build survive testers?</Text>
        <Text style={[styles.body, { color: colors.subtle }]}>One screen for AI, gateway security, App Check, push, offline sync, and crash reporting health.</Text>
      </View>

      <View style={[styles.scoreCard, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.tint }]}> 
        <Text style={[styles.scoreValue, { color: colors.text }]}>{readiness}%</Text>
        <Text style={[styles.scoreLabel, { color: colors.subtle }]}>Production readiness</Text>
        <Text style={[styles.scoreMeta, { color: colors.subtle }]}>{lastChecked ? `Last checked ${lastChecked.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Run checks to refresh"}</Text>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: busy ? colors.border : colors.tint }]} onPress={runChecks} disabled={busy} accessibilityRole="button" accessibilityLabel="Run production doctor checks">
          <Text style={styles.primaryText}>{busy ? "Checking..." : "Run Checks"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={shareDoctorReport} accessibilityRole="button" accessibilityLabel="Share production doctor report">
          <Text style={[styles.secondaryText, { color: colors.text }]}>Share Report</Text>
        </TouchableOpacity>
      </View>

      {checks.map((check) => (
        <View key={check.label} style={[styles.checkCard, { backgroundColor: colors.card, borderColor: check.status === "pass" ? colors.success : check.status === "warn" ? colors.warning : colors.danger }]}> 
          <View style={styles.checkHeader}>
            <Text style={[styles.checkTitle, { color: colors.text }]}>{check.label}</Text>
            <Text style={[styles.checkBadge, { color: check.status === "pass" ? colors.success : check.status === "warn" ? colors.warning : colors.danger }]}>{statusLabel[check.status]}</Text>
          </View>
          <Text style={[styles.checkBody, { color: colors.subtle }]}>{check.detail}</Text>
        </View>
      ))}

      {pushReceipts.length ? (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Text style={[styles.cardTitle, { color: colors.text }]}>Latest Push Receipts</Text>
          {pushReceipts.slice(0, 5).map((receipt) => (
            <Text key={receipt.id} style={[styles.line, { color: colors.subtle }]}>
              {receipt.type ?? "push"} · send {receipt.status ?? "unknown"} · receipt {receipt.receiptStatus ?? "pending"}
              {receipt.receiptReason ? ` · ${receipt.receiptReason}` : ""}
            </Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 62, paddingBottom: 140 },
  back: { fontSize: 15, fontWeight: "900", marginBottom: 18 },
  hero: { borderWidth: 1, borderRadius: 28, padding: 22, marginBottom: 18 },
  kicker: { fontSize: 12, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 },
  title: { fontSize: 30, fontWeight: "900", lineHeight: 35, marginBottom: 10 },
  body: { fontSize: 15, lineHeight: 22 },
  scoreCard: { borderWidth: 1, borderRadius: 26, padding: 22, marginBottom: 14, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 5 },
  scoreValue: { fontSize: 52, fontWeight: "900", letterSpacing: -2 },
  scoreLabel: { fontSize: 13, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8 },
  scoreMeta: { fontSize: 13, fontWeight: "700", marginTop: 6 },
  actionRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  primaryButton: { flex: 1, borderRadius: 18, paddingVertical: 15, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "900" },
  secondaryButton: { flex: 1, borderWidth: 1, borderRadius: 18, paddingVertical: 15, alignItems: "center" },
  secondaryText: { fontSize: 15, fontWeight: "900" },
  checkCard: { borderWidth: 1, borderRadius: 22, padding: 18, marginBottom: 12 },
  checkHeader: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginBottom: 8 },
  checkTitle: { flex: 1, fontSize: 17, fontWeight: "900" },
  checkBadge: { fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  checkBody: { fontSize: 14, lineHeight: 21, fontWeight: "700" },
  card: { borderWidth: 1, borderRadius: 22, padding: 18, marginTop: 4 },
  cardTitle: { fontSize: 18, fontWeight: "900", marginBottom: 10 },
  line: { fontSize: 13, lineHeight: 21, fontWeight: "700", marginBottom: 6 },
});
