import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  increment,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
type TimerState = "idle" | "running" | "paused" | "done";

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
  focusSessionCount?: number;
  focusMinutes?: number;
  originalTime?: string;
};

type FocusSession = {
  id: string;
  taskId: string | null;
  taskTitle: string;
  minutes: number;
  completedAt?: any;
  createdAt?: any;
};

const focusPresets = [15, 25, 45];

const formatClock = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
};

export default function FocusScreen() {
  const router = useRouter();
  const { themeName } = useAppTheme();
  const { profile, saveProfile } = useUserProfile();
  const colors = Colors[themeName];
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessionMinutes, setSessionMinutes] = useState(25);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [timerState, setTimerState] = useState<TimerState>("idle");
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const loggedSessionRef = useRef(false);

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

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    return onSnapshot(collection(db, "users", uid, "focusSessions"), (snap) => {
      setFocusSessions(
        snap.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        })) as FocusSession[]
      );
    });
  }, []);

  useEffect(() => {
    const preferredMinutes = profile.focusDurationMinutes ?? 25;
    if (timerState === "idle") {
      setSessionMinutes(preferredMinutes);
      setSecondsLeft(preferredMinutes * 60);
    }
  }, [profile.focusDurationMinutes, timerState]);

  useEffect(() => {
    if (timerState !== "running") return;

    const interval = setInterval(() => {
      setSecondsLeft((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [timerState]);

  useEffect(() => {
    if (timerState === "running" && secondsLeft === 0) {
      setTimerState("done");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {}
      );
    }
  }, [secondsLeft, timerState]);

  const today = formatDateKey(new Date());

  const logFocusSession = useCallback(async (task: Task | null) => {
    const uid = auth.currentUser?.uid;
    if (!uid || loggedSessionRef.current) return;

    loggedSessionRef.current = true;

    await addDoc(collection(db, "users", uid, "focusSessions"), {
      taskId: task?.id ?? null,
      taskTitle: task?.title ?? "Untitled focus block",
      minutes: sessionMinutes,
      completedAt: new Date(),
      createdAt: new Date(),
    });

    if (task) {
      await updateDoc(doc(db, "users", uid, "tasks", task.id), {
        focusSessionCount: increment(1),
        focusMinutes: increment(sessionMinutes),
        lastActionAt: new Date(),
      });
    }
  }, [sessionMinutes]);

  const focusData = useMemo(() => {
    const totalXp = tasks.reduce((sum, task) => sum + getTaskXp(task), 0);
    const activePet = getActivePet(totalXp, profile.activePetKey);
    const todayTasks = tasks.filter((task) => task.date === today);
    const pendingTasks = todayTasks.filter(
      (task) => !task.completed && (task.status ?? "pending") !== "skipped"
    );
    const completedToday = todayTasks.filter((task) => task.completed).length;
    const selectedTask =
      pendingTasks.find((task) => task.id === selectedTaskId) ?? pendingTasks[0] ?? null;
    const completedSessionsToday = focusSessions.filter((session) => {
      const value = session.completedAt;
      const date =
        typeof value?.toDate === "function"
          ? value.toDate()
          : value
            ? new Date(value)
            : null;
      return date ? formatDateKey(date) === today : false;
    });
    const focusMinutesToday = completedSessionsToday.reduce(
      (sum, session) => sum + (session.minutes ?? 0),
      0
    );

    return {
      activePet,
      currentTask: selectedTask,
      queue: pendingTasks.filter((task) => task.id !== selectedTask?.id),
      completed: completedToday,
      completedSessionsToday,
      focusMinutesToday,
      total: todayTasks.length,
      petLabel: profile.petNickname?.trim() || activePet.name,
      displayName: profile.displayName?.trim() || "You",
    };
  }, [
    focusSessions,
    profile.activePetKey,
    profile.displayName,
    profile.petNickname,
    selectedTaskId,
    tasks,
    today,
  ]);

  useEffect(() => {
    if (timerState === "done") {
      void logFocusSession(focusData.currentTask);
    }
  }, [focusData.currentTask, logFocusSession, timerState]);

  const timerProgress = ((sessionMinutes * 60 - secondsLeft) / (sessionMinutes * 60)) * 100;
  const timerStatusText =
    timerState === "running"
      ? "Stay with this block until the timer ends."
      : timerState === "paused"
        ? "Paused. Restart when you are ready to lock back in."
        : timerState === "done"
          ? "Session complete. Finish the task or reset for another round."
          : "Pick a block length and start a clean focus session.";

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

  const handleSelectPreset = async (minutes: number) => {
    if (timerState === "running") return;

    setSessionMinutes(minutes);
    setSecondsLeft(minutes * 60);
    setTimerState("idle");
    loggedSessionRef.current = false;
    await saveProfile({ focusDurationMinutes: minutes });
  };

  const handleStartPause = async () => {
    await Haptics.selectionAsync();
    if (timerState === "running") {
      setTimerState("paused");
      return;
    }

    if (timerState === "done") {
      setSecondsLeft(sessionMinutes * 60);
    }

    if (timerState === "idle" || timerState === "done") {
      loggedSessionRef.current = false;
    }

    setTimerState("running");
  };

  const handleResetTimer = async () => {
    await Haptics.selectionAsync();
    setTimerState("idle");
    setSecondsLeft(sessionMinutes * 60);
    loggedSessionRef.current = false;
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
        <PetSprite
          petKey={focusData.activePet.key}
          size={78}
          animated
          mood={timerState === "done" ? "happy" : timerState === "paused" ? "tired" : "idle"}
          style={styles.petSprite}
        />
        <Text style={[styles.petName, { color: colors.text }]}>
          {focusData.petLabel} is with {focusData.displayName}
        </Text>
        <Text style={[styles.petCopy, { color: colors.subtle }]}>
          {focusData.completed}/{focusData.total} done today •{" "}
          {focusData.completedSessionsToday.length} clean session
          {focusData.completedSessionsToday.length === 1 ? "" : "s"} •{" "}
          {focusData.focusMinutesToday} focus min
        </Text>
      </View>

      <View style={[styles.timerCard, { backgroundColor: colors.card, shadowColor: colors.tint }]}>
        <Text style={[styles.cardLabel, { color: colors.subtle }]}>Focus Timer</Text>
        <View style={styles.timerPresetRow}>
          {focusPresets.map((minutes) => {
            const selected = sessionMinutes === minutes;
            return (
              <TouchableOpacity
                key={minutes}
                style={[
                  styles.timerPresetChip,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                  selected && {
                    borderColor: colors.tint,
                    backgroundColor: colors.background,
                  },
                ]}
                onPress={() => handleSelectPreset(minutes)}
              >
                <Text style={[styles.timerPresetText, { color: colors.text }]}>
                  {minutes}m
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.timerValue, { color: colors.text }]}>
          {formatClock(secondsLeft)}
        </Text>
        <Text style={[styles.timerStatus, { color: colors.subtle }]}>
          {timerStatusText}
        </Text>

        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.max(0, Math.min(100, timerProgress))}%`,
                backgroundColor: colors.tint,
              },
            ]}
          />
        </View>

        <View style={styles.timerActionRow}>
          <TouchableOpacity
            style={[styles.timerPrimaryButton, { backgroundColor: colors.tint }]}
            onPress={handleStartPause}
          >
            <Text style={styles.primaryButtonText}>
              {timerState === "running" ? "Pause" : timerState === "paused" ? "Resume" : "Start"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.timerSecondaryButton,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={handleResetTimer}
          >
            <Text style={[styles.timerSecondaryText, { color: colors.text }]}>
              Reset
            </Text>
          </TouchableOpacity>
        </View>
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
          <Text style={[styles.currentHint, { color: colors.subtle }]}>
            Give this task one clean block before you decide it needs to move.
            Completing a focus block gives this task an XP bonus.
          </Text>

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
          <Text style={[styles.cardLabel, { color: colors.subtle }]}>Pick A Focus Task</Text>
          {focusData.queue.map((task) => (
            <TouchableOpacity
              key={task.id}
              style={[styles.queueRow, { borderBottomColor: colors.border }]}
              onPress={() => {
                setSelectedTaskId(task.id);
                setTimerState("idle");
                setSecondsLeft(sessionMinutes * 60);
                loggedSessionRef.current = false;
              }}
            >
              <View style={styles.queueCopy}>
                <Text style={[styles.queueTitle, { color: colors.text }]}>{task.title}</Text>
                <Text style={[styles.queueMeta, { color: colors.subtle }]}>{task.time}</Text>
              </View>
              <Text style={[styles.focusNowText, { color: colors.tint }]}>Focus</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={[styles.queueCard, { backgroundColor: colors.card, shadowColor: colors.tint }]}>
        <Text style={[styles.cardLabel, { color: colors.subtle }]}>Focus History</Text>
        {focusSessions
          .slice()
          .sort((a, b) => {
            const getTime = (value: any) =>
              typeof value?.toDate === "function"
                ? value.toDate().getTime()
                : value
                  ? new Date(value).getTime()
                  : 0;
            return getTime(b.completedAt) - getTime(a.completedAt);
          })
          .slice(0, 4)
          .map((session) => (
            <View
              key={session.id}
              style={[styles.historyRow, { borderBottomColor: colors.border }]}
            >
              <View style={styles.queueCopy}>
                <Text style={[styles.queueTitle, { color: colors.text }]}>
                  {session.taskTitle}
                </Text>
                <Text style={[styles.queueMeta, { color: colors.subtle }]}>
                  {session.minutes} min focus block
                </Text>
              </View>
            </View>
          ))}
        {focusSessions.length === 0 && (
          <Text style={[styles.emptyText, { color: colors.subtle }]}>
            Finish a timer and your session history will show up here.
          </Text>
        )}
      </View>

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
  petSprite: {
    marginBottom: 10,
  },
  petName: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 6,
    textAlign: "center",
  },
  petCopy: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  timerCard: {
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
  timerPresetRow: {
    flexDirection: "row",
    marginBottom: 18,
  },
  timerPresetChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginRight: 8,
  },
  timerPresetText: {
    fontSize: 13,
    fontWeight: "700",
  },
  timerValue: {
    fontSize: 48,
    fontWeight: "700",
    marginBottom: 6,
  },
  timerStatus: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 14,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 16,
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
  },
  timerActionRow: {
    flexDirection: "row",
  },
  timerPrimaryButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginRight: 8,
  },
  timerSecondaryButton: {
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  timerSecondaryText: {
    fontWeight: "700",
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
  currentHint: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  focusNowText: {
    fontSize: 13,
    fontWeight: "900",
    marginLeft: 12,
  },
  historyRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
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
