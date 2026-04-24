import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
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

export default function HomeScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editPriority, setEditPriority] = useState<Priority>("Medium");
  const router = useRouter();

  const getTodayDate = () => new Date().toISOString().split("T")[0];

  const parseTimeToMinutes = (time: string) => {
    const parts = time.split(" ");
    if (parts.length !== 2) return null;
    const period = parts[1];
    const [hoursStr, minutesStr] = parts[0].split(":");
    const hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr, 10);

    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

    let taskHours = hours;
    if (period === "PM" && hours !== 12) taskHours += 12;
    if (period === "AM" && hours === 12) taskHours = 0;

    return taskHours * 60 + minutes;
  };

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const unsub = onSnapshot(
      collection(db, "users", uid, "tasks"),
      async (snap) => {
        const fetched = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Task[];

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

        const sortedTasks = fetched.sort((a, b) => {
          const timeA = parseTimeToMinutes(a.time) ?? 0;
          const timeB = parseTimeToMinutes(b.time) ?? 0;
          return timeA - timeB;
        });

        setTasks(sortedTasks);
      }
    );

    return unsub;
  }, []);

  const toggleComplete = async (task: Task) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

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

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditTime(task.time);
    setEditNotes(task.notes ?? "");
    setEditPriority(task.priority ?? "Medium");
  };

  const closeEditModal = () => {
    setEditingTask(null);
    setEditTitle("");
    setEditTime("");
    setEditNotes("");
    setEditPriority("Medium");
  };

  const saveTaskEdits = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !editingTask || !editTitle.trim() || !editTime.trim()) return;

    await updateDoc(doc(db, "users", uid, "tasks", editingTask.id), {
      title: editTitle.trim(),
      time: editTime.trim(),
      notes: editNotes.trim(),
      priority: editPriority,
    });

    closeEditModal();
  };

  const isCurrentTask = (task: Task) => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const taskMinutes = parseTimeToMinutes(task.time);
    if (taskMinutes === null) return false;
    return taskMinutes <= currentMinutes && currentMinutes < taskMinutes + 60;
  };

  const hasMissedTasks = () => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const todayDate = new Date().toISOString().split("T")[0];

    return tasks.some((t) => {
      if (t.completed) return false;
      if (t.date !== todayDate) return false;
      const taskMinutes = parseTimeToMinutes(t.time);
      return taskMinutes !== null && taskMinutes + 60 < currentMinutes;
    });
  };

  const today = getTodayDate();
  const todayTasks = tasks.filter((t) => t.date === today);
  const futureTasks = tasks.filter((t) => t.date > today);
  const completed = todayTasks.filter((t) => t.completed).length;
  const progressPercent =
    todayTasks.length > 0 ? (completed / todayTasks.length) * 100 : 0;

  const renderPriority = (priority?: Priority) => {
    const value = priority ?? "Medium";
    return (
      <View style={styles.priorityRow}>
        <View
          style={[
            styles.priorityDot,
            { backgroundColor: priorityColors[value] },
          ]}
        />
        <Text style={styles.priorityText}>{value}</Text>
      </View>
    );
  };

  const renderTask = (item: Task) => (
    <View
      key={item.id}
      style={[styles.task, isCurrentTask(item) && styles.currentTask]}
    >
      <TouchableOpacity onPress={() => toggleComplete(item)} style={styles.checkboxWrap}>
        <View style={[styles.checkbox, item.completed && styles.checked]}>
          {item.completed && <Text style={styles.checkmark}>✓</Text>}
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => openEditModal(item)}
        style={styles.taskContent}
        activeOpacity={0.8}
      >
        <Text style={[styles.taskTitle, item.completed && styles.strikethrough]}>
          {item.title}
        </Text>

        <Text style={[styles.taskTime, isCurrentTask(item) && styles.currentTime]}>
          {item.time} {isCurrentTask(item) ? "· Now" : ""}
        </Text>

        {renderPriority(item.priority)}

        {!!item.notes && (
          <Text style={styles.taskNotes} numberOfLines={2}>
            {item.notes}
          </Text>
        )}
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
    <>
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
              <View
                style={[styles.progressBarFill, { width: `${progressPercent}%` }]}
              />
            </View>
          </View>
        )}

        {hasMissedTasks() && (
          <View style={styles.missedBanner}>
            <Text style={styles.missedBannerText}>
              ⚠️ You've missed some tasks today. Stay consistent!
            </Text>
          </View>
        )}

        {todayTasks.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>🌤️</Text>
            <Text style={styles.emptyTitle}>Today is still wide open</Text>
            <Text style={styles.emptySubtitle}>
              Add a few tasks in the Add Task tab tonight so tomorrow starts with
              direction.
            </Text>
          </View>
        ) : (
          <View style={styles.taskList}>{todayTasks.map(renderTask)}</View>
        )}

        {futureTasks.length > 0 && (
          <View style={styles.futureSection}>
            <Text style={styles.futureHeading}>📅 Future Plans</Text>
            <View style={styles.taskList}>
              {futureTasks.map((item) => (
                <View key={item.id} style={styles.task}>
                  <TouchableOpacity
                    onPress={() => toggleComplete(item)}
                    style={styles.checkboxWrap}
                  >
                    <View style={[styles.checkbox, item.completed && styles.checked]}>
                      {item.completed && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => openEditModal(item)}
                    style={styles.taskContent}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.taskTitle,
                        item.completed && styles.strikethrough,
                      ]}
                    >
                      {item.title}
                    </Text>
                    <Text style={styles.taskTime}>
                      {item.time} · {item.date}
                    </Text>
                    {renderPriority(item.priority)}
                    {!!item.notes && (
                      <Text style={styles.taskNotes} numberOfLines={2}>
                        {item.notes}
                      </Text>
                    )}
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
          </View>
        )}

        <TouchableOpacity
          style={styles.summaryButton}
          onPress={() => router.push("/summary")}
        >
          <Text style={styles.summaryButtonText}>View Day Summary 📋</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={!!editingTask}
        animationType="slide"
        transparent
        onRequestClose={closeEditModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Task</Text>

            <TextInput
              style={styles.modalInput}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Task title"
              placeholderTextColor="#c4b5c8"
            />

            <TextInput
              style={styles.modalInput}
              value={editTime}
              onChangeText={setEditTime}
              placeholder="7:00 AM"
              placeholderTextColor="#c4b5c8"
            />

            <TextInput
              style={[styles.modalInput, styles.notesInput]}
              value={editNotes}
              onChangeText={setEditNotes}
              placeholder="Optional notes"
              placeholderTextColor="#c4b5c8"
              multiline
            />

            <View style={styles.priorityPicker}>
              {(["Low", "Medium", "High"] as Priority[]).map((priority) => (
                <TouchableOpacity
                  key={priority}
                  style={[
                    styles.priorityChip,
                    editPriority === priority && styles.priorityChipActive,
                  ]}
                  onPress={() => setEditPriority(priority)}
                >
                  <View
                    style={[
                      styles.priorityDot,
                      { backgroundColor: priorityColors[priority] },
                    ]}
                  />
                  <Text style={styles.priorityChipText}>{priority}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={closeEditModal}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={saveTaskEdits}
              >
                <Text style={styles.primaryButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
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
  progressSection: { paddingHorizontal: 24, marginBottom: 16 },
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
  missedBanner: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: "#ffe8f0",
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: "#e07a9b",
  },
  missedBannerText: {
    color: "#e07a9b",
    fontSize: 14,
    fontWeight: "600",
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
    alignItems: "flex-start",
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
  checkboxWrap: {
    paddingTop: 2,
    marginRight: 14,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "#c4a8d4",
    alignItems: "center",
    justifyContent: "center",
  },
  checked: { backgroundColor: "#c4a8d4", borderColor: "#c4a8d4" },
  checkmark: { color: "#fff", fontSize: 13, fontWeight: "700" },
  taskContent: {
    flex: 1,
    paddingRight: 8,
  },
  taskTitle: { fontSize: 16, fontWeight: "500", color: "#4a3f55" },
  strikethrough: { textDecorationLine: "line-through", color: "#c4b5c8" },
  taskTime: { fontSize: 13, color: "#9b8aa8", marginTop: 2 },
  currentTime: { color: "#c4a8d4", fontWeight: "600" },
  priorityRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  priorityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  priorityText: {
    fontSize: 12,
    color: "#9b8aa8",
    fontWeight: "600",
  },
  taskNotes: {
    fontSize: 13,
    color: "#7e6d8d",
    marginTop: 6,
    lineHeight: 18,
  },
  deleteButton: { padding: 8 },
  deleteText: { color: "#e0c8e8", fontSize: 16 },
  emptyContainer: {
    alignItems: "center",
    marginTop: 80,
    paddingHorizontal: 40,
  },
  emptyEmoji: { fontSize: 52, marginBottom: 16 },
  emptyTitle: {
    fontSize: 22,
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
  futureSection: {
    marginTop: 32,
  },
  futureHeading: {
    fontSize: 18,
    fontWeight: "700",
    color: "#4a3f55",
    marginBottom: 12,
    paddingHorizontal: 24,
  },
  summaryButton: {
    marginHorizontal: 16,
    marginTop: 24,
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e8d8f0",
  },
  summaryButtonText: { color: "#9b8aa8", fontWeight: "600", fontSize: 15 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(74, 63, 85, 0.24)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 32,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#4a3f55",
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: "#fdf6ff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e8d8f0",
    padding: 14,
    fontSize: 15,
    color: "#4a3f55",
    marginBottom: 12,
  },
  notesInput: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  priorityPicker: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 4,
    marginBottom: 20,
  },
  priorityChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8f1fb",
    borderRadius: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#eadcf2",
  },
  priorityChipActive: {
    backgroundColor: "#f3e6f8",
    borderColor: "#c4a8d4",
  },
  priorityChipText: {
    color: "#4a3f55",
    fontWeight: "600",
    fontSize: 13,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: "#f6eef9",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#8f7d9e",
    fontWeight: "700",
  },
  primaryButton: {
    flex: 1,
    backgroundColor: "#c4a8d4",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
});
