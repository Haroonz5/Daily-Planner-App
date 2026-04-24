import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "@/constants/appTheme";
import { Colors } from "@/constants/theme";
import { auth, db } from "../../constants/firebaseConfig";

type Priority = "Low" | "Medium" | "High";
type TaskStatus = "pending" | "completed" | "skipped";

type Task = {
  id: string;
  title: string;
  time: string;
  date: string;
  completed: boolean;
  priority?: Priority;
  notes?: string;
  status?: TaskStatus;
  completedAt?: Date | string | null;
  skippedAt?: Date | string | null;
  lastActionAt?: Date | string | null;
  rescheduledCount?: number;
  originalTime?: string;
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

    const unsubscribe = onSnapshot(collection(db, "users", uid, "tasks"), (snap) => {
      const fetched = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Task[];

      setTasks(fetched);
    });

    return unsubscribe;
  }, []);

  const stats = useMemo(() => {
    const getTodayDate = () => new Date().toISOString().split("T")[0];

    const getLast7Days = () => {
      const days: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().split("T")[0]);
      }
      return days;
    };

    const todayDate = getTodayDate();
    const todayTasks = tasks.filter((task) => task.date === todayDate);
    const todayCompleted = todayTasks.filter((task) => task.completed).length;
    const todaySkipped = todayTasks.filter(
      (task) => (task.status ?? "pending") === "skipped"
    ).length;
    const todayPercent =
      todayTasks.length > 0
        ? Math.round((todayCompleted / todayTasks.length) * 100)
        : 0;

    const last7Days = getLast7Days();

    const weeklyStats = last7Days.map((date) => {
      const dayTasks = tasks.filter((task) => task.date === date);
      const completed = dayTasks.filter((task) => task.completed).length;
      const skipped = dayTasks.filter(
        (task) => (task.status ?? "pending") === "skipped"
      ).length;
      const percent =
        dayTasks.length > 0
          ? Math.round((completed / dayTasks.length) * 100)
          : 0;

      return {
        date,
        label: new Date(date).toLocaleDateString("en-US", { weekday: "short" }),
        total: dayTasks.length,
        completed,
        skipped,
        percent,
      };
    });

    const totalTasks = tasks.length;
    const totalCompleted = tasks.filter((task) => task.completed).length;
    const totalSkipped = tasks.filter(
      (task) => (task.status ?? "pending") === "skipped"
    ).length;
    const totalRescheduled = tasks.reduce(
      (sum, task) => sum + (task.rescheduledCount ?? 0),
      0
    );

    let streak = 0;
    for (let i = weeklyStats.length - 1; i >= 0; i--) {
      const day = weeklyStats[i];
      if (day.total === 0) break;
      const allDone = day.completed === day.total;
      if (allDone) streak++;
      else break;
    }

    const priorityCounts: Record<Priority, number> = {
      Low: tasks.filter((task) => (task.priority ?? "Medium") === "Low").length,
      Medium: tasks.filter((task) => (task.priority ?? "Medium") === "Medium").length,
      High: tasks.filter((task) => (task.priority ?? "Medium") === "High").length,
    };

    const mostSkippedTask = (() => {
      const counts = new Map<string, number>();

      tasks.forEach((task) => {
        if ((task.status ?? "pending") === "skipped") {
          counts.set(task.title, (counts.get(task.title) ?? 0) + 1);
        }
      });

      let topTitle = "None yet";
      let topCount = 0;

      counts.forEach((count, title) => {
        if (count > topCount) {
          topTitle = title;
          topCount = count;
        }
      });

      return {
        title: topTitle,
        count: topCount,
      };
    })();

    const bestDay = weeklyStats.reduce((best, day) => {
      if (!best) return day;
      return day.percent > best.percent ? day : best;
    }, weeklyStats[0]);

    const worstDay = weeklyStats.reduce((worst, day) => {
      if (!worst) return day;
      return day.percent < worst.percent ? day : worst;
    }, weeklyStats[0]);

    return {
      todayTasks,
      todayCompleted,
      todaySkipped,
      todayPercent,
      weeklyStats,
      totalTasks,
      totalCompleted,
      totalSkipped,
      totalRescheduled,
      streak,
      priorityCounts,
      mostSkippedTask,
      bestDay,
      worstDay,
    };
  }, [tasks]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.emoji}>📊</Text>
        <Text style={[styles.title, { color: colors.text }]}>Your Stats</Text>
        <Text style={[styles.subtitle, { color: colors.subtle }]}>
          See how your discipline is shaping up.
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.tint }]}>
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>Today's Progress</Text>
        <Text style={[styles.bigNumber, { color: colors.text }]}>
          {stats.todayPercent}%
        </Text>
        <Text style={[styles.cardSubtitle, { color: colors.subtle }]}>
          {stats.todayCompleted} completed, {stats.todaySkipped} skipped,{" "}
          {stats.todayTasks.length} total
        </Text>
        <View style={[styles.progressBarContainer, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${stats.todayPercent}%`,
                backgroundColor: colors.tint,
              },
            ]}
          />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.tint }]}>
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>Current Streak 🔥</Text>
        <Text style={[styles.bigNumber, { color: colors.text }]}>{stats.streak}</Text>
        <Text style={[styles.cardSubtitle, { color: colors.subtle }]}>
          {stats.streak === 0
            ? "Complete every task in a day to start a streak."
            : `${stats.streak} perfect day${stats.streak > 1 ? "s" : ""} in a row.`}
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.tint }]}>
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>This Week</Text>
        <View style={styles.barChart}>
          {stats.weeklyStats.map((day) => (
            <View key={day.date} style={styles.barColumn}>
              <Text style={[styles.barPercent, { color: colors.subtle }]}>
                {day.total > 0 ? `${day.percent}%` : ""}
              </Text>
              <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.barFill,
                    {
                      height: `${day.percent}%`,
                      backgroundColor: colors.tint,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.barLabel, { color: colors.subtle }]}>
                {day.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.tint }]}>
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>Weekly Insight</Text>
        <Text style={[styles.insightText, { color: colors.text }]}>
          Best day: {stats.bestDay?.label ?? "N/A"} ({stats.bestDay?.percent ?? 0}%)
        </Text>
        <Text style={[styles.insightText, { color: colors.text }]}>
          Toughest day: {stats.worstDay?.label ?? "N/A"} ({stats.worstDay?.percent ?? 0}%)
        </Text>
        <Text style={[styles.insightText, { color: colors.text }]}>
          Most skipped task: {stats.mostSkippedTask.title}
          {stats.mostSkippedTask.count > 0 ? ` (${stats.mostSkippedTask.count}x)` : ""}
        </Text>
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
                {stats.priorityCounts[priority]}
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
            <Text style={[styles.allTimeNumber, { color: colors.text }]}>
              {stats.totalTasks}
            </Text>
            <Text style={[styles.allTimeLabel, { color: colors.subtle }]}>
              Total
            </Text>
          </View>
          <View style={[styles.allTimeDivider, { backgroundColor: colors.border }]} />
          <View style={styles.allTimeStat}>
            <Text style={[styles.allTimeNumber, { color: colors.text }]}>
              {stats.totalCompleted}
            </Text>
            <Text style={[styles.allTimeLabel, { color: colors.subtle }]}>
              Completed
            </Text>
          </View>
          <View style={[styles.allTimeDivider, { backgroundColor: colors.border }]} />
          <View style={styles.allTimeStat}>
            <Text style={[styles.allTimeNumber, { color: colors.text }]}>
              {stats.totalSkipped}
            </Text>
            <Text style={[styles.allTimeLabel, { color: colors.subtle }]}>
              Skipped
            </Text>
          </View>
          <View style={[styles.allTimeDivider, { backgroundColor: colors.border }]} />
          <View style={styles.allTimeStat}>
            <Text style={[styles.allTimeNumber, { color: colors.text }]}>
              {stats.totalRescheduled}
            </Text>
            <Text style={[styles.allTimeLabel, { color: colors.subtle }]}>
              Rescheduled
            </Text>
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
  insightText: {
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 6,
  },
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
  allTimeNumber: { fontSize: 24, fontWeight: "700" },
  allTimeLabel: { fontSize: 12, marginTop: 4 },
});
