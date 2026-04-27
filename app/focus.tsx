import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { collection, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useAppTheme } from "@/constants/appTheme";
import { PetSprite } from "@/components/pet-sprite";
import { getActivePet, getTaskXp, type Priority } from "@/constants/rewards";
import { Colors } from "@/constants/theme";
import { useUserProfile } from "@/hooks/use-user-profile";
import { cancelTaskNotifications, syncTaskNotifications } from "../utils/notifications";
import { formatDateKey, sortTasksBySchedule } from "../utils/task-helpers";
import { auth, db } from "../constants/firebaseConfig";

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
  completedAt?: any;
  skippedAt?: any;
  lastActionAt?: any;
  rescheduledCount?: number;
  originalTime?: string;
};

export default function FocusScreen() {
  const router = useRouter();
  const { themeName } = useAppTheme();
  const { profile } = useUserProfile();
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

      setTasks(sortTasksBySchedule(fetched));
    });

    return unsubscribe;
  }, []);

  const today = formatDateKey(new Date());

  const focusData = useMemo(() => {
    const totalXp = tasks.reduce((sum, task) => sum + getTaskXp(task), 0);
    const activePet = getActivePet(totalXp, profile.activePetKey);
    const todayTasks = tasks.filter((task) => task.date === today);
    const pendingTasks = todayTasks.filter(
      (task) => !task.completed && (task.status ?? "pending") !== "skipped"
    );

    return {
      activePet,
      currentTask: pendingTasks[0] ?? null,
      queue: pendingTasks.slice(1),
      completed: todayTasks.filter((task) => task.completed).length,
      total: todayTasks.length,
    };
  }, [profile.activePetKey, tasks, today]);

  const handleComplete = async (task: Task) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    await updateDoc(doc(db, "users", uid, "tasks", task.id), {
      completed: true,
      status: "completed",
      completedAt: new Date(),
      skippedAt: null,
      lastActionAt: new Date(),
    });

    await cancelTaskNotifications(task.id);
  };

  const handleUndo = async (task: Task) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    await updateDoc(doc(db, "users", uid, "tasks", task.id), {
      completed: false,
      status: "pending",
      completedAt: null,
      lastActionAt: new Date(),
    });

    await syncTaskNotifications({
      id: task.id,
      title: task.title,
      time: task.time,
      date: task.date,
      priority: task.priority,
      completed: false,
      status: "pending",
    });
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.backText, { color: colors.tint }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Focus Mode</Text>
        <Text style={[styles.subtitle, { color: colors.subtle }]}>
          One task at a time. Keep the noise low and the next move obvious.
        </Text>
      </View>

      <View style={[styles.petCard, { backgroundColor: colors.card, shadowColor: colors.tint }]}>
        <PetSprite petKey={focusData.activePet.key} size={78} style={styles.petSprite} />
        <Text style={[styles.petName, { color: colors.text }]}>
          {focusData.activePet.name} is with you
        </Text>
        <Text style={[styles.petCopy, { color: colors.subtle }]}>
          {focusData.completed}/{focusData.total} done today
        </Text>
      </View>

      {focusData.currentTask ? (
        <View style={[styles.currentCard, { backgroundColor: colors.card, shadowColor: colors.tint }]}>
          <Text style={[styles.cardLabel, { color: colors.subtle }]}>Current Focus</Text>
          <Text style={[styles.currentTitle, { color: colors.text }]}>
            {focusData.currentTask.title}
          </Text>
          <Text style={[styles.currentMeta, { color: colors.subtle }]}>
            {focusData.currentTask.time}
          </Text>
          {!!focusData.currentTask.notes && (
            <Text style={[styles.currentNotes, { color: colors.subtle }]}>
              {focusData.currentTask.notes}
            </Text>
          )}

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.tint }]}
            onPress={() => handleComplete(focusData.currentTask!)}
          >
            <Text style={styles.primaryButtonText}>Mark Complete</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.currentCard, { backgroundColor: colors.card, shadowColor: colors.tint }]}>
          <Text style={[styles.currentTitle, { color: colors.text }]}>
            No pending tasks for today
          </Text>
          <Text style={[styles.currentNotes, { color: colors.subtle }]}>
            Either you cleared the day or nothing is scheduled yet. That counts as clarity.
          </Text>
        </View>
      )}

      {focusData.queue.length > 0 && (
        <View style={[styles.queueCard, { backgroundColor: colors.card, shadowColor: colors.tint }]}>
          <Text style={[styles.cardLabel, { color: colors.subtle }]}>Up Next</Text>
          {focusData.queue.map((task) => (
            <View key={task.id} style={[styles.queueRow, { borderBottomColor: colors.border }]}>
              <View style={styles.queueCopy}>
                <Text style={[styles.queueTitle, { color: colors.text }]}>{task.title}</Text>
                <Text style={[styles.queueMeta, { color: colors.subtle }]}>{task.time}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={[styles.queueCard, { backgroundColor: colors.card, shadowColor: colors.tint }]}>
        <Text style={[styles.cardLabel, { color: colors.subtle }]}>Quick Undo</Text>
        {tasks
          .filter((task) => task.date === today && task.completed)
          .slice(-3)
          .map((task) => (
            <TouchableOpacity
              key={task.id}
              style={[styles.undoRow, { borderBottomColor: colors.border }]}
              onPress={() => handleUndo(task)}
            >
              <Text style={[styles.queueTitle, { color: colors.text }]}>{task.title}</Text>
              <Text style={[styles.undoText, { color: colors.tint }]}>Undo</Text>
            </TouchableOpacity>
          ))}
        {tasks.filter((task) => task.date === today && task.completed).length === 0 && (
          <Text style={[styles.emptyText, { color: colors.subtle }]}>
            Nothing completed yet today, so there is nothing to undo.
          </Text>
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 20,
  },
  backText: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 14,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
  },
  petCard: {
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 16,
    alignItems: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  petEmoji: {
    fontSize: 48,
    marginBottom: 10,
  },
  petSprite: {
    marginBottom: 10,
  },
  petName: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 6,
  },
  petCopy: {
    fontSize: 14,
  },
  currentCard: {
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  currentTitle: {
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 8,
  },
  currentMeta: {
    fontSize: 14,
    marginBottom: 8,
  },
  currentNotes: {
    fontSize: 14,
    lineHeight: 21,
  },
  primaryButton: {
    marginTop: 18,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  queueCard: {
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  queueRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  queueCopy: {
    flex: 1,
  },
  queueTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  queueMeta: {
    fontSize: 13,
    marginTop: 4,
  },
  undoRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  undoText: {
    fontSize: 13,
    fontWeight: "700",
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 21,
  },
});
