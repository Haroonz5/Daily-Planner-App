import { useRouter } from "expo-router";
import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { auth, db } from "../constants/firebaseConfig";

type Task = {
  id: string;
  title: string;
  completed: boolean;
  date: string;
};

export default function SummaryScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const router = useRouter();

  const getTodayDate = () => new Date().toISOString().split("T")[0];

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

  const todayTasks = tasks.filter((t) => t.date === getTodayDate());
  const completed = todayTasks.filter((t) => t.completed).length;
  const total = todayTasks.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const allDone = completed === total && total > 0;

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{allDone ? "🎉" : "💪"}</Text>
      <Text style={styles.title}>
        {allDone ? "You did it!" : "Let's try changing it up tomorrow"}
      </Text>
      <Text style={styles.subtitle}>
        {allDone
          ? "You completed all your tasks today. Amazing work!"
          : `You completed ${completed} out of ${total} tasks (${percent}%). Tomorrow is a new chance!`}
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Today's Tasks</Text>
        {todayTasks.map((task) => (
          <View key={task.id} style={styles.taskRow}>
            <Text style={styles.taskDot}>{task.completed ? "✅" : "❌"}</Text>
            <Text style={[styles.taskTitle, !task.completed && styles.missed]}>
              {task.title}
            </Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.button} onPress={() => router.replace("/(tabs)")}>
        <Text style={styles.buttonText}>Back to Today</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fdf6ff", padding: 24, justifyContent: "center", alignItems: "center" },
  emoji: { fontSize: 72, marginBottom: 16 },
  title: { fontSize: 28, fontWeight: "700", color: "#4a3f55", textAlign: "center", marginBottom: 12 },
  subtitle: { fontSize: 15, color: "#9b8aa8", textAlign: "center", lineHeight: 24, marginBottom: 32, paddingHorizontal: 16 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    width: "100%",
    marginBottom: 32,
    shadowColor: "#c4a8d4",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  cardTitle: { fontSize: 14, fontWeight: "600", color: "#9b8aa8", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 16 },
  taskRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  taskDot: { fontSize: 16, marginRight: 10 },
  taskTitle: { fontSize: 15, color: "#4a3f55", fontWeight: "500" },
  missed: { color: "#c4b5c8" },
  button: {
    backgroundColor: "#c4a8d4",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    width: "100%",
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});