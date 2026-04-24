import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "@/constants/appTheme";
import { Colors } from "@/constants/theme";
import { auth, db } from "../../constants/firebaseConfig";

type Priority = "Low" | "Medium" | "High";

type Task = {
  id: string;
  title: string;
  time: string;
  date: string;
  completed: boolean;
  priority?: Priority;
  notes?: string;
};

const priorityColors: Record<Priority, string> = {
  Low: "#8dcf9f",
  Medium: "#f2b97f",
  High: "#e58ca8",
};

export default function StatsScreen() {
  const { themeName } = useAppTheme();
  const colors = Colors[themeName];
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const unsub = onSnapshot(collection(db, "users", uid, "tasks"), (snap) => {
      const fetched = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Task[];

      setTasks(fetched);
    });

    return unsub;
  }, []);

  const getTodayDate = () => new Date().toISOString().split("T")[0];

  const todayDate = getTodayDate();
  const todayTasks = tasks.filter((t) => t.date === todayDate);
  const todayCompleted = todayTasks.filter((t) => t.completed).length;
  const todayPercent =
    todayTasks.length > 0
      ? Math.round((todayCompleted / todayTasks.length) * 100)
      : 0;

  const getLast7Days = () => {
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split("T")[0]);
    }
    return days;
  };

  const last7Days = getLast7Days();

  const weeklyStats = last7Days.map((date) => {
    const dayTasks = tasks.filter((t) => t.date === date);
    const done = dayTasks.filter((t) => t.completed).length;
    const percent =
      dayTasks.length > 0 ? Math.round((done / dayTasks.length) * 100) : 0;
    const label = new Date(date).toLocaleDateString("en-US", {
      weekday: "short",
    });

    return { date, done, total: dayTasks.length, percent, label };
  });

  const totalCompleted = tasks.filter((t) => t.completed).length;
  const totalTasks = tasks.length;

  const calculateStreak = () => {
    let streak = 0;

    for (let i = 0; i < last7Days.length; i++) {
      const date = last7Days[last7Days.length - 1 - i];
      const dayTasks = tasks.filter((t) => t.date === date);

      if (dayTasks.length === 0) break;

      const allDone = dayTasks.every((t) => t.completed);
      if (allDone) streak++;
      else break;
    }

    return streak;
  };

  const streak = calculateStreak();

  const priorityCounts: Record<Priority, number> = {
    Low: tasks.filter((task) => (task.priority ?? "Medium") === "Low").length,
    Medium: tasks.filter((task) => (task.priority ?? "Medium") === "Medium").length,
    High: tasks.filter((task) => (task.priority ?? "Medium") === "High").length,
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.emoji}>📊</Text>
        <Text style={[styles.title, { color: colors.text }]}>Your Stats</Text>
        <Text style={[styles.subtitle, { color: colors.subtle }]}>
          Keep up the great work!
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.tint }]}>
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>Today's Progress</Text>
        <Text style={[styles.bigNumber, { color: colors.text }]}>{todayPercent}%</Text>
        <Text style={[styles.cardSubtitle, { color: colors.subtle }]}>
          {todayCompleted} of {todayTasks.length} tasks completed
        </Text>
        <View style={[styles.progressBarContainer, { backgroundColor: colors.border }]}>
          <View style={[styles.progressBarFill, { width: `${todayPercent}%`, backgroundColor: colors.tint }]} />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.tint }]}>
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>Current Streak 🔥</Text>
        <Text style={[styles.bigNumber, { color: colors.text }]}>{streak}</Text>
        <Text style={[styles.cardSubtitle, { color: colors.subtle }]}>
          {streak === 0
            ? "Complete all tasks today to start a streak!"
            : `${streak} day${streak > 1 ? "s" : ""} in a row!`}
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.tint }]}>
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>This Week</Text>
        <View style={styles.barChart}>
          {weeklyStats.map((day) => (
            <View key={day.date} style={styles.barColumn}>
              <Text style={[styles.barPercent, { color: colors.subtle }]}>
                {day.total > 0 ? `${day.percent}%` : ""}
              </Text>
              <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.barFill,
                    { height: `${day.percent}%`, backgroundColor: colors.tint },
                    day.percent === 100 && { backgroundColor: colors.icon },
                  ]}
                />
              </View>
              <Text style={[styles.barLabel, { color: colors.subtle }]}>{day.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.tint }]}>
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>Task Mix</Text>
        <View style={styles.priorityStatsRow}>
          {(["Low", "Medium", "High"] as Priority[]).map((priority) => (
            <View
              key={priority}
              style={[styles.priorityStat, { backgroundColor: colors.surface }]}
            >
              <View
                style={[
                  styles.priorityStatDot,
                  { backgroundColor: priorityColors[priority] },
                ]}
              />
              <Text style={[styles.priorityStatCount, { color: colors.text }]}>
                {priorityCounts[priority]}
              </Text>
              <Text style={[styles.priorityStatLabel, { color: colors.subtle }]}>
                {priority}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.tint }]}>
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>All Time</Text>
        <View style={styles.allTimeRow}>
          <View style={styles.allTimeStat}>
            <Text style={[styles.allTimeNumber, { color: colors.text }]}>{totalTasks}</Text>
            <Text style={[styles.allTimeLabel, { color: colors.subtle }]}>Total Tasks</Text>
          </View>
          <View style={[styles.allTimeDivider, { backgroundColor: colors.border }]} />
          <View style={styles.allTimeStat}>
            <Text style={[styles.allTimeNumber, { color: colors.text }]}>{totalCompleted}</Text>
            <Text style={[styles.allTimeLabel, { color: colors.subtle }]}>Completed</Text>
          </View>
          <View style={[styles.allTimeDivider, { backgroundColor: colors.border }]} />
          <View style={styles.allTimeStat}>
            <Text style={[styles.allTimeNumber, { color: colors.text }]}>
              {totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0}%
            </Text>
            <Text style={[styles.allTimeLabel, { color: colors.subtle }]}>Success Rate</Text>
          </View>
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: "center", paddingTop: 60, paddingBottom: 24 },
  emoji: { fontSize: 48, marginBottom: 12 },
  title: { fontSize: 32, fontWeight: "700" },
  subtitle: { fontSize: 14, marginTop: 6 },
  card: {
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  bigNumber: { fontSize: 52, fontWeight: "700" },
  cardSubtitle: { fontSize: 14, marginTop: 4, marginBottom: 12 },
  progressBarContainer: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: { height: 8, borderRadius: 4 },
  barChart: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    height: 120,
    marginTop: 8,
  },
  barColumn: { alignItems: "center", flex: 1 },
  barPercent: { fontSize: 10, marginBottom: 4 },
  barTrack: {
    width: 24,
    height: 80,
    borderRadius: 12,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  barFill: { width: "100%", borderRadius: 12 },
  barLabel: { fontSize: 11, marginTop: 6 },
  priorityStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  priorityStat: {
    flex: 1,
    alignItems: "center",
    borderRadius: 16,
    paddingVertical: 16,
    marginHorizontal: 4,
  },
  priorityStatDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: 10,
  },
  priorityStatCount: {
    fontSize: 26,
    fontWeight: "700",
  },
  priorityStatLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  allTimeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  allTimeStat: { flex: 1, alignItems: "center" },
  allTimeDivider: { width: 1, height: 40 },
  allTimeNumber: { fontSize: 28, fontWeight: "700" },
  allTimeLabel: { fontSize: 12, marginTop: 4 },
});
