import { useRouter } from "expo-router";
import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useAppTheme } from "@/constants/appTheme";
import {
  getActivePet,
  getPetProgress,
  getTaskXp,
  type Priority,
} from "@/constants/rewards";
import { Colors } from "@/constants/theme";
import { useUserProfile } from "@/hooks/use-user-profile";
import { auth, db } from "../constants/firebaseConfig";

type TaskStatus = "pending" | "completed" | "skipped";

type Task = {
  id: string;
  title: string;
  completed: boolean;
  date: string;
  time?: string;
  priority?: Priority;
  notes?: string;
  status?: TaskStatus;
  completedAt?: any;
  rescheduledCount?: number;
  originalTime?: string;
};

const priorityColors: Record<Priority, string> = {
  Low: "#8dcf9f",
  Medium: "#f2b97f",
  High: "#e58ca8",
};

export default function SummaryScreen() {
  const router = useRouter();
  const { themeName } = useAppTheme();
  const { profile } = useUserProfile();
  const colors = Colors[themeName];
  const [tasks, setTasks] = useState<Task[]>([]);

  const getTodayDate = () => new Date().toISOString().split("T")[0];

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

  const summary = useMemo(() => {
    const todayTasks = tasks.filter((task) => task.date === getTodayDate());
    const completed = todayTasks.filter((task) => task.completed).length;
    const skipped = todayTasks.filter(
      (task) => (task.status ?? "pending") === "skipped"
    ).length;
    const total = todayTasks.length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const allDone = completed === total && total > 0;

    const todayXp = todayTasks.reduce((sum, task) => sum + getTaskXp(task), 0);
    const totalXp = tasks.reduce((sum, task) => sum + getTaskXp(task), 0);
    const petProgress = getPetProgress(totalXp);
    const activePet = getActivePet(totalXp, profile.activePetKey);

    return {
      todayTasks,
      completed,
      skipped,
      total,
      percent,
      allDone,
      todayXp,
      totalXp,
      activePet,
      petProgress,
    };
  }, [profile.activePetKey, tasks]);

  const message =
    summary.total === 0
      ? "No tasks were scheduled for today. A fresh reset is waiting for you tomorrow."
      : summary.allDone
        ? "You completed all your tasks today. Amazing work!"
        : `You completed ${summary.completed} out of ${summary.total} tasks (${summary.percent}%). Tomorrow is a new chance!`;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.emoji}>
        {summary.total === 0 ? "🌙" : summary.allDone ? "🎉" : "💪"}
      </Text>

      <Text style={[styles.title, { color: colors.text }]}>
        {summary.total === 0
          ? "Quiet day"
          : summary.allDone
            ? "You did it!"
            : "Let's try changing it up tomorrow"}
      </Text>

      <Text style={[styles.subtitle, { color: colors.subtle }]}>{message}</Text>

      <View
        style={[
          styles.petCard,
          { backgroundColor: colors.card, shadowColor: colors.tint },
        ]}
      >
        <View style={styles.petHero}>
          <Text style={styles.petEmoji}>{summary.activePet.emoji}</Text>
          <View style={styles.petCopy}>
            <Text style={[styles.petName, { color: colors.text }]}>
              {summary.activePet.name}
            </Text>
            <Text style={[styles.petDescription, { color: colors.subtle }]}>
              {summary.activePet.description}
            </Text>
            <Text style={[styles.petProgressText, { color: colors.subtle }]}>
              {summary.petProgress.nextPet
                ? `Collection progress: ${summary.petProgress.remainingXp} XP until ${summary.petProgress.nextPet.emoji} ${summary.petProgress.nextPet.name}`
                : "Collection complete. Final companion unlocked"}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.progressBarContainer,
            { backgroundColor: colors.border, marginTop: 16 },
          ]}
        >
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${summary.petProgress.progressPercent}%`,
                backgroundColor: colors.tint,
              },
            ]}
          />
        </View>
      </View>

      <View
        style={[
          styles.xpCard,
          { backgroundColor: colors.card, shadowColor: colors.tint },
        ]}
      >
        <Text style={[styles.xpLabel, { color: colors.subtle }]}>Today's XP</Text>
        <Text style={[styles.xpNumber, { color: colors.text }]}>
          {summary.todayXp >= 0 ? `+${summary.todayXp}` : summary.todayXp}
        </Text>
        <Text style={[styles.xpSubtext, { color: colors.subtle }]}>
          {summary.completed} completed • {summary.skipped} skipped • {summary.totalXp} total XP
        </Text>
      </View>

      <View
        style={[
          styles.progressCard,
          { backgroundColor: colors.card, shadowColor: colors.tint },
        ]}
      >
        <Text style={[styles.progressLabel, { color: colors.subtle }]}>
          Today's Score
        </Text>
        <Text style={[styles.progressNumber, { color: colors.text }]}>
          {summary.percent}%
        </Text>
        <View
          style={[
            styles.progressBarContainer,
            { backgroundColor: colors.border },
          ]}
        >
          <View
            style={[
              styles.progressBarFill,
              { width: `${summary.percent}%`, backgroundColor: colors.tint },
            ]}
          />
        </View>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, shadowColor: colors.tint },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>
          Today's Tasks
        </Text>

        {summary.todayTasks.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              Nothing was planned today
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.subtle }]}>
              Use tonight to set up tomorrow with a few clear priorities.
            </Text>
          </View>
        ) : (
          summary.todayTasks.map((task) => {
            const priority = task.priority ?? "Medium";
            const xp = getTaskXp(task);
            const isSkipped = (task.status ?? "pending") === "skipped";
            const xpLabel = task.completed ? `+${xp} XP` : isSkipped ? "No XP" : "Pending";

            return (
              <View key={task.id} style={styles.taskRow}>
                <Text style={styles.taskDot}>
                  {task.completed ? "✅" : isSkipped ? "⏭️" : "❌"}
                </Text>

                <View style={styles.taskInfo}>
                  <Text
                    style={[
                      styles.taskTitle,
                      { color: colors.text },
                      !task.completed && (task.status ?? "pending") !== "skipped"
                        ? { color: colors.subtle }
                        : null,
                    ]}
                  >
                    {task.title}
                  </Text>

                  <View style={styles.metaRow}>
                    {task.time ? (
                      <Text style={[styles.taskMeta, { color: colors.subtle }]}>
                        {task.time}
                      </Text>
                    ) : null}

                    <View
                      style={[
                        styles.priorityBadge,
                        { backgroundColor: colors.surface },
                      ]}
                    >
                      <View
                        style={[
                          styles.priorityDot,
                          { backgroundColor: priorityColors[priority] },
                        ]}
                      />
                      <Text style={[styles.priorityText, { color: colors.subtle }]}>
                        {priority}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.xpBadge,
                        { backgroundColor: colors.surface },
                      ]}
                    >
                      <Text
                        style={[
                          styles.xpBadgeText,
                          { color: task.completed ? colors.text : colors.subtle },
                        ]}
                      >
                        {xpLabel}
                      </Text>
                    </View>
                  </View>

                  {!!task.notes && (
                    <Text
                      style={[styles.taskNotes, { color: colors.subtle }]}
                      numberOfLines={2}
                    >
                      {task.notes}
                    </Text>
                  )}
                </View>
              </View>
            );
          })
        )}
      </View>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.tint }]}
        onPress={() => router.replace("/(tabs)")}
      >
        <Text style={styles.buttonText}>Back to Today</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: 24,
    paddingTop: 72,
    paddingBottom: 40,
    alignItems: "center",
  },
  emoji: { fontSize: 72, marginBottom: 16 },
  title: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  petCard: {
    borderRadius: 22,
    padding: 20,
    width: "100%",
    marginBottom: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  petHero: {
    flexDirection: "row",
    alignItems: "center",
  },
  petEmoji: {
    fontSize: 52,
    marginRight: 16,
  },
  petCopy: {
    flex: 1,
  },
  petName: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
  },
  petDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 6,
  },
  petProgressText: {
    fontSize: 13,
    fontWeight: "600",
  },
  xpCard: {
    borderRadius: 20,
    padding: 20,
    width: "100%",
    marginBottom: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  xpLabel: {
    fontSize: 14,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  xpNumber: {
    fontSize: 40,
    fontWeight: "700",
    marginBottom: 6,
  },
  xpSubtext: {
    fontSize: 14,
  },
  progressCard: {
    borderRadius: 20,
    padding: 20,
    width: "100%",
    marginBottom: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  progressNumber: {
    fontSize: 42,
    fontWeight: "700",
    marginBottom: 12,
  },
  progressBarContainer: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 8,
    borderRadius: 4,
  },
  card: {
    borderRadius: 20,
    padding: 20,
    width: "100%",
    marginBottom: 24,
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
    marginBottom: 16,
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  taskDot: {
    fontSize: 16,
    marginRight: 10,
    marginTop: 2,
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: "500",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 4,
  },
  taskMeta: {
    fontSize: 12,
    marginRight: 10,
  },
  priorityBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 8,
    marginTop: 6,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  priorityText: {
    fontSize: 12,
    fontWeight: "600",
  },
  xpBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 6,
  },
  xpBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  taskNotes: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 10,
  },
  emptyEmoji: {
    fontSize: 42,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  button: {
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    width: "100%",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});
