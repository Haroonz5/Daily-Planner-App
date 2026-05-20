import { useRouter } from "expo-router";
import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { AmbientBackground } from "@/components/ambient-background";
import { useAppTheme } from "@/constants/appTheme";
import { Colors } from "@/constants/theme";
import { auth, db } from "@/constants/firebaseConfig";
import { playShareFeedback } from "@/utils/feedback";
import { buildWeeklyReport, formatWeeklyReportForShare, type WeeklyReportTask } from "@/utils/weekly-report";
import { useUserProfile } from "@/hooks/use-user-profile";

export default function WeeklyReportScreen() {
  const router = useRouter();
  const { themeName } = useAppTheme();
  const { profile } = useUserProfile();
  const colors = Colors[themeName];
  const [tasks, setTasks] = useState<WeeklyReportTask[]>([]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    return onSnapshot(collection(db, "users", uid, "tasks"), (snap) => {
      setTasks(snap.docs.map((item) => ({ id: item.id, ...item.data() }) as WeeklyReportTask));
    });
  }, []);

  const report = useMemo(() => buildWeeklyReport(tasks), [tasks]);

  const shareReport = async () => {
    await Share.share({ message: formatWeeklyReportForShare(report) });
    await playShareFeedback(profile);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <AmbientBackground colors={colors} variant="focus" />
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
        <Text style={[styles.back, { color: colors.tint }]}>Back</Text>
      </TouchableOpacity>

      <View style={[styles.reportCard, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.tint }]}> 
        <Text style={[styles.kicker, { color: colors.tint }]}>Weekly Report</Text>
        <Text style={[styles.title, { color: colors.text }]}>{report.headline}</Text>
        <Text style={[styles.range, { color: colors.subtle }]}>{report.startKey} to {report.endKey}</Text>

        <View style={styles.scoreRow}>
          <View style={[styles.scoreTile, { backgroundColor: colors.surface }]}> 
            <Text style={[styles.scoreValue, { color: colors.text }]}>{report.completionRate}%</Text>
            <Text style={[styles.scoreLabel, { color: colors.subtle }]}>Completion</Text>
          </View>
          <View style={[styles.scoreTile, { backgroundColor: colors.surface }]}> 
            <Text style={[styles.scoreValue, { color: colors.text }]}>{report.cleanDays}</Text>
            <Text style={[styles.scoreLabel, { color: colors.subtle }]}>Clean Days</Text>
          </View>
        </View>

        <View style={[styles.statPanel, { borderColor: colors.border }]}> 
          <Text style={[styles.statLine, { color: colors.text }]}>{report.completed}/{report.total} total tasks complete</Text>
          <Text style={[styles.statLine, { color: colors.text }]}>{report.highPriorityCompleted}/{report.highPriorityTotal} high-priority tasks cleared</Text>
          <Text style={[styles.statLine, { color: colors.text }]}>{report.skipped} skipped task{report.skipped === 1 ? "" : "s"}</Text>
        </View>

        <Text style={[styles.coach, { color: colors.subtle }]}>{report.coachingLine}</Text>
      </View>

      <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.tint }]} onPress={shareReport} accessibilityRole="button" accessibilityLabel="Share weekly discipline report">
        <Text style={styles.primaryText}>Share Report</Text>
      </TouchableOpacity>
      <Text style={[styles.hint, { color: colors.subtle }]}>This card is image-ready for screenshots now, and the share button exports the same report as text without adding heavy native PDF dependencies.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 62, paddingBottom: 140 },
  back: { fontSize: 15, fontWeight: "900", marginBottom: 18 },
  reportCard: { borderWidth: 1, borderRadius: 30, padding: 24, marginBottom: 18, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 6 },
  kicker: { fontSize: 12, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 },
  title: { fontSize: 31, fontWeight: "900", lineHeight: 36 },
  range: { fontSize: 13, fontWeight: "800", marginTop: 8, marginBottom: 18 },
  scoreRow: { flexDirection: "row", marginHorizontal: -5, marginBottom: 14 },
  scoreTile: { flex: 1, borderRadius: 20, padding: 16, marginHorizontal: 5 },
  scoreValue: { fontSize: 30, fontWeight: "900" },
  scoreLabel: { fontSize: 11, fontWeight: "900", textTransform: "uppercase", marginTop: 4 },
  statPanel: { borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 16 },
  statLine: { fontSize: 14, fontWeight: "800", lineHeight: 23 },
  coach: { fontSize: 15, lineHeight: 22, fontWeight: "700" },
  primaryButton: { borderRadius: 18, paddingVertical: 16, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  hint: { fontSize: 12, lineHeight: 18, marginTop: 12, textAlign: "center" },
});
