import { useRouter } from "expo-router";
import { collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { AmbientBackground } from "@/components/ambient-background";
import { useAppTheme } from "@/constants/appTheme";
import { Colors } from "@/constants/theme";
import { auth, db } from "@/constants/firebaseConfig";
import { checkAiBackendHealth, type AiBackendHealth } from "@/utils/ai";
import { logProductionAnalyticsEvent } from "@/utils/analytics";

type Task = { id: string; completed?: boolean; status?: string; priority?: string; date?: string };
type Feedback = { id: string; type?: string; message?: string; createdAt?: any };
type ErrorRow = { id: string; message?: string; source?: string; createdAt?: any };
type AnalyticsRow = { id: string; eventName?: string; createdAt?: any };

export default function AdminTesterDashboardScreen() {
  const router = useRouter();
  const { themeName } = useAppTheme();
  const colors = Colors[themeName];
  const [tasks, setTasks] = useState<Task[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [events, setEvents] = useState<AnalyticsRow[]>([]);
  const [health, setHealth] = useState<AiBackendHealth | null>(null);

  useEffect(() => {
    void logProductionAnalyticsEvent("admin_dashboard_opened");
    void checkAiBackendHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const unsubscribers = [
      onSnapshot(collection(db, "users", uid, "tasks"), (snap) => setTasks(snap.docs.map((item) => ({ id: item.id, ...item.data() }) as Task)), () => setTasks([])),
      onSnapshot(query(collection(db, "users", uid, "feedback"), orderBy("createdAt", "desc"), limit(10)), (snap) => setFeedback(snap.docs.map((item) => ({ id: item.id, ...item.data() }) as Feedback)), () => setFeedback([])),
      onSnapshot(query(collection(db, "users", uid, "appErrors"), orderBy("createdAt", "desc"), limit(10)), (snap) => setErrors(snap.docs.map((item) => ({ id: item.id, ...item.data() }) as ErrorRow)), () => setErrors([])),
      onSnapshot(query(collection(db, "users", uid, "analyticsEvents"), orderBy("createdAt", "desc"), limit(10)), (snap) => setEvents(snap.docs.map((item) => ({ id: item.id, ...item.data() }) as AnalyticsRow)), () => setEvents([])),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  const stats = useMemo(() => {
    const completed = tasks.filter((task) => task.completed || task.status === "completed").length;
    const skipped = tasks.filter((task) => task.status === "skipped").length;
    const high = tasks.filter((task) => task.priority === "High").length;
    const completionRate = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;

    return { completed, skipped, high, completionRate };
  }, [tasks]);

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <AmbientBackground colors={colors} variant="focus" />
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
        <Text style={[styles.back, { color: colors.tint }]}>Back</Text>
      </TouchableOpacity>

      <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}> 
        <Text style={[styles.kicker, { color: colors.tint }]}>Admin Tester Dashboard</Text>
        <Text style={[styles.title, { color: colors.text }]}>Build health at a glance</Text>
        <Text style={[styles.body, { color: colors.subtle }]}>A recruiter-friendly control panel for the current tester account: tasks, feedback, diagnostics, analytics, and backend status.</Text>
      </View>

      <View style={styles.grid}>
        {[
          ["Tasks", tasks.length],
          ["Completion", `${stats.completionRate}%`],
          ["High Priority", stats.high],
          ["Skipped", stats.skipped],
          ["Feedback", feedback.length],
          ["Errors", errors.length],
          ["Events", events.length],
          ["AI", health?.ok ? "Online" : "Offline"],
        ].map(([label, value]) => (
          <View key={String(label)} style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Text style={[styles.tileValue, { color: colors.text }]}>{value}</Text>
            <Text style={[styles.tileLabel, { color: colors.subtle }]}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
        <Text style={[styles.cardTitle, { color: colors.text }]}>Tester Actions</Text>
        {[
          { label: "Crash Viewer", route: "/crash-viewer" },
          { label: "Privacy", route: "/privacy" },
          { label: "Gateway Analytics", route: "/admin-analytics" },
          { label: "Demo Mode", route: "/demo-mode" },
        ].map((item) => (
          <TouchableOpacity key={item.route} style={[styles.actionButton, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => router.push(item.route as never)} accessibilityRole="button" accessibilityLabel={`Open ${item.label}`}>
            <Text style={[styles.actionText, { color: colors.text }]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
        <Text style={[styles.cardTitle, { color: colors.text }]}>Recent Signals</Text>
        {[...feedback.map((item) => `${item.type ?? "Feedback"}: ${item.message ?? "No message"}`), ...errors.map((item) => `Error: ${item.message ?? item.source ?? "Unknown"}`), ...events.map((item) => `Event: ${item.eventName ?? "analytics"}`)].slice(0, 8).map((line, index) => (
          <Text key={`${line}-${index}`} style={[styles.line, { color: colors.subtle }]}>{line}</Text>
        ))}
        {!feedback.length && !errors.length && !events.length ? <Text style={[styles.line, { color: colors.subtle }]}>No tester signals yet. Seed Demo Mode or use the app for a few minutes.</Text> : null}
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
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5, marginBottom: 12 },
  tile: { width: "47%", borderWidth: 1, borderRadius: 18, padding: 14, margin: 5 },
  tileValue: { fontSize: 22, fontWeight: "900" },
  tileLabel: { fontSize: 11, fontWeight: "900", textTransform: "uppercase", marginTop: 4 },
  card: { borderWidth: 1, borderRadius: 22, padding: 18, marginBottom: 14 },
  cardTitle: { fontSize: 18, fontWeight: "900", marginBottom: 10 },
  actionButton: { borderWidth: 1, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 14, marginBottom: 8 },
  actionText: { fontSize: 14, fontWeight: "900" },
  line: { fontSize: 13, lineHeight: 21, fontWeight: "700", marginBottom: 6 },
});
