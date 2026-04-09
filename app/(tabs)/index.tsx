import { signOut } from "firebase/auth";
import {
  collection, deleteDoc, doc, onSnapshot, updateDoc
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
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

  const getTodayDate = () => new Date().toISOString().split("T")[0];

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const unsub = onSnapshot(collection(db, "users", uid, "tasks"), (snap) => {
      const fetched = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Task[];
      fetched.sort((a, b) => a.time.localeCompare(b.time));
      setTasks(fetched);
    });
    return unsub;
  }, []);

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

  const isCurrentTask = (task: Task) => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [time, period] = task.time.split(" ");
    const [hours, minutes] = time.split(":").map(Number);
    let taskHours = hours;
    if (period == "PM" && hours !== 12) taskHours += 12;
    if(period == "AM" && hours == 12) taskHours = 0;
    const taskMinutes = taskHours * 60 + minutes;
    return taskMinutes <= currentMinutes && currentMinutes < taskMinutes + 60;
  };

  const today = getTodayDate();
  const todayTasks = tasks.filter((t) => t.date === today);
  const futureTasks = tasks.filter((t) => t.date > today);
  const completed = todayTasks.filter((t) => t.completed).length;

  const renderTask = (item: Task) => (
    <View key={item.id} style={[styles.task, isCurrentTask(item) && styles.currentTask]}>
      <TouchableOpacity
        onPress={() => toggleComplete(item)}
        style={styles.taskLeft}
      >
        <View style={[styles.checkbox, item.completed && styles.checked, isCurrentTask(item) && styles.currentCheckbox]} />
        <View>
          <Text style={[styles.taskTitle, item.completed && styles.strikethrough]}>
            {item.title}
          </Text>
          <Text style={[styles.taskTime, isCurrentTask(item) && styles.currentTime]}>{item.time}</Text>
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
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Today</Text>
      <TouchableOpacity onPress={handleLogout} style={styles.logout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
      {todayTasks.length > 0 && (
    <View style={styles.progressBarContainer}>
    <View
      style={[
        styles.progressBarFill,
        { width: `${(completed / todayTasks.length) * 100}%` },
      ]}
    />
  </View>
)}
      {todayTasks.length === 0 ? (
        <Text style={styles.empty}>No tasks for today 👀</Text>
      ) : (
        todayTasks.map(renderTask)
      )}

      {futureTasks.length > 0 && (
        <View style={styles.futureSection}>
          <Text style={styles.futureHeading}>Future Plans</Text>
          {futureTasks.map((item) => (
            <View key={item.id} style={styles.task}>
              <TouchableOpacity
                onPress={() => toggleComplete(item)}
                style={styles.taskLeft}
              >
                <View style={[styles.checkbox, item.completed && styles.checked]} />
                <View>
                  <Text style={[styles.taskTitle, item.completed && styles.strikethrough]}>
                    {item.title}
                  </Text>
                  <Text style={styles.taskTime}>
                    {item.time} · {item.date}
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
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: "#fff" },
  title: { fontSize: 32, fontWeight: "bold", marginTop: 32, marginBottom: 8 },
  progress: { fontSize: 14, color: "#666", marginBottom: 24 },
  empty: { textAlign: "center", color: "#666", marginTop: 40, fontSize: 16 },
  task: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#000",
  },
  checked: { backgroundColor: "#000" },
  taskTitle: { fontSize: 16, fontWeight: "500", color: "#000" },
  strikethrough: { textDecorationLine: "line-through", color: "#999" },
  taskTime: { fontSize: 13, color: "#666", marginTop: 2 },
  futureSection: { marginTop: 40 },
  futureHeading: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#333",
  },
  logout: { position: "absolute", top: 32, right: 24 },
  logoutText: { color: "#999", fontSize: 14 },
  taskLeft: { flexDirection: "row", alignItems: "center", gap: 16, flex: 1 },
  deleteButton: { padding: 8 },
  deleteText: { color: "#ccc", fontSize: 16 },
  progressBarContainer: {
    height : 8,
    backgroundColor: "#f0f0f0",
    borderRadius: 4, 
    marginBottom: 24,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 0,
    backgroundColor: "000",
    borderRadius: 4,
  },
  currentTask: { 
    backgroundColor: "#f9f9f9",
    borderLeftWidth: 3,
    borderLeftColor: "000",
    paddingLeft: 12,
  },
  currentCheckbox: {
    borderColor: "#000",

  },
  currentTime: { 
    color: "000",
    fontWeight:"600",
  },

});