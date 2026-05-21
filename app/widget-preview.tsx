import { useRouter } from "expo-router";
import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { AmbientBackground } from "@/components/ambient-background";
import { useAppTheme } from "@/constants/appTheme";
import { Colors } from "@/constants/theme";
import { useUserProfile } from "@/hooks/use-user-profile";
import { auth, db } from "@/constants/firebaseConfig";
import {
  buildWidgetSummary,
  getCachedWidgetSummary,
  type WidgetSummary,
  type WidgetSummaryTask,
} from "@/utils/widget-summary";

export default function WidgetPreviewScreen() {
  const router = useRouter();
  const { themeName } = useAppTheme();
  const { profile } = useUserProfile();
  const colors = Colors[themeName];
  const [tasks, setTasks] = useState<WidgetSummaryTask[]>([]);
  const [cachedSummary, setCachedSummary] = useState<WidgetSummary | null>(null);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    void getCachedWidgetSummary(uid).then(setCachedSummary).catch(() => {});

    return onSnapshot(
      collection(db, "users", uid, "tasks"),
      (snapshot) => {
        setTasks(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })) as WidgetSummaryTask[]
        );
      },
      () => setTasks([])
    );
  }, []);

  const summary = useMemo(
    () =>
      buildWidgetSummary({
        tasks,
        petName: profile.petNickname || profile.displayName || "Companion",
        readinessLabel: profile.weeklyFocusGoal ? "Goal set" : "Set a weekly goal",
        readinessScore: profile.weeklyFocusGoal ? 88 : 62,
        energyMode: profile.energyMode ?? undefined,
        themeName,
      }),
    [profile.displayName, profile.energyMode, profile.petNickname, profile.weeklyFocusGoal, tasks, themeName]
  );

  const lastUpdated = cachedSummary?.updatedAtIso
    ? new Date(cachedSummary.updatedAtIso).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "waiting for Today screen sync";

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <AmbientBackground colors={colors} variant="signal" />
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
        <Text style={[styles.back, { color: colors.tint }]}>Back</Text>
      </TouchableOpacity>

      <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}> 
        <Text style={[styles.kicker, { color: colors.tint }]}>Widget Preview</Text>
        <Text style={[styles.title, { color: colors.text }]}>Home-screen ready snapshot</Text>
        <Text style={[styles.body, { color: colors.subtle }]}>This mirrors the data the app writes for a future iOS/Android widget: today progress, next task, companion, and lock-screen copy.</Text>
      </View>

      <View style={[styles.lockCard, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.tint }]}> 
        <Text style={[styles.widgetLabel, { color: colors.subtle }]}>Lock Screen</Text>
        <Text style={[styles.lockLine, { color: colors.text }]}>{summary.lockScreenLine}</Text>
        <Text style={[styles.nextLine, { color: colors.subtle }]}>{summary.smallWidgetLine}</Text>
      </View>

      <View style={[styles.largeWidget, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.tint }]}> 
        <View style={styles.widgetHeader}>
          <Text style={[styles.widgetLabel, { color: colors.subtle }]}>Daily Discipline</Text>
          <Text style={[styles.percent, { color: colors.tint }]}>{summary.progressPercent}%</Text>
        </View>
        <Text style={[styles.nextTitle, { color: colors.text }]}>{summary.nextTaskTitle}</Text>
        <Text style={[styles.nextLine, { color: colors.subtle }]}>{summary.nextTaskLabel}</Text>
        <View style={styles.lineStack}>
          {summary.largeWidgetLines.map((line) => (
            <Text key={line} style={[styles.widgetLine, { color: colors.text }]}>{line}</Text>
          ))}
        </View>
      </View>

      <View style={[styles.metaCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
        <Text style={[styles.metaTitle, { color: colors.text }]}>Implementation note</Text>
        <Text style={[styles.metaBody, { color: colors.subtle }]}>Today writes this summary to Firestore and local storage. A production native widget can read the same compact payload through an App Group/native bridge without querying every task.</Text>
        <Text style={[styles.metaBody, { color: colors.subtle }]}>Last cached: {lastUpdated}</Text>
      </View>
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
  lockCard: { borderWidth: 1, borderRadius: 30, padding: 20, marginBottom: 14, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 18, elevation: 4 },
  largeWidget: { borderWidth: 1, borderRadius: 34, padding: 22, marginBottom: 14, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 5 },
  widgetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  widgetLabel: { fontSize: 11, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" },
  percent: { fontSize: 22, fontWeight: "900" },
  lockLine: { fontSize: 24, fontWeight: "900", marginTop: 10, marginBottom: 6 },
  nextTitle: { fontSize: 28, fontWeight: "900", lineHeight: 32, marginBottom: 8 },
  nextLine: { fontSize: 14, fontWeight: "800", lineHeight: 21 },
  lineStack: { marginTop: 16 },
  widgetLine: { fontSize: 14, fontWeight: "800", lineHeight: 23 },
  metaCard: { borderWidth: 1, borderRadius: 22, padding: 18 },
  metaTitle: { fontSize: 17, fontWeight: "900", marginBottom: 8 },
  metaBody: { fontSize: 13, lineHeight: 20, fontWeight: "700", marginBottom: 8 },
});
