import { useRouter } from "expo-router";
import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { AmbientBackground } from "@/components/ambient-background";
import { useAppTheme } from "@/constants/appTheme";
import { Colors } from "@/constants/theme";
import { auth, db } from "@/constants/firebaseConfig";
import { useUserProfile } from "@/hooks/use-user-profile";
import { buildAiMemorySummary } from "@/utils/ai-memory";
import { getTimeBucket, parseTimeToMinutes, type TaskLike, type TimeBucket } from "@/utils/task-helpers";

const bucketLabels: Record<TimeBucket, string> = {
  early: "Early",
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

export default function AiMemoryTimelineScreen() {
  const router = useRouter();
  const { themeName } = useAppTheme();
  const { profile } = useUserProfile();
  const colors = Colors[themeName];
  const [tasks, setTasks] = useState<TaskLike[]>([]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    return onSnapshot(collection(db, "users", uid, "tasks"), (snap) => {
      setTasks(snap.docs.map((item) => item.data() as TaskLike));
    });
  }, []);

  const memory = useMemo(() => buildAiMemorySummary(tasks), [tasks]);
  const buckets = useMemo(() => {
    const stats: Record<TimeBucket, { total: number; completed: number; friction: number }> = {
      early: { total: 0, completed: 0, friction: 0 },
      morning: { total: 0, completed: 0, friction: 0 },
      afternoon: { total: 0, completed: 0, friction: 0 },
      evening: { total: 0, completed: 0, friction: 0 },
    };

    tasks.forEach((task) => {
      const bucket = getTimeBucket(parseTimeToMinutes(task.originalTime ?? task.time));
      stats[bucket].total += 1;
      if (task.completed) stats[bucket].completed += 1;
      if (task.status === "skipped" || (task.rescheduledCount ?? 0) > 0) stats[bucket].friction += 1;
    });

    return (Object.keys(stats) as TimeBucket[]).map((bucket) => ({ bucket, ...stats[bucket] }));
  }, [tasks]);

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <AmbientBackground colors={colors} variant="focus" />
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
        <Text style={[styles.back, { color: colors.tint }]}>Back</Text>
      </TouchableOpacity>

      <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}> 
        <Text style={[styles.kicker, { color: colors.tint }]}>AI Coach Memory</Text>
        <Text style={[styles.title, { color: colors.text }]}>What the coach is learning</Text>
        <Text style={[styles.body, { color: colors.subtle }]}>{memory ?? profile.aiMemory ?? "Complete a few more tasks and the app will start forming useful planning memory."}</Text>
      </View>

      {buckets.map((item) => {
        const rate = item.total ? Math.round((item.completed / item.total) * 100) : 0;
        return (
          <View key={item.bucket} style={[styles.bucketCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <View style={styles.bucketTop}>
              <Text style={[styles.bucketTitle, { color: colors.text }]}>{bucketLabels[item.bucket]}</Text>
              <Text style={[styles.bucketRate, { color: colors.tint }]}>{rate}%</Text>
            </View>
            <Text style={[styles.bucketMeta, { color: colors.subtle }]}>{item.completed}/{item.total} completed • {item.friction} friction signal{item.friction === 1 ? "" : "s"}</Text>
            <View style={[styles.track, { backgroundColor: colors.border }]}> 
              <View style={[styles.fill, { width: `${rate}%`, backgroundColor: colors.tint }]} />
            </View>
          </View>
        );
      })}
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
  bucketCard: { borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 12 },
  bucketTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bucketTitle: { fontSize: 18, fontWeight: "900" },
  bucketRate: { fontSize: 18, fontWeight: "900" },
  bucketMeta: { fontSize: 13, fontWeight: "700", marginTop: 6, marginBottom: 10 },
  track: { height: 9, borderRadius: 999, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 999 },
});
