import { collection, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
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

  const today = getTodayDate();
  const todayTasks = tasks.filter((t) => t.date === today);
  const futureTasks = tasks.filter((t) => t.date > today);
  const completed = todayTasks.filter((t) => t.completed).length;

  const renderTask = (item: Task) => (
    <TouchableOpacity
      key={item.id}
      style={styles.task}
      onPress={() => toggleComplete(item)}
    >
      <View style={[styles.checkbox, item.completed && styles.checked]} />
      <View>
        <Text
          style={[styles.taskTitle, item.completed && styles.strikethrough]}
        >
          {item.title}
        </Text>
        <Text style={styles.taskTime}>{item.time}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Today</Text>
      {todayTasks.length > 0 && (
        <Text style={styles.progress}>
          {completed}/{todayTasks.length} tasks done
        </Text>
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
              <View style={styles.checkbox} />
              <View>
                <Text style={styles.taskTitle}>{item.title}</Text>
                <Text style={styles.taskTime}>
                  {item.time} · {item.date}
                </Text>
              </View>
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
    gap: 16,
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
});
