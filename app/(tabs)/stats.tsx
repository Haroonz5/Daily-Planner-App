import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "@/constants/appTheme";
import { Colors } from "@/constants/theme";
import { auth, db } from "../../constants/firebaseConfig";

type Priority = "Low" | "Medium" | "High";
type TaskStatus = "pending" | "completed" | "skipped";
type TimeBucket = "early" | "morning" | "afternoon" | "evening";

type Task = {
  id: string;
  title: string;
  time: string;
  date: string;
  completed: boolean;
  priority?: Priority;
  notes?: string;
  status?: TaskStatus;
  completedAt?: any;
  skippedAt?: any;
  lastActionAt?: any;
  rescheduledCount?: number;
  originalTime?: string;
};

const priorityColors: Record<Priority, string> = {
  Low: "#8dcf9f",
  Medium: "#f2b97f",
  High: "#e58ca8",
};

const bucketLabels: Record<TimeBucket, string> = {
  early: "Early Morning",
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

const parseTimeToMinutes = (time: string) => {
  const parts = time.split(" ");
  if (parts.length !== 2) return null;

  const [timePart, period] = parts;
  const [hoursStr, minutesStr] = timePart.split(":");
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

  let normalizedHours = hours;
  if (period === "PM" && hours !== 12) normalizedHours += 12;
  if (period === "AM" && hours === 12) normalizedHours = 0;

  return normalizedHours * 60 + minutes;
};

const getBucketFromMinutes = (minutes: number | null): TimeBucket => {
  if (minutes === null) return "morning";
  if (minutes < 9 * 60) return "early";
  if (minutes < 12 * 60) return "morning";
  if (minutes < 17 * 60) return "afternoon";
  return "evening";
};

const toDateSafe = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const scheduledDateTime = (date: string, time: string) => {
  const [year, month, day] = date.split("-").map(Number);
  const minutes = parseTimeToMinutes(time);
  if (!year || !month || !day || minutes === null) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return new Date(year, month - 1, day, hours, mins, 0, 0);
};

export default function StatsScreen() {
  const { themeName } = useAppTheme();
  const colors = Colors[themeName];
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const unsubscribe = onSnapshot(collection(db, "users", uid, "tasks"), (snap) => {
      const fetched = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Task[];

      setTasks(fetched);
    });

    return unsubscribe;
  }, []);

  const stats = useMemo(() => {
    const todayDate = new Date().toISOString().split("T")[0];

    const getLast7Days = () => {
      const days: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().split("T")[0]);
      }
      return days;
    };

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

    let streak = 0;
    for (let i = weeklyStats.length - 1; i >= 0; i--) {
      const day = weeklyStats[i];
      if (day.total === 0) break;
      if (day.completed === day.total) streak += 1;
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

      let title = "None yet";
      let count = 0;

      counts.forEach((value, key) => {
        if (value > count) {
          title = key;
          count = value;
        }
      });

      return { title, count };
    })();

    const productiveWindowCounts: Record<TimeBucket, number> = {
      early: 0,
      morning: 0,
      afternoon: 0,
      evening: 0,
    };

    tasks.forEach((task) => {
      if (!task.completed) return;
      const completedAt = toDateSafe(task.completedAt);
      if (!completedAt) return;
      const bucket = getBucketFromMinutes(
        completedAt.getHours() * 60 + completedAt.getMinutes()
      );
      productiveWindowCounts[bucket] += 1;
    });

    const mostProductiveWindow = (Object.keys(productiveWindowCounts) as TimeBucket[]).reduce(
      (best, bucket) =>
        productiveWindowCounts[bucket] > productiveWindowCounts[best] ? bucket : best,
      "morning"
    );

    const frictionCounts: Record<TimeBucket, number> = {
      early: 0,
      morning: 0,
      afternoon: 0,
      evening: 0,
    };

    tasks.forEach((task) => {
      const sourceTime = task.originalTime ?? task.time;
      const bucket = getBucketFromMinutes(parseTimeToMinutes(sourceTime));
      if ((task.status ?? "pending") === "skipped" || (task.rescheduledCount ?? 0) > 0) {
        frictionCounts[bucket] += 1;
      }
    });

    const riskWindow = (Object.keys(frictionCounts) as TimeBucket[]).reduce(
      (worst, bucket) => (frictionCounts[bucket] > frictionCounts[worst] ? bucket : worst),
      "morning"
    );

    const delays = tasks
      .filter((task) => task.completed)
      .map((task) => {
        const completedAt = toDateSafe(task.completedAt);
        const scheduledAt = scheduledDateTime(task.date, task.originalTime ?? task.time);
        if (!completedAt || !scheduledAt) return null;
        return Math.round((completedAt.getTime() - scheduledAt.getTime()) / 60000);
      })
      .filter((value): value is number => value !== null);

    const averageDelay =
      delays.length > 0
        ? Math.round(
            delays.reduce((sum, value) => sum + Math.max(value, 0), 0) / delays.length
          )
        : 0;

    const onTimeRate =
      delays.length > 0
        ? Math.round(
            (delays.filter((delay) => delay <= 15).length / delays.length) * 100
          )
        : 0;

    const totalTasks = tasks.length;
    const totalCompleted = tasks.filter((task) => task.completed).length;
    const totalSkipped = tasks.filter(
      (task) => (task.status ?? "pending") === "skipped"
    ).length;
    const totalRescheduled = tasks.reduce(
      (sum, task) => sum + (task.rescheduledCount ?? 0),
      0
    );

    const bestDay =
      weeklyStats.reduce((best, day) => (day.percent > best.percent ? day : best), weeklyStats[0]) ??
      null;

    const toughestDay =
      weeklyStats.reduce((worst, day) => (day.percent < worst.percent ? day : worst), weeklyStats[0]) ??
      null;

    let recommendation = "Your consistency data is starting to take shape.";

    if (mostSkippedTask.count >= 2) {
      recommendation = `"${mostSkippedTask.title}" keeps getting skipped. Simplify it or move it out of your weakest window.`;
    } else if (riskWindow !== mostProductiveWindow) {
      recommendation = `You seem strongest in the ${bucketLabels[mostProductiveWindow].toLowerCase()} but struggle more in the ${bucketLabels[riskWindow].toLowerCase()}. Move important tasks accordingly.`;
    } else if (averageDelay > 30) {
      recommendation = `You finish about ${averageDelay} minutes late on average. Try giving yourself more space between planned tasks.`;
    }

    return {
      todayTasks,
      todayCompleted,
      todaySkipped,
      todayPercent,
      weeklyStats,
      streak,
      priorityCounts,
      mostSkippedTask,
      mostProductiveWindow,
      riskWindow,
      averageDelay,
      onTimeRate,
      totalTasks,
      totalCompleted,
      totalSkipped,
      totalRescheduled,
      bestDay,
      toughestDay,
      recommendation,
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
          {stats.todayCompleted} completed, {stats.todaySkipped} skipped, {stats.todayTasks.length} total
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
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>Smart Weekly Report</Text>
        <Text style={[styles.insightText, { color: colors.text }]}>
          Best day: {stats.bestDay?.label ?? "N/A"} ({stats.bestDay?.percent ?? 0}%)
        </Text>
        <Text style={[styles.insightText, { color: colors.text }]}>
          Toughest day: {stats.toughestDay?.label ?? "N/A"} ({stats.toughestDay?.percent ?? 0}%)
        </Text>
        <Text style={[styles.insightText, { color: colors.text }]}>
          Most productive time: {bucketLabels[stats.mostProductiveWindow]}
        </Text>
        <Text style={[styles.insightText, { color: colors.text }]}>
          Highest-friction window: {bucketLabels[stats.riskWindow]}
        </Text>
        <Text style={[styles.insightText, { color: colors.text }]}>
          Most skipped task: {stats.mostSkippedTask.title}
          {stats.mostSkippedTask.count > 0 ? ` (${stats.mostSkippedTask.count}x)` : ""}
        </Text>
        <Text style={[styles.recommendationText, { color: colors.subtle }]}>
          {stats.recommendation}
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
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>Plan vs Reality</Text>
        <View style={styles.planRealityRow}>
          <View style={[styles.planRealityStat, { backgroundColor: colors.surface }]}>
            <Text style={[styles.planRealityNumber, { color: colors.text }]}>
              {stats.onTimeRate}%
            </Text>
            <Text style={[styles.planRealityLabel, { color: colors.subtle }]}>
              On Time
            </Text>
          </View>
          <View style={[styles.planRealityStat, { backgroundColor: colors.surface }]}>
            <Text style={[styles.planRealityNumber, { color: colors.text }]}>
              {stats.averageDelay}m
            </Text>
            <Text style={[styles.planRealityLabel, { color: colors.subtle }]}>
              Avg Delay
            </Text>
          </View>
          <View style={[styles.planRealityStat, { backgroundColor: colors.surface }]}>
            <Text style={[styles.planRealityNumber, { color: colors.text }]}>
              {stats.totalRescheduled}
            </Text>
            <Text style={[styles.planRealityLabel, { color: colors.subtle }]}>
              Rescheduled
            </Text>
          </View>
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
            <Text style={[styles.allTimeLabel, { color: colors.subtle }]}>Total</Text>
          </View>
          <View style={[styles.allTimeDivider, { backgroundColor: colors.border }]} />
          <View style={styles.allTimeStat}>
            <Text style={[styles.allTimeNumber, { color: colors.text }]}>
              {stats.totalCompleted}
            </Text>
            <Text style={[styles.allTimeLabel, { color: colors.subtle }]}>Completed</Text>
          </View>
          <View style={[styles.allTimeDivider, { backgroundColor: colors.border }]} />
          <View style={styles.allTimeStat}>
            <Text style={[styles.allTimeNumber, { color: colors.text }]}>
              {stats.totalSkipped}
            </Text>
            <Text style={[styles.allTimeLabel, { color: colors.subtle }]}>Skipped</Text>
          </View>
          <View style={[styles.allTimeDivider, { backgroundColor: colors.border }]} />
          <View style={styles.allTimeStat}>
            <Text style={[styles.allTimeNumber, { color: colors.text }]}>
              {stats.totalRescheduled}
            </Text>
            <Text style={[styles.allTimeLabel, { color: colors.subtle }]}>Moved</Text>
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
    lineHeight: 23,
    marginBottom: 6,
  },
  recommendationText: {
    fontSize: 14,
    lineHeight: 22,
    marginTop: 10,
  },
  planRealityRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  planRealityStat: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 18,
    marginHorizontal: 4,
    alignItems: "center",
  },
  planRealityNumber: {
    fontSize: 24,
    fontWeight: "700",
  },
  planRealityLabel: {
    fontSize: 12,
    marginTop: 6,
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
