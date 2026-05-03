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
  ActivityIndicator,
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
import { AmbientBackground } from "@/components/ambient-background";
import { PetSprite } from "@/components/pet-sprite";
import {
  PET_TIERS,
  getActivePet,
  getPetProgress,
  getTaskXp,
  getUnlockedPets,
  toDateSafe,
  type PetTier,
} from "@/constants/rewards";
import { Colors, ThemeLabels } from "@/constants/theme";
import { useUserProfile } from "@/hooks/use-user-profile";
import {
  formatDateKey,
  getRelativeDateLabel,
  getBehaviorCallout,
  getTimeBucket,
  parseTimeToMinutes,
  recurrenceLabels,
  sortTasksBySchedule,
  type RecurrenceRule,
} from "../../utils/task-helpers";
import {
  getPatternFeedback,
  runAiReschedule,
  type AiHistoryTask,
  type AiRescheduleResult,
  type AiRescheduleTask,
  type PatternFeedbackResult,
} from "../../utils/ai";
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
  recoveryFromDate?: string | null;
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

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

const completionBurstPieces = Array.from({ length: 32 }, (_, index) => {
  const angle = (index / 32) * Math.PI * 2;
  const distance = 72 + (index % 5) * 18;
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    size: 7 + (index % 4) * 2,
    rotation: index * 23,
    color: confettiPalette[index % confettiPalette.length],
  };
});

const victoryBurstPieces = Array.from({ length: 48 }, (_, index) => {
  const angle = (index / 48) * Math.PI * 2;
  const distance = 92 + (index % 6) * 22;
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    size: 8 + (index % 5) * 2,
    rotation: index * 19,
    color: confettiPalette[index % confettiPalette.length],
  };
});

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

const toAiRescheduleTask = (task: Task): AiRescheduleTask => ({
  id: task.id,
  title: task.title,
  date: task.date,
  time: task.time,
  priority: task.priority ?? "Medium",
  completed: task.completed,
  status: task.status ?? "pending",
  rescheduledCount: task.rescheduledCount ?? 0,
});

const serializeDateValue = (value: any) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  return null;
};

const toAiHistoryTask = (task: Task): AiHistoryTask => ({
  id: task.id,
  title: task.title,
  date: task.date,
  time: task.time,
  priority: task.priority ?? "Medium",
  completed: task.completed,
  status: task.status ?? "pending",
  rescheduledCount: task.rescheduledCount ?? 0,
  completedAt: serializeDateValue(task.completedAt),
  skippedAt: serializeDateValue(task.skippedAt),
});

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
  const [completionBurstVisible, setCompletionBurstVisible] = useState(false);
  const [completionBurstTitle, setCompletionBurstTitle] = useState("");
  const [missedTaskPromptVisible, setMissedTaskPromptVisible] = useState(false);
  const [aiRescheduleResult, setAiRescheduleResult] =
    useState<AiRescheduleResult | null>(null);
  const [aiRescheduleBusy, setAiRescheduleBusy] = useState(false);
  const [patternFeedback, setPatternFeedback] =
    useState<PatternFeedbackResult | null>(null);
  const [patternBusy, setPatternBusy] = useState(false);
  const [unlockedPet, setUnlockedPet] = useState<PetTier | null>(null);
  const [dismissedMissedPromptDate, setDismissedMissedPromptDate] = useState<string | null>(null);
  const [tasksLoaded, setTasksLoaded] = useState(false);

  const victoryBurstValue = useRef(new Animated.Value(0)).current;
  const completionBurstValue = useRef(new Animated.Value(0)).current;
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
        const yesterdayDate = formatDateKey(yesterday);
        const todayDate = formatDateKey(new Date());

        const incompleteTasks = fetched.filter(
          (t) =>
            t.date === yesterdayDate &&
            !t.completed &&
            (t.status ?? "pending") !== "skipped"
        );

        for (const task of incompleteTasks) {
          try {
            await updateDoc(doc(db, "users", uid, "tasks", task.id), {
              date: todayDate,
              lastActionAt: new Date(),
              recoveryFromDate: yesterdayDate,
              rescheduledCount: (task.rescheduledCount ?? 0) + 1,
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
          } catch {
            // Ignore permission/network hiccups so the task list can still render.
          }
        }

        setTasks(sortTasksBySchedule(fetched));
        setTasksLoaded(true);
      },
      () => {
        setTasks([]);
        setTasksLoaded(true);
      }
    );

    return unsub;
  }, []);

  const today = getTodayDate();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const todayTasks = useMemo(
    () => tasks.filter((task) => task.date === today),
    [tasks, today]
  );
  const futureTasks = useMemo(
    () => tasks.filter((task) => task.date > today),
    [tasks, today]
  );
  const futureTaskGroups = useMemo(() => {
    const grouped = new Map<string, Task[]>();
    const sortedFutureTasks = [...futureTasks].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (parseTimeToMinutes(a.time) ?? 0) - (parseTimeToMinutes(b.time) ?? 0);
    });

    sortedFutureTasks.forEach((task) => {
      const current = grouped.get(task.date) ?? [];
      grouped.set(task.date, [...current, task]);
    });

    return [...grouped.entries()].map(([date, groupTasks]) => ({
      date,
      label: getRelativeDateLabel(date),
      tasks: groupTasks,
    }));
  }, [futureTasks]);
  const completed = todayTasks.filter((t) => t.completed).length;
  const openTodayTasks = todayTasks.filter(
    (task) => !task.completed && (task.status ?? "pending") !== "skipped"
  ).length;
  const progressPercent =
    todayTasks.length > 0 ? (completed / todayTasks.length) * 100 : 0;
  const totalXp = tasks.reduce((sum, task) => sum + getTaskXp(task), 0);
  const todayXp = todayTasks.reduce((sum, task) => sum + getTaskXp(task), 0);
  const petProgress = getPetProgress(totalXp);
  const strongestPet = petProgress.currentPet;
  const activePet = getActivePet(totalXp, profile.activePetKey);
  const unlockedPets = getUnlockedPets(totalXp);
  const behaviorCallout = getBehaviorCallout(tasks, today);
  const momentumTitle =
    todayTasks.length === 0
      ? "Build a clean target"
      : progressPercent === 100
        ? "Perfect day locked"
        : `${openTodayTasks} move${openTodayTasks === 1 ? "" : "s"} left`;
  const momentumCopy =
    todayTasks.length === 0
      ? "Add one meaningful task and give the day a direction."
      : progressPercent === 100
        ? "Your companion felt that. Stack another clean day tomorrow."
        : "Small wins count. Clear the next task, then let momentum do the rest.";

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

  const missedTasksToday = useMemo(() => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    return todayTasks.filter((task) => {
      if (task.completed) return false;
      if ((task.status ?? "pending") === "skipped") return false;
      const taskMinutes = parseTimeToMinutes(task.time);
      return taskMinutes !== null && taskMinutes + 60 < currentMinutes;
    });
  }, [todayTasks]);
  const recoveryMission = useMemo(() => {
    const yesterday = new Date(`${today}T12:00:00`);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDate = formatDateKey(yesterday);
    const recoveryTasks = todayTasks.filter(
      (task) => task.recoveryFromDate === yesterdayDate
    );
    const openRecoveryTasks = recoveryTasks.filter(
      (task) => !task.completed && (task.status ?? "pending") !== "skipped"
    );
    const yesterdayTasks = tasks.filter((task) => task.date === yesterdayDate);
    const yesterdayMissedTasks = yesterdayTasks.filter(
      (task) => !task.completed && (task.status ?? "pending") !== "skipped"
    );

    if (recoveryTasks.length === 0 && yesterdayMissedTasks.length === 0) {
      return null;
    }

    const completedHighBeforeNoon = todayTasks.some((task) => {
      if (!task.completed || (task.priority ?? "Medium") !== "High") {
        return false;
      }

      const completedAt = toDateSafe(task.completedAt);
      return completedAt ? completedAt.getHours() < 12 : true;
    });
    const recoveredCarriedTask = recoveryTasks.some((task) => task.completed);
    const saved = completedHighBeforeNoon || recoveredCarriedTask;
    const target =
      openRecoveryTasks[0] ??
      todayTasks.find(
        (task) =>
          !task.completed &&
          (task.status ?? "pending") !== "skipped" &&
          (task.priority ?? "Medium") === "High"
      ) ??
      null;

    return {
      missedCount: Math.max(openRecoveryTasks.length, yesterdayMissedTasks.length),
      saved,
      target,
    };
  }, [tasks, today, todayTasks]);
  const todayReadiness = useMemo(() => {
    const highPriorityCount = todayTasks.filter(
      (task) => (task.priority ?? "Medium") === "High"
    ).length;
    const openCount = todayTasks.filter(
      (task) => !task.completed && (task.status ?? "pending") !== "skipped"
    ).length;
    const crowdedSlots = todayTasks.filter((task, index) => {
      const minutes = parseTimeToMinutes(task.time);
      if (minutes === null) return false;

      return todayTasks.some((other, otherIndex) => {
        if (index === otherIndex) return false;
        const otherMinutes = parseTimeToMinutes(other.time);
        return otherMinutes !== null && Math.abs(otherMinutes - minutes) <= 30;
      });
    }).length;
    const issues: string[] = [];

    if (todayTasks.length >= 8) {
      issues.push("too many tasks");
    }
    if (highPriorityCount >= 4) {
      issues.push("too many high priorities");
    }
    if (crowdedSlots >= 2) {
      issues.push("crowded time slots");
    }
    if (missedTasksToday.length > 0) {
      issues.push("missed tasks need recovery");
    }

    const score = Math.max(
      0,
      Math.min(
        100,
        100 -
          Math.max(0, todayTasks.length - 4) * 7 -
          Math.max(0, highPriorityCount - 2) * 10 -
          crowdedSlots * 5 -
          missedTasksToday.length * 12
      )
    );
    const label =
      todayTasks.length === 0
        ? "No plan yet"
        : score >= 85
          ? "Ready"
          : score >= 65
            ? "Manageable"
            : score >= 45
              ? "Heavy"
              : "Overloaded";
    const suggestion =
      todayTasks.length === 0
        ? "Add one meaningful task to give the day direction."
        : issues.length === 0
          ? "The day looks focused. Protect the plan and start with one task."
          : `Watch for ${issues.slice(0, 2).join(" and ")}. Trim or reschedule before momentum drops.`;

    return {
      score,
      label,
      openCount,
      highPriorityCount,
      crowdedSlots,
      suggestion,
    };
  }, [missedTasksToday.length, todayTasks]);
  const petMood =
    todayTasks.length === 0
      ? {
          title: "Curious",
          body: `${activePet.name} is waiting for one clear mission to follow.`,
          tone: colors.warning,
        }
      : missedTasksToday.length > 0
        ? {
            title: "Concerned",
            body: `${activePet.name} noticed a slipped task. Reschedule it before it turns into noise.`,
            tone: colors.danger,
          }
        : progressPercent === 100
          ? {
              title: "Proud",
              body: `${activePet.name} is absolutely glowing. Clean execution hits different.`,
              tone: colors.success,
            }
          : completed > 0
            ? {
                title: "Energized",
                body: `${activePet.name} can feel the momentum. One more task keeps it rolling.`,
                tone: colors.tint,
              }
            : {
                title: "Ready",
                body: `${activePet.name} is warmed up. Start with the smallest task on the list.`,
                tone: colors.tint,
              };

  const patternAction = useMemo(() => {
    const insight = patternFeedback?.insights[0];
    if (!insight) return null;

    const text = `${insight.title} ${insight.body} ${insight.action}`.toLowerCase();

    if (openTodayTasks === 0) {
      return { label: "Add A Task", type: "add" as const };
    }

    if (/move|resched|time|window|crowded|overload|trim/.test(text)) {
      return { label: "Reset My Day", type: "reset" as const };
    }

    if (/focus|block|start|attention/.test(text)) {
      return { label: "Open Focus", type: "focus" as const };
    }

    return { label: "Review Stats", type: "stats" as const };
  }, [openTodayTasks, patternFeedback]);

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

  const loadAiRescheduleSuggestions = async () => {
    if (missedTasksToday.length === 0) {
      setAiRescheduleResult(null);
      return;
    }

    setAiRescheduleBusy(true);

    try {
      const result = await runAiReschedule({
        missedTasks: missedTasksToday.map(toAiRescheduleTask),
        existingTasks: todayTasks.map(toAiRescheduleTask),
        timezone,
      });
      setAiRescheduleResult(result);
    } finally {
      setAiRescheduleBusy(false);
    }
  };

  useEffect(() => {
    const allDone = todayTasks.length > 0 && completed === todayTasks.length;

    if (allDone && !hasCelebratedRef.current) {
      hasCelebratedRef.current = true;
      setShowConfetti(true);
      victoryBurstValue.stopAnimation();
      victoryBurstValue.setValue(0);

      Animated.timing(victoryBurstValue, {
        toValue: 1,
        duration: 1150,
        useNativeDriver: true,
      }).start(() => {
        setTimeout(() => setShowConfetti(false), 200);
      });
    }

    if (!allDone) {
      hasCelebratedRef.current = false;
    }
  }, [completed, todayTasks.length, victoryBurstValue]);

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
    if (!tasksLoaded) return;

    let active = true;
    setPatternBusy(true);

    void getPatternFeedback({
      tasks: tasks.slice(-90).map(toAiHistoryTask),
      timezone,
    })
      .then((result) => {
        if (active) setPatternFeedback(result);
      })
      .finally(() => {
        if (active) setPatternBusy(false);
      });

    return () => {
      active = false;
    };
  }, [tasks, tasksLoaded, timezone]);

  useEffect(() => {
    if (
      missedTasksToday.length > 0 &&
      dismissedMissedPromptDate !== today &&
      !missedTaskPromptVisible
    ) {
      setMissedTaskPromptVisible(true);
      setAiRescheduleResult(null);
      setAiRescheduleBusy(true);
      void runAiReschedule({
        missedTasks: missedTasksToday.map(toAiRescheduleTask),
        existingTasks: todayTasks.map(toAiRescheduleTask),
        timezone,
      })
        .then(setAiRescheduleResult)
        .finally(() => setAiRescheduleBusy(false));
    }
  }, [
    dismissedMissedPromptDate,
    missedTaskPromptVisible,
    missedTasksToday,
    today,
    todayTasks,
    timezone,
  ]);

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

  const triggerCompletionBurst = (taskTitle: string) => {
    completionBurstValue.stopAnimation();
    completionBurstValue.setValue(0);
    setCompletionBurstTitle(taskTitle);
    setCompletionBurstVisible(true);

    Animated.timing(completionBurstValue, {
      toValue: 1,
      duration: 1050,
      useNativeDriver: true,
    }).start(() => {
      setCompletionBurstVisible(false);
    });
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
      triggerCompletionBurst(task.title);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
    const aiSuggestedTimes = new Map(
      (aiRescheduleResult?.suggestions ?? []).map((suggestion) => [
        suggestion.taskId,
        suggestion.suggestedTime,
      ])
    );

    for (let i = 0; i < missedTasks.length; i++) {
      const task = missedTasks[i];
      const updatedTime =
        aiSuggestedTimes.get(task.id) ?? suggestedTimes[i] ?? task.time;

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
    setAiRescheduleResult(null);
    setAiRescheduleBusy(false);
    setDismissedMissedPromptDate(today);
  };

  const dismissMissedPrompt = () => {
    setMissedTaskPromptVisible(false);
    setAiRescheduleResult(null);
    setAiRescheduleBusy(false);
    setDismissedMissedPromptDate(today);
  };

  const isCurrentTask = (task: Task) => {
    if (task.date !== today) return false;

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
          <View
            style={[
              styles.taskPriorityRail,
              { backgroundColor: priorityColors[item.priority ?? "Medium"] },
            ]}
          />

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
        <AmbientBackground colors={colors} variant="signal" />

        {showConfetti && (
          <View pointerEvents="none" style={styles.victoryBurstLayer}>
            <View
              style={[
                styles.victoryBurstOrigin,
                {
                  left: screenWidth / 2,
                  top: screenHeight * 0.36,
                },
              ]}
            >
              <Animated.View
                style={[
                  styles.victoryBurstHalo,
                  {
                    borderColor: colors.tint,
                    opacity: victoryBurstValue.interpolate({
                      inputRange: [0, 0.35, 1],
                      outputRange: [0, 0.72, 0],
                    }),
                    transform: [
                      {
                        scale: victoryBurstValue.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.25, 2.8],
                        }),
                      },
                    ],
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.victoryBurstHalo,
                  styles.victoryBurstHaloDelay,
                  {
                    borderColor: colors.warning,
                    opacity: victoryBurstValue.interpolate({
                      inputRange: [0, 0.48, 1],
                      outputRange: [0, 0.58, 0],
                    }),
                    transform: [
                      {
                        scale: victoryBurstValue.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.15, 3.4],
                        }),
                      },
                    ],
                  },
                ]}
              />

              {victoryBurstPieces.map((piece, index) => {
                const translateX = victoryBurstValue.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, piece.x],
                });
                const translateY = victoryBurstValue.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, piece.y],
                });
                const rotate = victoryBurstValue.interpolate({
                  inputRange: [0, 1],
                  outputRange: [
                    `${piece.rotation}deg`,
                    `${piece.rotation + 420}deg`,
                  ],
                });
                const opacity = victoryBurstValue.interpolate({
                  inputRange: [0, 0.68, 1],
                  outputRange: [1, 1, 0],
                });
                const scale = victoryBurstValue.interpolate({
                  inputRange: [0, 0.16, 1],
                  outputRange: [0.35, 1.18, 0.45],
                });

                return (
                  <Animated.View
                    key={index}
                    style={[
                      styles.victoryBurstPiece,
                      {
                        width: piece.size,
                        height: piece.size + 10,
                        backgroundColor: piece.color,
                        opacity,
                        transform: [
                          { translateX },
                          { translateY },
                          { rotate },
                          { scale },
                        ],
                      },
                    ]}
                  />
                );
              })}

              <Animated.View
                style={[
                  styles.victoryBurstBadge,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.tint,
                    opacity: victoryBurstValue.interpolate({
                      inputRange: [0, 0.15, 0.82, 1],
                      outputRange: [0, 1, 1, 0],
                    }),
                    transform: [
                      {
                        scale: victoryBurstValue.interpolate({
                          inputRange: [0, 0.18, 1],
                          outputRange: [0.72, 1, 0.95],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <Text style={[styles.victoryBurstLabel, { color: colors.tint }]}>
                  Perfect Day
                </Text>
                <Text style={[styles.victoryBurstTitle, { color: colors.text }]}>
                  Full clear complete
                </Text>
              </Animated.View>
            </View>
          </View>
        )}

        {completionBurstVisible && (
          <View pointerEvents="none" style={styles.completionBurstLayer}>
            <View
              style={[
                styles.completionBurstOrigin,
                {
                  left: screenWidth / 2,
                  top: screenHeight * 0.34,
                },
              ]}
            >
              <Animated.View
                style={[
                  styles.completionBurstRing,
                  {
                    borderColor: colors.tint,
                    opacity: completionBurstValue.interpolate({
                      inputRange: [0, 0.42, 1],
                      outputRange: [0, 0.72, 0],
                    }),
                    transform: [
                      {
                        scale: completionBurstValue.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.15, 2.35],
                        }),
                      },
                    ],
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.completionBurstCore,
                  {
                    backgroundColor: colors.tint,
                    opacity: completionBurstValue.interpolate({
                      inputRange: [0, 0.14, 0.58, 1],
                      outputRange: [0.95, 0.65, 0.18, 0],
                    }),
                    transform: [
                      {
                        scale: completionBurstValue.interpolate({
                          inputRange: [0, 0.22, 1],
                          outputRange: [0.55, 1.7, 0.4],
                        }),
                      },
                    ],
                  },
                ]}
              />

              {completionBurstPieces.map((piece, index) => {
                const translateX = completionBurstValue.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, piece.x],
                });
                const translateY = completionBurstValue.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, piece.y],
                });
                const rotate = completionBurstValue.interpolate({
                  inputRange: [0, 1],
                  outputRange: [
                    `${piece.rotation}deg`,
                    `${piece.rotation + 220}deg`,
                  ],
                });
                const scale = completionBurstValue.interpolate({
                  inputRange: [0, 0.18, 1],
                  outputRange: [0.25, 1, 0.55],
                });
                const opacity = completionBurstValue.interpolate({
                  inputRange: [0, 0.7, 1],
                  outputRange: [1, 0.95, 0],
                });

                return (
                  <Animated.View
                    key={index}
                    style={[
                      styles.completionBurstPiece,
                      {
                        width: piece.size,
                        height: piece.size + 8,
                        backgroundColor: piece.color,
                        opacity,
                        transform: [
                          { translateX },
                          { translateY },
                          { rotate },
                          { scale },
                        ],
                      },
                    ]}
                  />
                );
              })}

              <Animated.View
                style={[
                  styles.completionBurstBadge,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.tint,
                    opacity: completionBurstValue.interpolate({
                      inputRange: [0, 0.2, 0.82, 1],
                      outputRange: [0, 1, 1, 0],
                    }),
                    transform: [
                      {
                        translateY: completionBurstValue.interpolate({
                          inputRange: [0, 1],
                          outputRange: [12, -20],
                        }),
                      },
                      {
                        scale: completionBurstValue.interpolate({
                          inputRange: [0, 0.2, 1],
                          outputRange: [0.86, 1, 0.96],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <Text style={[styles.completionBurstLabel, { color: colors.tint }]}>
                  Task Complete
                </Text>
                <Text
                  style={[styles.completionBurstTitle, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {completionBurstTitle}
                </Text>
              </Animated.View>
            </View>
          </View>
        )}

        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={[styles.headerKicker, { color: colors.tint }]}>
                Command Center
              </Text>
              <Text style={[styles.title, { color: colors.text }]}>Today</Text>
              <Text style={[styles.headerSubtitle, { color: colors.subtle }]}>
                Execute the plan, protect momentum, and adjust before the day
                slips.
              </Text>
            </View>

            <View style={styles.headerActions}>
              <View
                style={[
                  styles.headerScoreBadge,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.headerScoreValue, { color: colors.text }]}>
                  {todayReadiness.score}
                </Text>
                <Text style={[styles.headerScoreLabel, { color: colors.subtle }]}>
                  Ready
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setThemeModalVisible(true)}
                style={[styles.iconButton, { backgroundColor: colors.surface }]}
              >
                <Text style={[styles.iconButtonText, { color: colors.subtle }]}>
                  Theme
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View
            style={[
              styles.momentumCard,
              {
                backgroundColor: colors.tint,
                shadowColor: colors.tint,
              },
            ]}
          >
            <View
              style={[
                styles.momentumOrb,
                { backgroundColor: colors.warning },
              ]}
            />
            <View
              style={[
                styles.momentumOrbSmall,
                { backgroundColor: colors.success },
              ]}
            />

            <Text style={styles.momentumEyebrow}>Today&apos;s Momentum</Text>
            <Text style={styles.momentumTitle}>{momentumTitle}</Text>
            <Text style={styles.momentumBody}>{momentumCopy}</Text>

            <View style={styles.momentumStats}>
              <View style={styles.momentumStat}>
                <Text style={styles.momentumStatValue}>{completed}</Text>
                <Text style={styles.momentumStatLabel}>done</Text>
              </View>
              <View style={styles.momentumDivider} />
              <View style={styles.momentumStat}>
                <Text style={styles.momentumStatValue}>+{todayXp}</Text>
                <Text style={styles.momentumStatLabel}>XP</Text>
              </View>
              <View style={styles.momentumDivider} />
              <View style={styles.momentumStat}>
                <Text style={styles.momentumStatValue}>
                  {Math.round(progressPercent)}%
                </Text>
                <Text style={styles.momentumStatLabel}>flow</Text>
              </View>
            </View>

            <View style={styles.momentumTrack}>
              <View
                style={[
                  styles.momentumFill,
                  { width: `${progressPercent}%` },
                ]}
              />
            </View>
          </View>

          <View
            style={[
              styles.readinessCard,
              {
                backgroundColor: colors.card,
                borderColor:
                  todayReadiness.score >= 75 ? colors.success : colors.warning,
                shadowColor: colors.tint,
              },
            ]}
          >
            <View style={styles.readinessHeader}>
              <View>
                <Text style={[styles.readinessEyebrow, { color: colors.tint }]}>
                  Today Readiness
                </Text>
                <Text style={[styles.readinessTitle, { color: colors.text }]}>
                  {todayReadiness.label}
                </Text>
              </View>
              <View
                style={[
                  styles.readinessScorePill,
                  {
                    backgroundColor:
                      todayReadiness.score >= 75
                        ? colors.success
                        : colors.warning,
                  },
                ]}
              >
                <Text style={styles.readinessScoreText}>
                  {todayReadiness.score}%
                </Text>
              </View>
            </View>

            <Text style={[styles.readinessBody, { color: colors.subtle }]}>
              {todayReadiness.suggestion}
            </Text>

            <View style={styles.readinessMetrics}>
              <View style={[styles.readinessMetric, { backgroundColor: colors.surface }]}>
                <Text style={[styles.readinessMetricValue, { color: colors.text }]}>
                  {todayReadiness.openCount}
                </Text>
                <Text style={[styles.readinessMetricLabel, { color: colors.subtle }]}>
                  open
                </Text>
              </View>
              <View style={[styles.readinessMetric, { backgroundColor: colors.surface }]}>
                <Text style={[styles.readinessMetricValue, { color: colors.text }]}>
                  {todayReadiness.highPriorityCount}
                </Text>
                <Text style={[styles.readinessMetricLabel, { color: colors.subtle }]}>
                  high
                </Text>
              </View>
              <View style={[styles.readinessMetric, { backgroundColor: colors.surface }]}>
                <Text style={[styles.readinessMetricValue, { color: colors.text }]}>
                  {todayReadiness.crowdedSlots}
                </Text>
                <Text style={[styles.readinessMetricLabel, { color: colors.subtle }]}>
                  tight
                </Text>
              </View>
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
                  animated
                  mood={progressPercent === 100 ? "happy" : missedTasksToday.length > 0 ? "tired" : "idle"}
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

            <View
              style={[
                styles.petMoodCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: petMood.tone,
                },
              ]}
            >
              <View
                style={[styles.petMoodDot, { backgroundColor: petMood.tone }]}
              />
              <View style={styles.petMoodCopy}>
                <Text style={[styles.petMoodTitle, { color: colors.text }]}>
                  {activePet.name} feels {petMood.title}
                </Text>
                <Text style={[styles.petMoodBody, { color: colors.subtle }]}>
                  {petMood.body}
                </Text>
              </View>
            </View>

            <View style={styles.petCardFooter}>
              <Text style={[styles.petFooterHint, { color: colors.subtle }]}>
                {unlockedPets.length} of {PET_TIERS.length} companions unlocked
              </Text>

              <View style={styles.petFooterActions}>
                <TouchableOpacity
                  style={[
                    styles.petCollectionButton,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => router.push("/pet-home" as never)}
                >
                  <Text style={[styles.petCollectionButtonText, { color: colors.text }]}>
                    Pet Home
                  </Text>
                </TouchableOpacity>

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

          {recoveryMission && (
            <View
              style={[
                styles.recoveryCard,
                {
                  backgroundColor: recoveryMission.saved
                    ? colors.surface
                    : colors.card,
                  borderColor: recoveryMission.saved
                    ? colors.success
                    : colors.warning,
                  shadowColor: colors.tint,
                },
              ]}
            >
              <View style={styles.recoveryHeader}>
                <View>
                  <Text style={[styles.recoveryEyebrow, { color: colors.tint }]}>
                    Streak Protection
                  </Text>
                  <Text style={[styles.recoveryTitle, { color: colors.text }]}>
                    {recoveryMission.saved
                      ? "Recovery saved"
                      : "Recovery mission active"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.recoveryPill,
                    {
                      backgroundColor: recoveryMission.saved
                        ? colors.success
                        : colors.warning,
                    },
                  ]}
                >
                  <Text style={styles.recoveryPillText}>
                    {recoveryMission.saved ? "Protected" : "Open"}
                  </Text>
                </View>
              </View>

              <Text style={[styles.recoveryBody, { color: colors.subtle }]}>
                {recoveryMission.saved
                  ? "You bounced back after a slip. That is the behavior we want to reward."
                  : recoveryMission.target
                    ? `${recoveryMission.missedCount} slipped task${
                        recoveryMission.missedCount === 1 ? "" : "s"
                      } got carried forward. Finish ${recoveryMission.target.title} to protect momentum.`
                    : "Yesterday slipped a bit. Add one recovery task and complete it today to protect momentum."}
              </Text>

              {!recoveryMission.saved && !recoveryMission.target ? (
                <TouchableOpacity
                  style={[
                    styles.recoveryAction,
                    { backgroundColor: colors.tint },
                  ]}
                  onPress={() => router.push("/(tabs)/explore")}
                >
                  <Text style={styles.recoveryActionText}>
                    Add Recovery Task
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          {(patternBusy || (patternFeedback?.insights.length ?? 0) > 0) && (
            <View
              style={[
                styles.patternCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  shadowColor: colors.tint,
                },
              ]}
            >
              <View style={styles.patternHeader}>
                <View>
                  <Text style={[styles.patternEyebrow, { color: colors.tint }]}>
                    AI Pattern Coach
                  </Text>
                  <Text style={[styles.patternTitle, { color: colors.text }]}>
                    {patternBusy
                      ? "Reading your rhythm..."
                      : patternFeedback?.summary ?? "Pattern check ready"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.patternSourcePill,
                    { backgroundColor: colors.surface },
                  ]}
                >
                  <Text
                    style={[styles.patternSourceText, { color: colors.subtle }]}
                  >
                    {patternBusy
                      ? "Live"
                      : patternFeedback?.source === "openai"
                        ? "AI"
                        : patternFeedback?.source === "offline"
                          ? "Offline"
                        : "Local"}
                  </Text>
                </View>
              </View>

              {patternBusy ? (
                <Text style={[styles.patternLoading, { color: colors.subtle }]}>
                  Checking completion windows, skips, and reschedules.
                </Text>
              ) : (
                patternFeedback?.insights.slice(0, 2).map((insight) => (
                  <View
                    key={`${insight.title}-${insight.action}`}
                    style={[
                      styles.patternInsight,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.patternInsightTitle, { color: colors.text }]}>
                      {insight.title}
                    </Text>
                    <Text style={[styles.patternInsightBody, { color: colors.subtle }]}>
                      {insight.body}
                    </Text>
                    <Text style={[styles.patternInsightAction, { color: colors.tint }]}>
                      Try: {insight.action}
                    </Text>
                  </View>
                ))
              )}

              {!patternBusy && patternAction && (
                <View style={styles.patternActionRow}>
                  <TouchableOpacity
                    style={[
                      styles.patternActionButton,
                      { backgroundColor: colors.tint },
                    ]}
                    onPress={() => {
                      if (patternAction.type === "reset") {
                        void resetMyDay();
                        return;
                      }

                      if (patternAction.type === "focus") {
                        router.push("/focus");
                        return;
                      }

                      if (patternAction.type === "add") {
                        router.push("/(tabs)/explore" as never);
                        return;
                      }

                      router.push("/(tabs)/stats" as never);
                    }}
                  >
                    <Text style={styles.patternActionButtonText}>
                      {patternAction.label}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.patternSecondaryButton,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                    onPress={() => router.push("/(tabs)/stats" as never)}
                  >
                    <Text style={[styles.patternSecondaryButtonText, { color: colors.text }]}>
                      Details
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
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

          {!tasksLoaded ? (
            <View
              style={[
                styles.loadingCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  shadowColor: colors.tint,
                },
              ]}
            >
              <ActivityIndicator color={colors.tint} size="small" />
              <Text style={[styles.loadingTitle, { color: colors.text }]}>
                Loading your plan
              </Text>
              <Text style={[styles.loadingText, { color: colors.subtle }]}>
                Pulling tasks, reminders, and reward progress into place.
              </Text>
            </View>
          ) : todayTasks.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>🌤️</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                Today is still wide open
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.subtle }]}>
                Add a few tasks tonight so tomorrow starts with direction.
              </Text>
              <TouchableOpacity
                style={[styles.emptyActionButton, { backgroundColor: colors.tint }]}
                onPress={() => router.push("/(tabs)/explore" as never)}
              >
                <Text style={styles.emptyActionText}>Add First Task</Text>
              </TouchableOpacity>
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

          <TouchableOpacity
            style={[
              styles.weekPlannerButton,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                shadowColor: colors.tint,
              },
            ]}
            onPress={() => router.push("/week" as never)}
          >
            <View style={styles.weekPlannerCopy}>
              <Text style={[styles.weekPlannerTitle, { color: colors.text }]}>
                Week View
              </Text>
              <Text style={[styles.weekPlannerText, { color: colors.subtle }]}>
                Review today, tomorrow, and the next 7 days in order.
              </Text>
            </View>
            <Text style={[styles.weekPlannerArrow, { color: colors.tint }]}>
              Open
            </Text>
          </TouchableOpacity>

          {futureTasks.length > 0 && (
            <View style={styles.futureSection}>
              <Text style={[styles.futureHeading, { color: colors.text }]}>
                📅 Future Plans
              </Text>
              {futureTaskGroups.map((group) => (
                <View key={group.date} style={styles.futureDayGroup}>
                  <View style={styles.futureDayHeader}>
                    <View>
                      <Text style={[styles.futureDayLabel, { color: colors.text }]}>
                        {group.label}
                      </Text>
                      <Text style={[styles.futureDayDate, { color: colors.subtle }]}>
                        {group.date}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.futureDayPill,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.futureDayPillText, { color: colors.subtle }]}>
                        {group.tasks.length} task{group.tasks.length === 1 ? "" : "s"}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.taskList,
                      styles.futureTaskList,
                      {
                        backgroundColor: colors.card,
                        shadowColor: colors.tint,
                      },
                    ]}
                  >
                    {group.tasks.map((task) => renderTask(task, true))}
                  </View>
                </View>
              ))}
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

          <View style={{ height: 120 }} />
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

            {aiRescheduleBusy ? (
              <View
                style={[
                  styles.aiRescheduleCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.aiRescheduleTitle, { color: colors.text }]}>
                  AI is finding cleaner slots...
                </Text>
                <Text style={[styles.aiRescheduleReason, { color: colors.subtle }]}>
                  It is checking your remaining schedule before moving anything.
                </Text>
              </View>
            ) : aiRescheduleResult ? (
              <View
                style={[
                  styles.aiRescheduleCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.tint,
                  },
                ]}
              >
                <Text style={[styles.aiRescheduleTitle, { color: colors.text }]}>
                  AI Reschedule
                </Text>
                <Text style={[styles.aiRescheduleSummary, { color: colors.subtle }]}>
                  {aiRescheduleResult.summary}
                </Text>

                {aiRescheduleResult.suggestions.map((suggestion) => (
                  <View key={suggestion.taskId} style={styles.aiRescheduleItem}>
                    <Text style={[styles.aiRescheduleTask, { color: colors.text }]}>
                      {suggestion.title}
                    </Text>
                    <Text style={[styles.aiRescheduleTime, { color: colors.tint }]}>
                      {suggestion.suggestedTime}
                    </Text>
                    <Text style={[styles.aiRescheduleReason, { color: colors.subtle }]}>
                      {suggestion.reason}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.missedPromptSubtext, { color: colors.subtle }]}>
                {adaptiveReschedule.message}
              </Text>
            )}

            <TouchableOpacity
              style={[
                styles.refreshAiButton,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
              onPress={loadAiRescheduleSuggestions}
              disabled={aiRescheduleBusy}
            >
              <Text style={[styles.refreshAiButtonText, { color: colors.text }]}>
                {aiRescheduleBusy ? "Checking..." : "Refresh AI Suggestion"}
              </Text>
            </TouchableOpacity>

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
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerCopy: {
    flex: 1,
    paddingRight: 14,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerKicker: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 5,
    textTransform: "uppercase",
  },
  title: { fontSize: 34, fontWeight: "900", letterSpacing: -0.7 },
  headerSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  headerScoreBadge: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
    minWidth: 64,
  },
  headerScoreValue: {
    fontSize: 21,
    fontWeight: "900",
    lineHeight: 24,
  },
  headerScoreLabel: {
    fontSize: 10,
    fontWeight: "800",
    marginTop: 1,
    textTransform: "uppercase",
  },
  momentumCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 30,
    padding: 22,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.24,
    shadowRadius: 22,
    elevation: 8,
  },
  momentumOrb: {
    position: "absolute",
    width: 168,
    height: 168,
    borderRadius: 84,
    right: -58,
    top: -66,
    opacity: 0.32,
  },
  momentumOrbSmall: {
    position: "absolute",
    width: 104,
    height: 104,
    borderRadius: 52,
    left: -34,
    bottom: -42,
    opacity: 0.22,
  },
  momentumEyebrow: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  momentumTitle: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "900",
    marginBottom: 8,
  },
  momentumBody: {
    color: "rgba(255,255,255,0.84)",
    fontSize: 14,
    lineHeight: 21,
    maxWidth: "90%",
  },
  momentumStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
    marginBottom: 14,
    borderRadius: 20,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  momentumStat: {
    flex: 1,
    alignItems: "center",
  },
  momentumStatValue: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
  },
  momentumStatLabel: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
    textTransform: "uppercase",
  },
  momentumDivider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  momentumTrack: {
    height: 9,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.24)",
    overflow: "hidden",
  },
  momentumFill: {
    height: 9,
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  readinessCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  readinessHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  readinessEyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 5,
    textTransform: "uppercase",
  },
  readinessTitle: {
    fontSize: 20,
    fontWeight: "900",
  },
  readinessScorePill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  readinessScoreText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  readinessBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  readinessMetrics: {
    flexDirection: "row",
    marginHorizontal: -4,
    marginTop: 14,
  },
  readinessMetric: {
    flex: 1,
    borderRadius: 14,
    padding: 11,
    marginHorizontal: 4,
  },
  readinessMetricValue: {
    fontSize: 20,
    fontWeight: "900",
  },
  readinessMetricLabel: {
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
    textTransform: "uppercase",
  },
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
  petMoodCard: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  petMoodDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
    marginRight: 10,
  },
  petMoodCopy: {
    flex: 1,
  },
  petMoodTitle: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 4,
  },
  petMoodBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  petCardFooter: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  petFooterHint: {
    fontSize: 12,
    flex: 1,
    marginRight: 12,
  },
  petFooterActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 8,
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
  recoveryCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.09,
    shadowRadius: 18,
    elevation: 3,
  },
  recoveryHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  recoveryEyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.9,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  recoveryTitle: {
    fontSize: 18,
    fontWeight: "900",
  },
  recoveryPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  recoveryPillText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  recoveryBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  recoveryAction: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginTop: 12,
  },
  recoveryActionText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  patternCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 4,
  },
  patternHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  patternEyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.9,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  patternTitle: {
    fontSize: 17,
    fontWeight: "800",
    maxWidth: 250,
  },
  patternSourcePill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  patternSourceText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  patternLoading: {
    fontSize: 13,
    lineHeight: 19,
  },
  patternInsight: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginTop: 8,
  },
  patternInsightTitle: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 5,
  },
  patternInsightBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  patternInsightAction: {
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 7,
  },
  patternActionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },
  patternActionButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    marginRight: 8,
  },
  patternActionButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  patternSecondaryButton: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  patternSecondaryButtonText: {
    fontSize: 13,
    fontWeight: "800",
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
  taskPriorityRail: {
    width: 4,
    alignSelf: "stretch",
    borderRadius: 999,
    marginRight: 12,
    opacity: 0.95,
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
  loadingCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 22,
    borderWidth: 1,
    padding: 22,
    alignItems: "center",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  loadingTitle: {
    fontSize: 17,
    fontWeight: "900",
    marginTop: 12,
    marginBottom: 4,
  },
  loadingText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
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
  emptyActionButton: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 11,
    marginTop: 18,
  },
  emptyActionText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
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
  futureDayGroup: {
    marginBottom: 16,
  },
  futureDayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  futureDayLabel: {
    fontSize: 16,
    fontWeight: "800",
  },
  futureDayDate: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  futureDayPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  futureDayPillText: {
    fontSize: 11,
    fontWeight: "800",
  },
  futureTaskList: {
    marginBottom: 0,
  },
  weekPlannerButton: {
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 6,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  weekPlannerCopy: {
    flex: 1,
    paddingRight: 12,
  },
  weekPlannerTitle: {
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 4,
  },
  weekPlannerText: {
    fontSize: 13,
    lineHeight: 18,
  },
  weekPlannerArrow: {
    fontSize: 13,
    fontWeight: "900",
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
  aiRescheduleCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  aiRescheduleTitle: {
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 6,
  },
  aiRescheduleSummary: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
  },
  aiRescheduleItem: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(120, 105, 130, 0.2)",
    paddingTop: 10,
    marginTop: 8,
  },
  aiRescheduleTask: {
    fontSize: 14,
    fontWeight: "700",
  },
  aiRescheduleTime: {
    fontSize: 13,
    fontWeight: "800",
    marginTop: 3,
  },
  aiRescheduleReason: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  refreshAiButton: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 14,
  },
  refreshAiButtonText: {
    fontSize: 13,
    fontWeight: "800",
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
  completionBurstLayer: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: "none",
    zIndex: 30,
  },
  completionBurstOrigin: {
    position: "absolute",
    width: 0,
    height: 0,
  },
  completionBurstRing: {
    position: "absolute",
    left: -54,
    top: -54,
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 3,
  },
  completionBurstCore: {
    position: "absolute",
    left: -34,
    top: -34,
    width: 68,
    height: 68,
    borderRadius: 34,
  },
  completionBurstPiece: {
    position: "absolute",
    left: -4,
    top: -4,
    borderRadius: 999,
  },
  completionBurstBadge: {
    position: "absolute",
    left: -96,
    top: -24,
    width: 192,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 8,
  },
  completionBurstLabel: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  completionBurstTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginTop: 3,
  },
  victoryBurstLayer: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: "none",
    zIndex: 40,
  },
  victoryBurstOrigin: {
    position: "absolute",
    width: 0,
    height: 0,
  },
  victoryBurstHalo: {
    position: "absolute",
    left: -84,
    top: -84,
    width: 168,
    height: 168,
    borderRadius: 84,
    borderWidth: 4,
  },
  victoryBurstHaloDelay: {
    left: -118,
    top: -118,
    width: 236,
    height: 236,
    borderRadius: 118,
    borderWidth: 2,
  },
  victoryBurstPiece: {
    position: "absolute",
    left: -4,
    top: -4,
    borderRadius: 999,
  },
  victoryBurstBadge: {
    position: "absolute",
    left: -118,
    top: -30,
    width: 236,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
  },
  victoryBurstLabel: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  victoryBurstTitle: {
    fontSize: 16,
    fontWeight: "900",
    marginTop: 4,
  },
});
