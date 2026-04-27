import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";

import { themeOptions, useAppTheme } from "@/constants/appTheme";
import { PetSprite } from "@/components/pet-sprite";
import {
  PET_TIERS,
  getActivePet,
  getPetProgress,
  getTaskXp,
  getUnlockedPets,
  type PetTier,
} from "@/constants/rewards";
import { Colors, ThemeLabels } from "@/constants/theme";
import { useUserProfile } from "@/hooks/use-user-profile";
import {
  formatDateKey,
  getBehaviorCallout,
  getTimeBucket,
  parseTimeToMinutes,
  recurrenceLabels,
  sortTasksBySchedule,
  type RecurrenceRule,
} from "../../utils/task-helpers";
import {
  cancelTaskNotifications,
  syncMorningSummaryNotification,
  syncTaskNotifications,
} from "../../utils/notifications";
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
  completedAt?: Date | string | null;
  skippedAt?: Date | string | null;
  lastActionAt?: Date | string | null;
  rescheduledCount?: number;
  originalTime?: string;
  recurrence?: RecurrenceRule;
  recurrenceGroupId?: string | null;
};

type EditScope = "single" | "future";

const priorityColors: Record<Priority, string> = {
  Low: "#8dcf9f",
  Medium: "#f2b97f",
  High: "#e58ca8",
};

const priorityRank: Record<Priority, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
};

const bucketLabels: Record<TimeBucket, string> = {
  early: "early morning",
  morning: "morning",
  afternoon: "afternoon",
  evening: "evening",
};

const bucketTemplates: Record<TimeBucket, number[]> = {
  early: [8 * 60, 8 * 60 + 45],
  morning: [9 * 60 + 30, 10 * 60 + 30, 11 * 60 + 30],
  afternoon: [13 * 60, 14 * 60 + 30, 16 * 60],
  evening: [18 * 60, 19 * 60 + 30, 21 * 60],
};

const confettiPalette = [
  "#c4a8d4",
  "#f2b97f",
  "#8dcf9f",
  "#e58ca8",
  "#87c3ff",
  "#f7d56b",
];

const { width: screenWidth } = Dimensions.get("window");

const roundUpToInterval = (value: number, interval: number) =>
  Math.ceil(value / interval) * interval;

const formatMinutesToTime = (minutes: number) => {
  const date = new Date();
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function HomeScreen() {
  const router = useRouter();
  const { themeName, setThemeName } = useAppTheme();
  const { profile, saveProfile } = useUserProfile();
  const colors = Colors[themeName];

  const [tasks, setTasks] = useState<Task[]>([]);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<Task | null>(null);
  const [skipCandidate, setSkipCandidate] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editPriority, setEditPriority] = useState<Priority>("Medium");
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const [petCollectionVisible, setPetCollectionVisible] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [missedTaskPromptVisible, setMissedTaskPromptVisible] = useState(false);
  const [unlockedPet, setUnlockedPet] = useState<PetTier | null>(null);
  const [dismissedMissedPromptDate, setDismissedMissedPromptDate] = useState<string | null>(null);
  const [tasksLoaded, setTasksLoaded] = useState(false);

  const confettiValues = useRef(
    Array.from({ length: 18 }, () => new Animated.Value(-40))
  ).current;
  const hasCelebratedRef = useRef(false);
  const petHydratedRef = useRef(false);
  const previousPetKeyRef = useRef<string | null>(null);

  const getTodayDate = () => formatDateKey(new Date());

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
          (t) =>
            t.date === yesterdayDate &&
            !t.completed &&
            (t.status ?? "pending") !== "skipped"
        );

        for (const task of incompleteTasks) {
          await updateDoc(doc(db, "users", uid, "tasks", task.id), {
            date: todayDate,
            lastActionAt: new Date(),
          });

          await syncTaskNotifications({
            id: task.id,
            title: task.title,
            time: task.time,
            date: todayDate,
            priority: task.priority,
            completed: false,
            status: "pending",
          });
        }

        setTasks(sortTasksBySchedule(fetched));
        setTasksLoaded(true);
      }
    );

    return unsub;
  }, []);

  const today = getTodayDate();
  const todayTasks = tasks.filter((t) => t.date === today);
  const futureTasks = tasks.filter((t) => t.date > today);
  const completed = todayTasks.filter((t) => t.completed).length;
  const progressPercent =
    todayTasks.length > 0 ? (completed / todayTasks.length) * 100 : 0;
  const totalXp = tasks.reduce((sum, task) => sum + getTaskXp(task), 0);
  const todayXp = todayTasks.reduce((sum, task) => sum + getTaskXp(task), 0);
  const petProgress = getPetProgress(totalXp);
  const strongestPet = petProgress.currentPet;
  const activePet = getActivePet(totalXp, profile.activePetKey);
  const unlockedPets = getUnlockedPets(totalXp);
  const behaviorCallout = getBehaviorCallout(tasks, today);

  const adaptiveReschedule = useMemo(() => {
    const historyTasks = tasks.filter((task) => task.date < today);

    const bucketStats: Record<
      TimeBucket,
      { total: number; completed: number; friction: number }
    > = {
      early: { total: 0, completed: 0, friction: 0 },
      morning: { total: 0, completed: 0, friction: 0 },
      afternoon: { total: 0, completed: 0, friction: 0 },
      evening: { total: 0, completed: 0, friction: 0 },
    };

    historyTasks.forEach((task) => {
      const sourceTime = parseTimeToMinutes(task.originalTime ?? task.time);
      const bucket = getTimeBucket(sourceTime);

      bucketStats[bucket].total += 1;
      if (task.completed) bucketStats[bucket].completed += 1;
      if ((task.status ?? "pending") === "skipped" || (task.rescheduledCount ?? 0) > 0) {
        bucketStats[bucket].friction += 1;
      }
    });

    const scoreBucket = (bucket: TimeBucket) => {
      const stat = bucketStats[bucket];
      if (stat.total === 0) return -1;
      const completionRate = stat.completed / stat.total;
      const frictionRate = stat.friction / stat.total;
      return completionRate - frictionRate * 0.35;
    };

    const currentMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    const currentBucket = getTimeBucket(currentMinutes);
    const fallbackOrder: TimeBucket[] =
      currentBucket === "early"
        ? ["morning", "afternoon", "evening", "early"]
        : currentBucket === "morning"
          ? ["morning", "afternoon", "evening", "early"]
          : currentBucket === "afternoon"
            ? ["afternoon", "evening", "morning", "early"]
            : ["evening", "afternoon", "morning", "early"];

    const preferredBuckets = (Object.keys(bucketStats) as TimeBucket[])
      .sort((a, b) => scoreBucket(b) - scoreBucket(a))
      .filter(
        (bucket, index, array) =>
          array.indexOf(bucket) === index
      );

    const mergedBuckets: TimeBucket[] = [];
    [...preferredBuckets, ...fallbackOrder].forEach((bucket) => {
      if (!mergedBuckets.includes(bucket)) mergedBuckets.push(bucket);
    });

    const bestBucket = mergedBuckets[0];
    const bestStats = bucketStats[bestBucket];

    let message = "Reschedules will spread your remaining work into realistic time slots.";
    if (bestStats.total >= 3) {
      message = `You usually follow through better in the ${bucketLabels[bestBucket]}. Reschedules will favor that window first.`;
    }

    return {
      preferredBuckets: mergedBuckets,
      bestBucket,
      message,
    };
  }, [tasks, today]);

  const getMissedTasksForToday = () => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    return todayTasks.filter((task) => {
      if (task.completed) return false;
      if ((task.status ?? "pending") === "skipped") return false;
      const taskMinutes = parseTimeToMinutes(task.time);
      return taskMinutes !== null && taskMinutes + 60 < currentMinutes;
    });
  };

  const missedTasksToday = getMissedTasksForToday();

  const buildAdaptiveTimes = (count: number, excludedIds: Set<string>) => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const earliestMinute = roundUpToInterval(currentMinutes + 30, 15);

    const occupiedMinutes = todayTasks
      .filter((task) => !excludedIds.has(task.id))
      .map((task) => parseTimeToMinutes(task.time))
      .filter((value): value is number => value !== null);

    const assignedMinutes: number[] = [];

    const isAvailable = (minute: number, gap: number) => {
      if (minute < earliestMinute || minute > 23 * 60) return false;
      const clashesWithExisting = occupiedMinutes.some(
        (existing) => Math.abs(existing - minute) < gap
      );
      const clashesWithAssigned = assignedMinutes.some(
        (existing) => Math.abs(existing - minute) < gap
      );
      return !clashesWithExisting && !clashesWithAssigned;
    };

    for (const bucket of adaptiveReschedule.preferredBuckets) {
      for (const templateMinute of bucketTemplates[bucket]) {
        if (assignedMinutes.length >= count) break;
        if (isAvailable(templateMinute, 45)) {
          assignedMinutes.push(templateMinute);
        }
      }
      if (assignedMinutes.length >= count) break;
    }

    for (let minute = earliestMinute; minute <= 23 * 60 && assignedMinutes.length < count; minute += 30) {
      if (isAvailable(minute, 45)) {
        assignedMinutes.push(minute);
      }
    }

    for (let minute = earliestMinute; minute <= 23 * 60 && assignedMinutes.length < count; minute += 30) {
      if (isAvailable(minute, 30)) {
        assignedMinutes.push(minute);
      }
    }

    return assignedMinutes.slice(0, count).map(formatMinutesToTime);
  };

  useEffect(() => {
    const allDone = todayTasks.length > 0 && completed === todayTasks.length;

    if (allDone && !hasCelebratedRef.current) {
      hasCelebratedRef.current = true;
      setShowConfetti(true);

      confettiValues.forEach((value) => value.setValue(-80));

      Animated.stagger(
        45,
        confettiValues.map((value, index) =>
          Animated.timing(value, {
            toValue: 700 + index * 12,
            duration: 1800 + index * 20,
            useNativeDriver: true,
          })
        )
      ).start(() => {
        setTimeout(() => setShowConfetti(false), 400);
      });
    }

    if (!allDone) {
      hasCelebratedRef.current = false;
    }
  }, [completed, confettiValues, todayTasks.length]);

  useEffect(() => {
    if (!tasksLoaded) return;

    const currentPetKey = strongestPet.key;

    if (!petHydratedRef.current) {
      previousPetKeyRef.current = currentPetKey;
      petHydratedRef.current = true;
      return;
    }

    if (previousPetKeyRef.current !== currentPetKey) {
      previousPetKeyRef.current = currentPetKey;
      setUnlockedPet(strongestPet);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [strongestPet, tasksLoaded]);

  useEffect(() => {
    if (
      missedTasksToday.length > 0 &&
      dismissedMissedPromptDate !== today &&
      !missedTaskPromptVisible
    ) {
      setMissedTaskPromptVisible(true);
    }
  }, [dismissedMissedPromptDate, missedTaskPromptVisible, missedTasksToday.length, today]);

  const isRecurringSeriesTask = (task?: Task | null) =>
    !!task?.recurrenceGroupId &&
    !!task?.recurrence &&
    task.recurrence !== "none";

  const getSeriesTasksFromTask = (
    task: Task,
    options?: { includeCurrent?: boolean }
  ) => {
    if (!task.recurrenceGroupId) return [task];

    const includeCurrent = options?.includeCurrent ?? true;

    return tasks
      .filter((candidate) => {
        if (candidate.recurrenceGroupId !== task.recurrenceGroupId) return false;
        if (!includeCurrent && candidate.id === task.id) return false;
        return candidate.date >= task.date;
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (parseTimeToMinutes(a.time) ?? 0) - (parseTimeToMinutes(b.time) ?? 0);
      });
  };

  const deleteSingleTask = async (task: Task) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    await cancelTaskNotifications(task.id);
    await deleteDoc(doc(db, "users", uid, "tasks", task.id));
    await syncMorningSummaryNotification(uid);
  };

  const deleteTaskAndFutureRepeats = async (task: Task) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const targets = getSeriesTasksFromTask(task);
    const batch = writeBatch(db);

    await Promise.all(targets.map((candidate) => cancelTaskNotifications(candidate.id)));

    targets.forEach((candidate) => {
      batch.delete(doc(db, "users", uid, "tasks", candidate.id));
    });

    await batch.commit();
    await syncMorningSummaryNotification(uid);
    setDeleteCandidate(null);
  };

  const endRecurringSeries = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !editingTask || !isRecurringSeriesTask(editingTask)) return;

    const futureRepeats = getSeriesTasksFromTask(editingTask, {
      includeCurrent: false,
    });
    const batch = writeBatch(db);

    batch.update(doc(db, "users", uid, "tasks", editingTask.id), {
      recurrence: "none",
      recurrenceGroupId: null,
      lastActionAt: new Date(),
    });

    await Promise.all(
      futureRepeats.map((candidate) => cancelTaskNotifications(candidate.id))
    );

    futureRepeats.forEach((candidate) => {
      batch.delete(doc(db, "users", uid, "tasks", candidate.id));
    });

    await batch.commit();

    if ((editingTask.status ?? "pending") !== "skipped" && !editingTask.completed) {
      await syncTaskNotifications({
        id: editingTask.id,
        title: editingTask.title,
        time: editingTask.time,
        date: editingTask.date,
        priority: editingTask.priority,
        completed: false,
        status: "pending",
      });
    }

    await syncMorningSummaryNotification(uid);
    closeEditModal();
  };

  const toggleComplete = async (task: Task) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const nextCompleted = !task.completed;

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    await updateDoc(doc(db, "users", uid, "tasks", task.id), {
      completed: nextCompleted,
      status: nextCompleted ? "completed" : "pending",
      completedAt: nextCompleted ? new Date() : null,
      skippedAt: nextCompleted ? null : task.skippedAt ?? null,
      lastActionAt: new Date(),
    });

    if (nextCompleted) {
      await cancelTaskNotifications(task.id);
    } else {
      await syncTaskNotifications({
        id: task.id,
        title: task.title,
        time: task.time,
        date: task.date,
        priority: task.priority,
        completed: false,
        status: "pending",
      });
    }
  };

  const handleSkipTask = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !skipCandidate) return;

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    await updateDoc(doc(db, "users", uid, "tasks", skipCandidate.id), {
      completed: false,
      status: "skipped",
      skippedAt: new Date(),
      lastActionAt: new Date(),
    });

    await cancelTaskNotifications(skipCandidate.id);
    setSkipCandidate(null);
  };

  const handleDelete = async (task: Task) => {
    if (isRecurringSeriesTask(task)) {
      setDeleteCandidate(task);
      return;
    }

    await deleteSingleTask(task);
  };

  const handleSetActivePet = async (pet: PetTier) => {
    await saveProfile({ activePetKey: pet.key });
    await Haptics.selectionAsync();
    setPetCollectionVisible(false);
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

  const saveTaskEdits = async (scope: EditScope = "single") => {
    const uid = auth.currentUser?.uid;
    if (!uid || !editingTask || !editTitle.trim() || !editTime.trim()) return;

    const nextTitle = editTitle.trim();
    const nextTime = editTime.trim();
    const nextNotes = editNotes.trim();
    const nextOriginalTime =
      (editingTask.status ?? "pending") === "pending" && !editingTask.completed
        ? nextTime
        : editingTask.originalTime ?? editingTask.time;

    if (scope === "future" && isRecurringSeriesTask(editingTask)) {
      const targets = getSeriesTasksFromTask(editingTask);
      const batch = writeBatch(db);

      targets.forEach((task) => {
        batch.update(doc(db, "users", uid, "tasks", task.id), {
          title: nextTitle,
          time: nextTime,
          notes: nextNotes,
          priority: editPriority,
          originalTime:
            (task.status ?? "pending") === "pending" && !task.completed
              ? nextTime
              : task.originalTime ?? task.time,
          lastActionAt: new Date(),
        });
      });

      await batch.commit();

      await Promise.all(
        targets.map((task) =>
          (task.status ?? "pending") !== "skipped" && !task.completed
            ? syncTaskNotifications({
                id: task.id,
                title: nextTitle,
                time: nextTime,
                date: task.date,
                priority: editPriority,
                completed: false,
                status: "pending",
              })
            : cancelTaskNotifications(task.id)
        )
      );
    } else {
      await updateDoc(doc(db, "users", uid, "tasks", editingTask.id), {
        title: nextTitle,
        time: nextTime,
        notes: nextNotes,
        priority: editPriority,
        originalTime: nextOriginalTime,
        lastActionAt: new Date(),
      });

      if ((editingTask.status ?? "pending") !== "skipped" && !editingTask.completed) {
        await syncTaskNotifications({
          id: editingTask.id,
          title: nextTitle,
          time: nextTime,
          date: editingTask.date,
          priority: editPriority,
          completed: false,
          status: "pending",
        });
      } else {
        await cancelTaskNotifications(editingTask.id);
      }
    }

    await syncMorningSummaryNotification(uid);
    closeEditModal();
  };

  const resetMyDay = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const remainingTasks = todayTasks
      .filter(
        (task) => !task.completed && (task.status ?? "pending") !== "skipped"
      )
      .sort((a, b) => {
        const rankA = priorityRank[a.priority ?? "Medium"];
        const rankB = priorityRank[b.priority ?? "Medium"];
        if (rankA !== rankB) return rankA - rankB;
        return (parseTimeToMinutes(a.time) ?? 0) - (parseTimeToMinutes(b.time) ?? 0);
      });

    if (remainingTasks.length === 0) return;

    const excludedIds = new Set(remainingTasks.map((task) => task.id));
    const suggestedTimes = buildAdaptiveTimes(remainingTasks.length, excludedIds);

    for (let i = 0; i < remainingTasks.length; i++) {
      const task = remainingTasks[i];
      const updatedTime = suggestedTimes[i] ?? task.time;

      await updateDoc(doc(db, "users", uid, "tasks", task.id), {
        time: updatedTime,
        originalTime: task.originalTime ?? task.time,
        rescheduledCount: (task.rescheduledCount ?? 0) + 1,
        lastActionAt: new Date(),
      });

      await syncTaskNotifications({
        id: task.id,
        title: task.title,
        time: updatedTime,
        date: task.date,
        priority: task.priority,
        completed: false,
        status: "pending",
      });
    }
  };

  const rescheduleMissedTasks = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const missedTasks = [...missedTasksToday].sort((a, b) => {
      const rankA = priorityRank[a.priority ?? "Medium"];
      const rankB = priorityRank[b.priority ?? "Medium"];
      if (rankA !== rankB) return rankA - rankB;
      return (parseTimeToMinutes(a.time) ?? 0) - (parseTimeToMinutes(b.time) ?? 0);
    });

    if (missedTasks.length === 0) {
      setMissedTaskPromptVisible(false);
      return;
    }

    const excludedIds = new Set(missedTasks.map((task) => task.id));
    const suggestedTimes = buildAdaptiveTimes(missedTasks.length, excludedIds);

    for (let i = 0; i < missedTasks.length; i++) {
      const task = missedTasks[i];
      const updatedTime = suggestedTimes[i] ?? task.time;

      await updateDoc(doc(db, "users", uid, "tasks", task.id), {
        time: updatedTime,
        originalTime: task.originalTime ?? task.time,
        rescheduledCount: (task.rescheduledCount ?? 0) + 1,
        lastActionAt: new Date(),
      });

      await syncTaskNotifications({
        id: task.id,
        title: task.title,
        time: updatedTime,
        date: task.date,
        priority: task.priority,
        completed: false,
        status: "pending",
      });
    }

    setMissedTaskPromptVisible(false);
    setDismissedMissedPromptDate(today);
  };

  const dismissMissedPrompt = () => {
    setMissedTaskPromptVisible(false);
    setDismissedMissedPromptDate(today);
  };

  const isCurrentTask = (task: Task) => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const taskMinutes = parseTimeToMinutes(task.time);
    if (taskMinutes === null) return false;
    return taskMinutes <= currentMinutes && currentMinutes < taskMinutes + 60;
  };

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
        <Text style={[styles.priorityText, { color: colors.subtle }]}>
          {value}
        </Text>
      </View>
    );
  };

  const renderRightActions = (task: Task) => (
    <TouchableOpacity
      style={[styles.swipeDelete, { backgroundColor: colors.danger }]}
      onPress={() => handleDelete(task)}
    >
      <Text style={styles.swipeDeleteText}>Delete</Text>
    </TouchableOpacity>
  );

  const renderTask = (item: Task, showDate?: boolean) => {
    const isSkipped = (item.status ?? "pending") === "skipped";

    return (
      <Swipeable
        key={item.id}
        renderRightActions={() => renderRightActions(item)}
        overshootRight={false}
      >
        <View
          style={[
            styles.task,
            { borderBottomColor: colors.border },
            isCurrentTask(item) &&
              !isSkipped && [
                styles.currentTask,
                {
                  backgroundColor: colors.surface,
                  borderLeftColor: colors.tint,
                },
              ],
          ]}
        >
          <TouchableOpacity
            onPress={() => toggleComplete(item)}
            style={styles.checkboxWrap}
          >
            <View
              style={[
                styles.checkbox,
                { borderColor: colors.tint },
                item.completed && {
                  backgroundColor: colors.tint,
                  borderColor: colors.tint,
                },
                isSkipped && {
                  backgroundColor: colors.surface,
                  borderColor: colors.warning,
                },
              ]}
            >
              {item.completed && <Text style={styles.checkmark}>✓</Text>}
              {isSkipped && (
                <Text style={[styles.skipMark, { color: colors.warning }]}>»</Text>
              )}
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
                { color: colors.text },
                (item.completed || isSkipped) && styles.strikethrough,
                (item.completed || isSkipped) && { color: colors.subtle },
              ]}
            >
              {item.title}
            </Text>

            <Text
              style={[
                styles.taskTime,
                { color: colors.subtle },
                isCurrentTask(item) &&
                  !isSkipped && { color: colors.tint, fontWeight: "600" },
              ]}
            >
              {item.time}
              {showDate ? ` · ${item.date}` : ""}
              {isCurrentTask(item) && !showDate && !isSkipped ? " · Now" : ""}
              {isSkipped && !showDate ? " · Skipped" : ""}
            </Text>

            {item.recurrence && item.recurrence !== "none" && (
              <Text style={[styles.taskRecurrence, { color: colors.subtle }]}>
                Repeats {recurrenceLabels[item.recurrence].toLowerCase()}
              </Text>
            )}

            {renderPriority(item.priority)}

            {!!item.notes && (
              <Text
                style={[styles.taskNotes, { color: colors.subtle }]}
                numberOfLines={2}
              >
                {item.notes}
              </Text>
            )}

            {!showDate && !item.completed && !isSkipped && (
              <TouchableOpacity
                style={[
                  styles.skipButton,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => setSkipCandidate(item)}
              >
                <Text style={[styles.skipButtonText, { color: colors.warning }]}>
                  Skip Task
                </Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </View>
      </Swipeable>
    );
  };

  return (
    <>
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        {showConfetti && (
          <View pointerEvents="none" style={styles.confettiLayer}>
            {confettiValues.map((value, index) => (
              <Animated.View
                key={index}
                style={[
                  styles.confettiPiece,
                  {
                    backgroundColor:
                      confettiPalette[index % confettiPalette.length],
                    left: (index * (screenWidth / 18)) % (screenWidth - 20),
                    transform: [
                      { translateY: value },
                      { rotate: `${index * 17}deg` },
                    ],
                  },
                ]}
              />
            ))}
          </View>
        )}

        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View>
              <Text style={[styles.greeting, { color: colors.subtle }]}>
                Good day 🌸
              </Text>
              <Text style={[styles.title, { color: colors.text }]}>Today</Text>
            </View>

            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => setThemeModalVisible(true)}
                style={[styles.iconButton, { backgroundColor: colors.surface }]}
              >
                <Text style={[styles.iconButtonText, { color: colors.subtle }]}>
                  Theme
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push("/settings")}
                style={[styles.iconButton, { backgroundColor: colors.surface }]}
              >
                <Text style={[styles.iconButtonText, { color: colors.subtle }]}>
                  Settings
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View
            style={[
              styles.petCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                shadowColor: colors.tint,
              },
            ]}
          >
            <View style={styles.petCardHeader}>
              <View style={styles.petHero}>
                <PetSprite
                  petKey={activePet.key}
                  size={72}
                  style={styles.petSprite}
                />

                <View style={styles.petCopy}>
                  <Text style={[styles.petEyebrow, { color: colors.subtle }]}>
                    Active Companion
                  </Text>
                  <Text style={[styles.petName, { color: colors.text }]}>
                    {activePet.name}
                  </Text>
                  <Text style={[styles.petDescription, { color: colors.subtle }]}>
                    {activePet.description}
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.petXpPill,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.petXpValue, { color: colors.text }]}>
                  +{todayXp}
                </Text>
                <Text style={[styles.petXpLabel, { color: colors.subtle }]}>
                  today XP
                </Text>
              </View>
            </View>

            <Text style={[styles.petProgressText, { color: colors.subtle }]}>
              {petProgress.nextPet
                ? `Collection progress: ${petProgress.remainingXp} XP until ${petProgress.nextPet.name}`
                : `Collection complete. ${strongestPet.name} is fully unlocked.`}
            </Text>

            <View
              style={[
                styles.progressBarContainer,
                { backgroundColor: colors.border, marginTop: 12 },
              ]}
            >
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${petProgress.progressPercent}%`,
                    backgroundColor: colors.tint,
                  },
                ]}
              />
            </View>

            <View style={styles.petCardFooter}>
              <Text style={[styles.petFooterHint, { color: colors.subtle }]}>
                {unlockedPets.length} of {PET_TIERS.length} companions unlocked
              </Text>

              <TouchableOpacity
                style={[
                  styles.petCollectionButton,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => setPetCollectionVisible(true)}
              >
                <Text style={[styles.petCollectionButtonText, { color: colors.text }]}>
                  Collection
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.petCollectionButton,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    marginLeft: 8,
                  },
                ]}
                onPress={() => router.push("/focus")}
              >
                <Text style={[styles.petCollectionButtonText, { color: colors.text }]}>
                  Focus
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {behaviorCallout && (
            <View
              style={[
                styles.calloutCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.calloutTitle, { color: colors.text }]}>
                {behaviorCallout.title}
              </Text>
              <Text style={[styles.calloutBody, { color: colors.subtle }]}>
                {behaviorCallout.body}
              </Text>
            </View>
          )}

          {todayTasks.length > 0 && (
            <View style={styles.progressSection}>
              <Text style={[styles.progressLabel, { color: colors.subtle }]}>
                {completed}/{todayTasks.length} tasks completed
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
                    {
                      width: `${progressPercent}%`,
                      backgroundColor: colors.tint,
                    },
                  ]}
                />
              </View>
            </View>
          )}

          {todayTasks.some(
            (task) => !task.completed && (task.status ?? "pending") !== "skipped"
          ) && (
            <>
              <TouchableOpacity
                style={[
                  styles.resetButton,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
                onPress={resetMyDay}
              >
                <Text style={[styles.resetButtonText, { color: colors.text }]}>
                  Reset My Day
                </Text>
                <Text style={[styles.resetButtonHint, { color: colors.subtle }]}>
                  Redistribute your remaining tasks into stronger time slots
                </Text>
              </TouchableOpacity>

              <View
                style={[
                  styles.rescheduleInsightCard,
                  { backgroundColor: colors.card, borderColor: colors.tint },
                ]}
              >
                <Text style={[styles.rescheduleInsightTitle, { color: colors.text }]}>
                  Adaptive Reschedule
                </Text>
                <Text
                  style={[styles.rescheduleInsightText, { color: colors.subtle }]}
                >
                  {adaptiveReschedule.message}
                </Text>
              </View>
            </>
          )}

          {missedTasksToday.length > 0 && (
            <View
              style={[
                styles.missedBanner,
                {
                  backgroundColor: "#ffe8f0",
                  borderLeftColor: colors.danger,
                },
              ]}
            >
              <Text
                style={[styles.missedBannerText, { color: colors.danger }]}
              >
                ⚠️ You&apos;ve missed some tasks today. Stay consistent!
              </Text>
            </View>
          )}

          {todayTasks.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>🌤️</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                Today is still wide open
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.subtle }]}>
                Add a few tasks tonight so tomorrow starts with direction.
              </Text>
            </View>
          ) : (
            <View
              style={[
                styles.taskList,
                {
                  backgroundColor: colors.card,
                  shadowColor: colors.tint,
                },
              ]}
            >
              {todayTasks.map((task) => renderTask(task))}
            </View>
          )}

          {futureTasks.length > 0 && (
            <View style={styles.futureSection}>
              <Text style={[styles.futureHeading, { color: colors.text }]}>
                📅 Future Plans
              </Text>
              <View
                style={[
                  styles.taskList,
                  {
                    backgroundColor: colors.card,
                    shadowColor: colors.tint,
                  },
                ]}
              >
                {futureTasks.map((task) => renderTask(task, true))}
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.summaryButton,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() => router.push("/summary")}
          >
            <Text
              style={[styles.summaryButtonText, { color: colors.subtle }]}
            >
              View Day Summary 📋
            </Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>

      <Modal
        visible={petCollectionVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setPetCollectionVisible(false)}
      >
        <View style={styles.centerModalBackdrop}>
          <View style={[styles.collectionCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Pet Collection
            </Text>
            <Text style={[styles.collectionSubtitle, { color: colors.subtle }]}>
              Choose which companion follows you through the app.
            </Text>

            <ScrollView
              style={styles.collectionScroll}
              showsVerticalScrollIndicator={false}
            >
              {unlockedPets.map((pet) => {
                const isActive = activePet.key === pet.key;

                return (
                  <TouchableOpacity
                    key={pet.key}
                    style={[
                      styles.collectionItem,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                      },
                      isActive && {
                        borderColor: colors.tint,
                        backgroundColor: colors.surface,
                      },
                    ]}
                    onPress={() => handleSetActivePet(pet)}
                  >
                    <PetSprite
                      petKey={pet.key}
                      size={52}
                      style={styles.collectionSprite}
                    />

                    <View style={styles.collectionCopy}>
                      <Text style={[styles.collectionName, { color: colors.text }]}>
                        {pet.name}
                      </Text>
                      <Text
                        style={[styles.collectionDescription, { color: colors.subtle }]}
                      >
                        {pet.description}
                      </Text>
                    </View>

                    {isActive && (
                      <View
                        style={[
                          styles.collectionBadge,
                          { backgroundColor: colors.tint },
                        ]}
                      >
                        <Text style={styles.collectionBadgeText}>Active</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}

              {unlockedPets.length < PET_TIERS.length && (
                <View style={styles.lockedSection}>
                  <Text style={[styles.lockedHeading, { color: colors.text }]}>
                    Still Locked
                  </Text>

                  {petProgress.nextPet && (
                    <View
                      style={[
                        styles.collectionItem,
                        styles.collectionLocked,
                        {
                          backgroundColor: colors.background,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <PetSprite
                        petKey={petProgress.nextPet.key}
                        size={52}
                        muted
                        style={styles.collectionSprite}
                      />
                      <View style={styles.collectionCopy}>
                        <Text style={[styles.collectionName, { color: colors.text }]}>
                          {petProgress.nextPet.name}
                        </Text>
                        <Text
                          style={[styles.collectionDescription, { color: colors.subtle }]}
                        >
                          Unlocks at {petProgress.nextPet.unlockXp} XP
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>

            <TouchableOpacity
              style={[
                styles.secondaryButton,
                { backgroundColor: colors.surface, marginTop: 14, marginRight: 0 },
              ]}
              onPress={() => setPetCollectionVisible(false)}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.subtle }]}>
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!unlockedPet}
        animationType="fade"
        transparent
        onRequestClose={() => setUnlockedPet(null)}
      >
        <View style={styles.centerModalBackdrop}>
          <View style={[styles.rewardCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.rewardTag, { color: colors.tint }]}>
              New Companion Unlocked
            </Text>
            {unlockedPet ? (
              <PetSprite
                petKey={unlockedPet.key}
                size={92}
                style={styles.rewardSprite}
              />
            ) : null}
            <Text style={[styles.rewardTitle, { color: colors.text }]}>
              {unlockedPet?.name}
            </Text>
            <Text style={[styles.rewardBody, { color: colors.subtle }]}>
              Your consistency earned a new companion. Keep stacking clean days to
              grow your lineup.
            </Text>

            <TouchableOpacity
              style={[styles.rewardButton, { backgroundColor: colors.tint }]}
              onPress={() => setUnlockedPet(null)}
            >
              <Text style={styles.primaryButtonText}>Keep Going</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!editingTask}
        animationType="slide"
        transparent
        onRequestClose={closeEditModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Edit Task
            </Text>

            <TextInput
              style={[
                styles.modalInput,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Task title"
              placeholderTextColor={colors.subtle}
            />

            <TextInput
              style={[
                styles.modalInput,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              value={editTime}
              onChangeText={setEditTime}
              placeholder="7:00 AM"
              placeholderTextColor={colors.subtle}
            />

            <TextInput
              style={[
                styles.modalInput,
                styles.notesInput,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              value={editNotes}
              onChangeText={setEditNotes}
              placeholder="Optional notes"
              placeholderTextColor={colors.subtle}
              multiline
            />

            <View style={styles.priorityPicker}>
              {(["Low", "Medium", "High"] as Priority[]).map((priority) => (
                <TouchableOpacity
                  key={priority}
                  style={[
                    styles.priorityChip,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                    editPriority === priority && { borderColor: colors.tint },
                  ]}
                  onPress={() => setEditPriority(priority)}
                >
                  <View
                    style={[
                      styles.priorityDot,
                      { backgroundColor: priorityColors[priority] },
                    ]}
                  />
                  <Text
                    style={[styles.priorityChipText, { color: colors.text }]}
                  >
                    {priority}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {isRecurringSeriesTask(editingTask) && (
              <View
                style={[
                  styles.seriesInfoCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.seriesInfoTitle, { color: colors.text }]}>
                  Recurring Series
                </Text>
                <Text style={[styles.seriesInfoBody, { color: colors.subtle }]}>
                  Choose whether your changes should affect only this task or this
                  task and all future repeats.
                </Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[
                  styles.secondaryButton,
                  { backgroundColor: colors.surface },
                ]}
                onPress={closeEditModal}
              >
                <Text
                  style={[
                    styles.secondaryButtonText,
                    { color: colors.subtle },
                  ]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.tint }]}
                onPress={() =>
                  saveTaskEdits(
                    isRecurringSeriesTask(editingTask) ? "single" : "single"
                  )
                }
              >
                <Text style={styles.primaryButtonText}>
                  {isRecurringSeriesTask(editingTask) ? "Save Only This" : "Save"}
                </Text>
              </TouchableOpacity>
            </View>

            {isRecurringSeriesTask(editingTask) && (
              <>
                <TouchableOpacity
                  style={[
                    styles.fullWidthPrimaryButton,
                    { backgroundColor: colors.tint },
                  ]}
                  onPress={() => saveTaskEdits("future")}
                >
                  <Text style={styles.primaryButtonText}>Save This And Future</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.fullWidthOutlineButton,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.warning,
                    },
                  ]}
                  onPress={endRecurringSeries}
                >
                  <Text
                    style={[
                      styles.fullWidthOutlineText,
                      { color: colors.warning },
                    ]}
                  >
                    End Future Repeats
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!deleteCandidate}
        animationType="fade"
        transparent
        onRequestClose={() => setDeleteCandidate(null)}
      >
        <View style={styles.centerModalBackdrop}>
          <View style={[styles.collectionCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Delete Recurring Task
            </Text>
            <Text style={[styles.collectionSubtitle, { color: colors.subtle }]}>
              This task belongs to a recurring series. Keep your history safe by
              deleting just this one, or remove this task and all future repeats.
            </Text>

            <TouchableOpacity
              style={[
                styles.fullWidthOutlineButton,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
              onPress={async () => {
                if (!deleteCandidate) return;
                await deleteSingleTask(deleteCandidate);
                setDeleteCandidate(null);
              }}
            >
              <Text
                style={[
                  styles.fullWidthOutlineText,
                  { color: colors.text },
                ]}
              >
                Delete Only This Task
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.fullWidthPrimaryButton,
                { backgroundColor: colors.danger },
              ]}
              onPress={async () => {
                if (!deleteCandidate) return;
                await deleteTaskAndFutureRepeats(deleteCandidate);
              }}
            >
              <Text style={styles.primaryButtonText}>Delete This And Future</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.secondaryButton,
                { backgroundColor: colors.surface, marginTop: 12, marginRight: 0 },
              ]}
              onPress={() => setDeleteCandidate(null)}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.subtle }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={themeModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setThemeModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.themeCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Choose Theme
            </Text>

            <ScrollView
              style={styles.themeOptionsScroll}
              showsVerticalScrollIndicator={false}
            >
              {themeOptions.map((theme) => {
                const preview = Colors[theme];

                return (
                  <TouchableOpacity
                    key={theme}
                    style={[
                      styles.themeOption,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      },
                      themeName === theme && { borderColor: colors.tint },
                    ]}
                    onPress={async () => {
                      await setThemeName(theme);
                      setThemeModalVisible(false);
                    }}
                  >
                    <View style={styles.themePreview}>
                      <View
                        style={[
                          styles.themeSwatch,
                          {
                            backgroundColor: preview.background,
                            borderColor: preview.border,
                          },
                        ]}
                      />
                      <View
                        style={[
                          styles.themeSwatch,
                          {
                            backgroundColor: preview.card,
                            borderColor: preview.border,
                          },
                        ]}
                      />
                      <View
                        style={[
                          styles.themeSwatch,
                          {
                            backgroundColor: preview.tint,
                            borderColor: preview.tint,
                          },
                        ]}
                      />
                    </View>

                    <Text style={[styles.themeLabel, { color: colors.text }]}>
                      {ThemeLabels[theme]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={[
                styles.secondaryButton,
                { backgroundColor: colors.surface, marginTop: 12 },
              ]}
              onPress={() => setThemeModalVisible(false)}
            >
              <Text
                style={[styles.secondaryButtonText, { color: colors.subtle }]}
              >
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={missedTaskPromptVisible}
        animationType="fade"
        transparent
        onRequestClose={dismissMissedPrompt}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.themeCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Missed Tasks 😬
            </Text>

            <Text style={[styles.missedPromptText, { color: colors.subtle }]}>
              You missed {missedTasksToday.length} task
              {missedTasksToday.length === 1 ? "" : "s"}. Want to
              reschedule them to later today?
            </Text>

            <Text style={[styles.missedPromptSubtext, { color: colors.subtle }]}>
              {adaptiveReschedule.message}
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[
                  styles.secondaryButton,
                  { backgroundColor: colors.surface },
                ]}
                onPress={dismissMissedPrompt}
              >
                <Text
                  style={[
                    styles.secondaryButtonText,
                    { color: colors.subtle },
                  ]}
                >
                  No thanks
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.tint }]}
                onPress={rescheduleMissedTasks}
              >
                <Text style={styles.primaryButtonText}>Reschedule</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!skipCandidate}
        animationType="fade"
        transparent
        onRequestClose={() => setSkipCandidate(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.themeCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Skip This Task?
            </Text>

            <Text style={[styles.missedPromptText, { color: colors.subtle }]}>
              Are you sure? This sounds like an excuse. You can still reschedule
              it instead if the timing is the problem.
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[
                  styles.secondaryButton,
                  { backgroundColor: colors.surface },
                ]}
                onPress={() => setSkipCandidate(null)}
              >
                <Text
                  style={[
                    styles.secondaryButtonText,
                    { color: colors.subtle },
                  ]}
                >
                  Keep It
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.warning }]}
                onPress={handleSkipTask}
              >
                <Text style={styles.primaryButtonText}>Skip</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 16,
  },
  headerActions: {
    flexDirection: "row",
  },
  greeting: { fontSize: 14, marginBottom: 4 },
  title: { fontSize: 32, fontWeight: "700" },
  petCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  petCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  petHero: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 12,
  },
  petEmoji: {
    fontSize: 42,
    marginRight: 14,
  },
  petSprite: {
    marginRight: 14,
  },
  petCopy: {
    flex: 1,
  },
  petEyebrow: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  petName: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 4,
  },
  petDescription: {
    fontSize: 13,
    lineHeight: 19,
  },
  petXpPill: {
    minWidth: 84,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
  },
  petXpValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  petXpLabel: {
    fontSize: 11,
    marginTop: 3,
  },
  petProgressText: {
    fontSize: 13,
    lineHeight: 19,
  },
  petCardFooter: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  petFooterHint: {
    fontSize: 12,
    flex: 1,
    marginRight: 12,
  },
  petCollectionButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
  petCollectionButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  iconButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginLeft: 8,
  },
  iconButtonText: { fontSize: 13, fontWeight: "600" },
  progressSection: { paddingHorizontal: 24, marginBottom: 16 },
  progressLabel: { fontSize: 13, marginBottom: 8 },
  progressBarContainer: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 8,
    borderRadius: 4,
  },
  resetButton: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  resetButtonText: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  resetButtonHint: {
    fontSize: 13,
    lineHeight: 18,
  },
  rescheduleInsightCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  rescheduleInsightTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6,
  },
  rescheduleInsightText: {
    fontSize: 13,
    lineHeight: 19,
  },
  calloutCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 15,
    borderWidth: 1,
  },
  calloutTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6,
  },
  calloutBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  missedBanner: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
  },
  missedBannerText: {
    fontSize: 14,
    fontWeight: "600",
  },
  taskList: {
    paddingHorizontal: 24,
    borderRadius: 20,
    marginHorizontal: 16,
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
  },
  currentTask: {
    borderLeftWidth: 3,
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
    alignItems: "center",
    justifyContent: "center",
  },
  checkmark: { color: "#fff", fontSize: 13, fontWeight: "700" },
  skipMark: { fontSize: 12, fontWeight: "700" },
  taskContent: {
    flex: 1,
    paddingRight: 8,
  },
  taskTitle: { fontSize: 16, fontWeight: "500" },
  strikethrough: { textDecorationLine: "line-through" },
  taskTime: { fontSize: 13, marginTop: 2 },
  taskRecurrence: { fontSize: 12, marginTop: 4 },
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
    fontWeight: "600",
  },
  taskNotes: {
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  skipButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
  },
  skipButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  swipeDelete: {
    justifyContent: "center",
    alignItems: "center",
    width: 96,
    marginVertical: 4,
    borderRadius: 16,
  },
  swipeDeleteText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: "center",
    marginTop: 80,
    paddingHorizontal: 40,
  },
  emptyEmoji: { fontSize: 52, marginBottom: 16 },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  futureSection: {
    marginTop: 32,
  },
  futureHeading: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
    paddingHorizontal: 24,
  },
  summaryButton: {
    marginHorizontal: 16,
    marginTop: 24,
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
  },
  summaryButtonText: { fontWeight: "600", fontSize: 15 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(74, 63, 85, 0.24)",
    justifyContent: "flex-end",
  },
  centerModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(74, 63, 85, 0.24)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  collectionCard: {
    borderRadius: 24,
    padding: 20,
    maxHeight: "78%",
  },
  collectionSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 14,
  },
  collectionScroll: {
    maxHeight: 380,
  },
  collectionItem: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  collectionLocked: {
    opacity: 0.75,
  },
  collectionEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  collectionSprite: {
    marginRight: 12,
  },
  collectionCopy: {
    flex: 1,
    paddingRight: 10,
  },
  collectionName: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  collectionDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  collectionBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  collectionBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  lockedSection: {
    marginTop: 8,
  },
  lockedHeading: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 10,
  },
  rewardCard: {
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
  },
  rewardTag: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  rewardEmoji: {
    fontSize: 64,
    marginBottom: 12,
  },
  rewardSprite: {
    marginBottom: 12,
  },
  rewardTitle: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 10,
  },
  rewardBody: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 20,
  },
  rewardButton: {
    minWidth: 160,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 32,
  },
  seriesInfoCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  seriesInfoTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6,
  },
  seriesInfoBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  themeCard: {
    margin: 20,
    marginTop: "auto",
    borderRadius: 24,
    padding: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 16,
  },
  missedPromptText: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 10,
  },
  missedPromptSubtext: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 20,
  },
  modalInput: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    fontSize: 15,
    marginBottom: 12,
  },
  notesInput: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  priorityPicker: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 20,
  },
  priorityChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 12,
    borderWidth: 1,
    marginHorizontal: 4,
  },
  priorityChipText: {
    fontWeight: "600",
    fontSize: 13,
  },
  modalActions: {
    flexDirection: "row",
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginRight: 6,
  },
  secondaryButtonText: {
    fontWeight: "700",
  },
  primaryButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginLeft: 6,
  },
  fullWidthPrimaryButton: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 12,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  fullWidthOutlineButton: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    borderWidth: 1,
    marginTop: 12,
  },
  fullWidthOutlineText: {
    fontSize: 14,
    fontWeight: "700",
  },
  themeOption: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  themePreview: {
    flexDirection: "row",
    alignItems: "center",
  },
  themeOptionsScroll: {
    maxHeight: 360,
  },
  themeSwatch: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1,
  },
  themeLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
  confettiLayer: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: "none",
    zIndex: 20,
  },
  confettiPiece: {
    position: "absolute",
    top: 0,
    width: 10,
    height: 18,
    borderRadius: 3,
  },
});
