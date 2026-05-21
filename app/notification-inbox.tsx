import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { AmbientBackground } from "@/components/ambient-background";
import { useAppTheme } from "@/constants/appTheme";
import { Colors } from "@/constants/theme";
import { auth, db } from "@/constants/firebaseConfig";
import { playSaveFeedback, playWarningFeedback } from "@/utils/feedback";
import {
  getScheduledNotificationAudit,
  type ScheduledNotificationAudit,
} from "@/utils/notifications";

type PushReceiptRow = {
  id: string;
  type?: string;
  status?: string;
  reason?: string | null;
  receiptStatus?: string | null;
  receiptReason?: string | null;
  createdAt?: any;
};

type AccountabilityNudge = {
  id: string;
  fromUsername?: string | null;
  fromName?: string | null;
  message?: string;
  seen?: boolean;
  createdAt?: any;
};

type InboxItem = {
  id: string;
  tone: "info" | "success" | "warning";
  title: string;
  body: string;
  meta: string;
};

const toDate = (value: any) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate() as Date;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatRelativeTime = (value: any) => {
  const date = toDate(value);
  if (!date) return "recently";

  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffMinutes < 24 * 60) return `${Math.round(diffMinutes / 60)}h ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
};

const getReceiptTone = (receipt: PushReceiptRow): InboxItem["tone"] => {
  if (receipt.receiptStatus === "delivered" || receipt.status === "sent") {
    return "success";
  }

  if (receipt.receiptStatus === "failed" || receipt.status === "failed") {
    return "warning";
  }

  return "info";
};

export default function NotificationInboxScreen() {
  const router = useRouter();
  const { themeName } = useAppTheme();
  const colors = Colors[themeName];
  const [busy, setBusy] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState("unknown");
  const [audit, setAudit] = useState<ScheduledNotificationAudit | null>(null);
  const [pushReceipts, setPushReceipts] = useState<PushReceiptRow[]>([]);
  const [nudges, setNudges] = useState<AccountabilityNudge[]>([]);

  const refreshInbox = async () => {
    const uid = auth.currentUser?.uid;
    setBusy(true);

    try {
      const [permission, nextAudit] = await Promise.all([
        Notifications.getPermissionsAsync().catch(() => null),
        getScheduledNotificationAudit().catch(() => null),
      ]);

      setPermissionStatus(
        permission?.granted ? "granted" : permission?.status ?? "unknown"
      );
      setAudit(nextAudit);

      if (uid) {
        const [receiptSnapshot, nudgeSnapshot] = await Promise.all([
          getDocs(
            query(
              collection(db, "users", uid, "pushReceipts"),
              orderBy("createdAt", "desc"),
              limit(12)
            )
          ).catch(() => null),
          getDocs(
            query(
              collection(db, "accountabilityNudges"),
              where("toUid", "==", uid),
              limit(12)
            )
          ).catch(() => null),
        ]);

        setPushReceipts(
          receiptSnapshot?.docs.map(
            (item) => ({ id: item.id, ...item.data() }) as PushReceiptRow
          ) ?? []
        );
        setNudges(
          nudgeSnapshot?.docs.map(
            (item) => ({ id: item.id, ...item.data() }) as AccountabilityNudge
          ) ?? []
        );
      }

      await playSaveFeedback({});
    } catch {
      await playWarningFeedback({});
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refreshInbox();
  }, []);

  const inboxItems = useMemo(() => {
    const localItems: InboxItem[] =
      audit?.nextNotifications.map((item, index) => ({
        id: `local-${item.id}-${index}`,
        tone: "info",
        title: item.title,
        body: item.taskId
          ? "Scheduled task reminder is waiting on the device."
          : "Scheduled habit reminder is waiting on the device.",
        meta: item.kind,
      })) ?? [];

    const receiptItems: InboxItem[] = pushReceipts.map((receipt) => ({
      id: `receipt-${receipt.id}`,
      tone: getReceiptTone(receipt),
      title: `${receipt.type ?? "Push"} ${receipt.receiptStatus ?? receipt.status ?? "pending"}`,
      body:
        receipt.receiptReason ??
        receipt.reason ??
        "Server push pipeline recorded this notification.",
      meta: formatRelativeTime(receipt.createdAt),
    }));

    const nudgeItems: InboxItem[] = nudges
      .slice()
      .sort(
        (a, b) =>
          (toDate(b.createdAt)?.getTime() ?? 0) -
          (toDate(a.createdAt)?.getTime() ?? 0)
      )
      .map((nudge) => ({
        id: `nudge-${nudge.id}`,
        tone: nudge.seen ? "info" : "success",
        title: `Accountability from ${
          nudge.fromUsername ?? nudge.fromName ?? "a friend"
        }`,
        body: nudge.message ?? "A friend checked in on your plan.",
        meta: nudge.seen ? "Seen" : `New · ${formatRelativeTime(nudge.createdAt)}`,
      }));

    return [...nudgeItems, ...receiptItems, ...localItems].slice(0, 24);
  }, [audit, nudges, pushReceipts]);

  const unreadNudges = nudges.filter((nudge) => !nudge.seen).length;
  const failedPushes = pushReceipts.filter(
    (receipt) => receipt.receiptStatus === "failed" || receipt.status === "failed"
  ).length;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <AmbientBackground colors={colors} variant="signal" />

      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button">
        <Text style={[styles.back, { color: colors.tint }]}>Back</Text>
      </TouchableOpacity>

      <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.kicker, { color: colors.tint }]}>Notification Inbox</Text>
        <Text style={[styles.title, { color: colors.text }]}>
          Reminders, nudges, and push health in one place.
        </Text>
        <Text style={[styles.body, { color: colors.subtle }]}>
          A compact signal feed for what the app scheduled locally, what friends sent,
          and whether server push is behaving.
        </Text>
      </View>

      <View style={styles.metricRow}>
        {[
          { label: "Permission", value: permissionStatus },
          { label: "Scheduled", value: String(audit?.total ?? 0) },
          { label: "Unread", value: String(unreadNudges) },
          { label: "Push issues", value: String(failedPushes) },
        ].map((metric) => (
          <View
            key={metric.label}
            style={[
              styles.metricCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.metricValue, { color: colors.text }]}>
              {metric.value}
            </Text>
            <Text style={[styles.metricLabel, { color: colors.subtle }]}>
              {metric.label}
            </Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.refreshButton, { backgroundColor: colors.tint }]}
        onPress={refreshInbox}
        disabled={busy}
      >
        <Text style={styles.refreshText}>{busy ? "Refreshing..." : "Refresh Inbox"}</Text>
      </TouchableOpacity>

      {audit && audit.duplicateCount > 0 ? (
        <View
          style={[
            styles.noticeCard,
            { backgroundColor: colors.card, borderColor: colors.warning },
          ]}
        >
          <Text style={[styles.noticeTitle, { color: colors.warning }]}>
            Duplicate reminders detected
          </Text>
          <Text style={[styles.noticeBody, { color: colors.subtle }]}>
            Settings can clean these up if reminders ever feel noisy.
          </Text>
        </View>
      ) : null}

      {inboxItems.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No signals yet</Text>
          <Text style={[styles.emptyBody, { color: colors.subtle }]}>
            Schedule a task, send a friend nudge, or run a push test to populate this inbox.
          </Text>
        </View>
      ) : (
        inboxItems.map((item) => {
          const toneColor =
            item.tone === "success"
              ? colors.success
              : item.tone === "warning"
                ? colors.warning
                : colors.tint;

          return (
            <View
              key={item.id}
              style={[
                styles.itemCard,
                { backgroundColor: colors.card, borderColor: toneColor },
              ]}
            >
              <View style={styles.itemHeader}>
                <Text style={[styles.itemTitle, { color: colors.text }]}>
                  {item.title}
                </Text>
                <Text style={[styles.itemMeta, { color: toneColor }]}>
                  {item.meta}
                </Text>
              </View>
              <Text style={[styles.itemBody, { color: colors.subtle }]}>
                {item.body}
              </Text>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 62, paddingBottom: 140 },
  back: { fontSize: 15, fontWeight: "900", marginBottom: 16 },
  hero: { borderWidth: 1, borderRadius: 26, padding: 20, marginBottom: 14 },
  kicker: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  title: { fontSize: 27, fontWeight: "900", lineHeight: 32, marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 21 },
  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  metricCard: {
    width: "48%",
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    marginBottom: 10,
  },
  metricValue: { fontSize: 22, fontWeight: "900", marginBottom: 3 },
  metricLabel: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  refreshButton: {
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: "center",
    marginBottom: 12,
  },
  refreshText: { color: "#fff", fontSize: 15, fontWeight: "900" },
  noticeCard: { borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 12 },
  noticeTitle: { fontSize: 15, fontWeight: "900", marginBottom: 5 },
  noticeBody: { fontSize: 13, lineHeight: 19, fontWeight: "700" },
  emptyCard: { borderWidth: 1, borderRadius: 22, padding: 18 },
  emptyTitle: { fontSize: 18, fontWeight: "900", marginBottom: 6 },
  emptyBody: { fontSize: 14, lineHeight: 21, fontWeight: "700" },
  itemCard: { borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 10 },
  itemHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 7,
  },
  itemTitle: { flex: 1, fontSize: 16, fontWeight: "900" },
  itemMeta: { fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  itemBody: { fontSize: 13, lineHeight: 20, fontWeight: "700" },
});
