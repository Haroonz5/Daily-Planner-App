import { useRouter } from "expo-router";
import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { auth, db } from "../constants/firebaseConfig";

type Priority = "Low" | "Medium" | "High";

type Task = {
  id: string;
  title: string;
  completed: boolean;
  date: string;
  time?: string;
  priority?: Priority;
  notes?: string;
};

const priorityColors: Record<Priority, string> = {
  Low: "#8dcf9f",
  Medium: "#f2b97f",
  High: "#e58ca8",
};

export default function SummaryScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const router = useRouter();

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

  const todayTasks = tasks.filter((task) => task.date === getTodayDate());
  const completed = todayTasks.filter((task) => task.completed).length;
  const total = todayTasks.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const allDone = completed === total && total > 0;

  const message =
    total === 0
      ? "No tasks were scheduled for today. A fresh reset is waiting for you tomorrow."
      : allDone
        ? "You completed all your tasks today. Amazing work!"
        : `You completed ${completed} out of ${total} tasks (${percent}%). Tomorrow is a new chance!`;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.emoji}>
        {total === 0 ? "🌙" : allDone ? "🎉" : "💪"}
      </Text>

      <Text style={styles.title}>
        {total === 0
          ? "Quiet day"
          : allDone
            ? "You did it!"
            : "Let's try changing it up tomorrow"}
      </Text>

      <Text style={styles.subtitle}>{message}</Text>

      <View style={styles.progressCard}>
        <Text style={styles.progressLabel}>Today's Score</Text>
        <Text style={styles.progressNumber}>{percent}%</Text>
        <View style={styles.progressBarContainer}>
          <View style={[styles.progressBarFill, { width: `${percent}%` }]} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Today's Tasks</Text>

        {todayTasks.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={styles.emptyTitle}>Nothing was planned today</Text>
            <Text style={styles.emptySubtitle}>
              Use tonight to set up tomorrow with a few clear priorities.
            </Text>
          </View>
        ) : (
          todayTasks.map((task) => {
            const priority = task.priority ?? "Medium";

            return (
              <View key={task.id} style={styles.taskRow}>
                <Text style={styles.taskDot}>{task.completed ? "✅" : "❌"}</Text>

                <View style={styles.taskInfo}>
                  <Text style={[styles.taskTitle, !task.completed && styles.missed]}>
                    {task.title}
                  </Text>

                  <View style={styles.metaRow}>
                    {task.time ? <Text style={styles.taskMeta}>{task.time}</Text> : null}
                    <View style={styles.priorityBadge}>
                      <View
                        style={[
                          styles.priorityDot,
                          { backgroundColor: priorityColors[priority] },
                        ]}
                      />
                      <Text style={styles.priorityText}>{priority}</Text>
                    </View>
                  </View>

                  {!!task.notes && (
                    <Text style={styles.taskNotes} numberOfLines={2}>
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
        style={styles.button}
        onPress={() => router.replace("/(tabs)")}
      >
        <Text style={styles.buttonText}>Back to Today</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fdf6ff" },
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
    color: "#4a3f55",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: "#9b8aa8",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  progressCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    width: "100%",
    marginBottom: 16,
    shadowColor: "#c4a8d4",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#9b8aa8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  progressNumber: {
    fontSize: 42,
    fontWeight: "700",
    color: "#4a3f55",
    marginBottom: 12,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: "#e8d8f0",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 8,
    backgroundColor: "#c4a8d4",
    borderRadius: 4,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    width: "100%",
    marginBottom: 24,
    shadowColor: "#c4a8d4",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#9b8aa8",
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
    color: "#4a3f55",
    fontWeight: "500",
  },
  missed: {
    color: "#c4b5c8",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 4,
  },
  taskMeta: {
    fontSize: 12,
    color: "#9b8aa8",
    marginRight: 10,
  },
  priorityBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f1fb",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  priorityText: {
    fontSize: 12,
    color: "#7e6d8d",
    fontWeight: "600",
  },
  taskNotes: {
    fontSize: 13,
    color: "#9b8aa8",
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
    color: "#4a3f55",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#9b8aa8",
    textAlign: "center",
    lineHeight: 22,
  },
  button: {
    backgroundColor: "#c4a8d4",
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
