import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import {
  collection, deleteDoc, doc, onSnapshot, updateDoc
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  Alert,
  ScrollView, StyleSheet, Text,
  TouchableOpacity,
  View
} from "react-native";
import { auth, db } from "../../constants/firebaseConfig";

type Task = {
  id: string;
  title: string;
  time: string;
  date: string;
  completed: boolean;
};

export default function HomeScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [missedAlertShown, setMissedAlertShown] = useState(false);
  const router = useRouter();

  const getTodayDate = () => new Date().toISOString().split("T")[0];

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const unsub = onSnapshot(collection(db, "users", uid, "tasks"), async (snap) => {
      const fetched = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Task[];
      fetched.sort((a, b) => a.time.localeCompare(b.time));
      setTasks(fetched);

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayDate = yesterday.toISOString().split("T")[0];
      const todayDate = new Date().toISOString().split("T")[0];

      const incompleteTasks = fetched.filter(
        (t) => t.date === yesterdayDate && !t.completed
      );
      for (const task of incompleteTasks) {
        await updateDoc(doc(db, "users", uid, "tasks", task.id), {
          date: todayDate,
        });
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (tasks.length > 0) {
      checkMissedTasks();
      setMissedAlertShown(true);
    }
  }, [tasks]);

  const toggleComplete = async (task: Task) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await updateDoc(doc(db, "users", uid, "tasks", task.id), {
      completed: !task.completed,
    });
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const handleDelete = async (taskId: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await deleteDoc(doc(db, "users", uid, "tasks", taskId));
  };

  const checkMissedTasks = () => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const todayDate = new Date().toISOString().split("T")[0];

    const missedTasks = tasks.filter((t) => {
      if (t.completed) return false;
      if (t.date !== todayDate) return false;
      const [time, period] = t.time.split(" ");
      const [hours, minutes] = time.split(":").map(Number);
      let taskHours = hours;
      if (period === "PM" && hours !== 12) taskHours += 12;
      if (period === "AM" && hours === 12) taskHours = 0;
      const taskMinutes = taskHours * 60 + minutes;
      return taskMinutes + 60 < currentMinutes;
    });

    if (missedTasks.length > 0) {
      Alert.alert(
        "Missed Tasks 😬",
        `You missed ${missedTasks.length} task${missedTasks.length > 1 ? "s" : ""} today. Want to reschedule them to later today?`,
        [
          { text: "No thanks", style: "cancel" },
          {
            text: "Reschedule",
            onPress: () => rescheduleMissedTasks(missedTasks),
          },
        ]
      );
    }
  };

  const rescheduleMissedTasks = async (missedTasks: Task[]) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const now = new Date();
    for (let i = 0; i < missedTasks.length; i++) {
      const newTime = new Date(now.getTime() + (i + 1) * 30 * 60000);
      const newTimeString = newTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      await updateDoc(doc(db, "users", uid, "tasks", missedTasks[i].id), {
        time: newTimeString,
      });
    }
    Alert.alert("Done! ✅", "Your missed tasks have been rescheduled in 30 minute intervals.");
  };

  const isCurrentTask = (task: Task) => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [time, period] = task.time.split(" ");
    const [hours, minutes] = time.split(":").map(Number);
    let taskHours = hours;
    if (period === "PM" && hours !== 12) taskHours += 12;
    if (period === "AM" && hours === 12) taskHours = 0;
    const taskMinutes = taskHours * 60 + minutes;
    return taskMinutes <= currentMinutes && currentMinutes < taskMinutes + 60;
  };

  const today = getTodayDate();
  const todayTasks = tasks.filter((t) => t.date === today);
  const futureTasks = tasks.filter((t) => t.date > today);
  const completed = todayTasks.filter((t) => t.completed).length;
  const progressPercent = todayTasks.length > 0 ? (completed / todayTasks.length) * 100 : 0;

  const renderTask = (item: Task) => (
    <View key={item.id} style={[styles.task, isCurrentTask(item) && styles.currentTask]}>
      <TouchableOpacity
        onPress={() => toggleComplete(item)}
        style={styles.taskLeft}
      >
        <View style={[styles.checkbox, item.completed && styles.checked]}>
          {item.completed && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <View>
          <Text style={[styles.taskTitle, item.completed && styles.strikethrough]}>
            {item.title}
          </Text>
          <Text style={[styles.taskTime, isCurrentTask(item) && styles.currentTime]}>
            {item.time} {isCurrentTask(item) ? "· Now" : ""}
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => handleDelete(item.id)}
        style={styles.deleteButton}
      >
        <Text style={styles.deleteText}>✕</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Good day 🌸</Text>
          <Text style={styles.title}>Today</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logout}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </View>

      {todayTasks.length > 0 && (
        <View style={styles.progressSection}>
          <Text style={styles.progressLabel}>
            {completed}/{todayTasks.length} tasks completed
          </Text>
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
          </View>
        </View>
      )}

      {todayTasks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>📋</Text>
          <Text style={styles.emptyTitle}>Nothing yet!</Text>
          <Text style={styles.emptySubtitle}>Add tasks for tomorrow in the Add Task tab</Text>
        </View>
      ) : (
        <View style={styles.taskList}>
          {todayTasks.map(renderTask)}
        </View>
      )}

      {futureTasks.length > 0 && (
        <View style={styles.futureSection}>
          <Text style={styles.futureHeading}>📅 Future Plans</Text>
          {futureTasks.map((item) => (
            <View key={item.id} style={styles.task}>
              <TouchableOpacity
                onPress={() => toggleComplete(item)}
                style={styles.taskLeft}
              >
                <View style={[styles.checkbox, item.completed && styles.checked]}>
                  {item.completed && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <View>
                  <Text style={[styles.taskTitle, item.completed && styles.strikethrough]}>
                    {item.title}
                  </Text>
                  <Text style={styles.taskTime}>{item.time} · {item.date}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDelete(item.id)}
                style={styles.deleteButton}
              >
                <Text style={styles.deleteText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
      <TouchableOpacity style={styles.summaryButton} onPress={() => router.push("/summary")}>
        <Text style={styles.summaryButtonText}>View Day Summary 📋</Text>
      </TouchableOpacity>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fdf6ff" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 16,
  },
  greeting: { fontSize: 14, color: "#9b8aa8", marginBottom: 4 },
  title: { fontSize: 32, fontWeight: "700", color: "#4a3f55" },
  logout: {
    backgroundColor: "#f0e6f6",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  logoutText: { color: "#9b8aa8", fontSize: 13, fontWeight: "600" },
  progressSection: { paddingHorizontal: 24, marginBottom: 24 },
  progressLabel: { fontSize: 13, color: "#9b8aa8", marginBottom: 8 },
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
  taskList: {
    paddingHorizontal: 24,
    backgroundColor: "#fff",
    borderRadius: 20,
    marginHorizontal: 16,
    shadowColor: "#c4a8d4",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  task: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f5edf9",
  },
  currentTask: {
    backgroundColor: "#fdf0ff",
    borderLeftWidth: 3,
    borderLeftColor: "#c4a8d4",
    paddingLeft: 12,
    marginLeft: -12,
    borderRadius: 8,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "#c4a8d4",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  checked: { backgroundColor: "#c4a8d4", borderColor: "#c4a8d4" },
  checkmark: { color: "#fff", fontSize: 13, fontWeight: "700" },
  taskLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  taskTitle: { fontSize: 16, fontWeight: "500", color: "#4a3f55" },
  strikethrough: { textDecorationLine: "line-through", color: "#c4b5c8" },
  taskTime: { fontSize: 13, color: "#9b8aa8", marginTop: 2 },
  currentTime: { color: "#c4a8d4", fontWeight: "600" },
  deleteButton: { padding: 8 },
  deleteText: { color: "#e0c8e8", fontSize: 16 },
  emptyContainer: {
    alignItems: "center",
    marginTop: 80,
    paddingHorizontal: 40,
  },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: "#4a3f55", marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: "#9b8aa8", textAlign: "center", lineHeight: 22 },
  futureSection: {
    marginTop: 32,
    paddingHorizontal: 16,
  },
  futureHeading: {
    fontSize: 18,
    fontWeight: "700",
    color: "#4a3f55",
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  summaryButton: { marginHorizontal: 16, marginTop: 24, backgroundColor: "#fff", padding: 14, borderRadius: 14, alignItems: "center", borderWidth: 1, borderColor: "#e8d8f0" },
  summaryButtonText: { color: "#9b8aa8", fontWeight: "600", fontSize: 15 },
});