import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, setDoc } from "firebase/firestore";

import { db } from "@/constants/firebaseConfig";
import {
  formatDateKey,
  getRelativeDateLabel,
  parseTimeToMinutes,
  sortTasksBySchedule,
  type TaskPriority,
  type TaskStatus,
} from "@/utils/task-helpers";

export type WidgetSummaryTask = {
  id?: string;
  title: string;
  date: string;
  time: string;
  completed?: boolean;
  status?: TaskStatus;
  priority?: TaskPriority;
};

export type WidgetSummary = {
  date: string;
  total: number;
  completed: number;
  open: number;
  progressPercent: number;
  nextTaskTitle: string;
  nextTaskTime: string | null;
  nextTaskDate: string;
  nextTaskLabel: string;
  highPriorityOpen: number;
  readinessLabel?: string;
  readinessScore?: number;
  petName?: string;
  petKey?: string;
  energyMode?: string;
  themeName?: string;
  smallWidgetLine: string;
  lockScreenLine: string;
  largeWidgetLines: string[];
  updatedAtIso: string;
};

type BuildWidgetSummaryInput = {
  tasks: WidgetSummaryTask[];
  today?: string;
  petName?: string;
  petKey?: string;
  readinessLabel?: string;
  readinessScore?: number;
  energyMode?: string;
  themeName?: string;
};

type SaveWidgetSummaryInput = BuildWidgetSummaryInput & {
  uid?: string | null;
};

const WIDGET_CACHE_PREFIX = "daily-discipline.widget-summary";

const isOpenTask = (task: WidgetSummaryTask) =>
  !task.completed && (task.status ?? "pending") !== "skipped";

const isFutureOrToday = (task: WidgetSummaryTask, today: string) =>
  task.date >= today && isOpenTask(task);

const getWidgetCacheKey = (uid?: string | null) =>
  `${WIDGET_CACHE_PREFIX}.${uid ?? "local"}`;

export const buildWidgetSummary = ({
  tasks,
  today = formatDateKey(new Date()),
  petName,
  petKey,
  readinessLabel,
  readinessScore,
  energyMode,
  themeName,
}: BuildWidgetSummaryInput): WidgetSummary => {
  const todayTasks = sortTasksBySchedule(
    tasks.filter((task) => task.date === today)
  );
  const completed = todayTasks.filter(
    (task) => task.completed || task.status === "completed"
  ).length;
  const openToday = todayTasks.filter(isOpenTask);
  const upcomingTasks = sortTasksBySchedule(
    tasks.filter((task) => isFutureOrToday(task, today))
  ).sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (parseTimeToMinutes(a.time) ?? 0) - (parseTimeToMinutes(b.time) ?? 0);
  });
  const nextTask = openToday[0] ?? upcomingTasks[0] ?? null;
  const progressPercent = todayTasks.length
    ? Math.round((completed / todayTasks.length) * 100)
    : 100;
  const highPriorityOpen = todayTasks.filter(
    (task) => isOpenTask(task) && task.priority === "High"
  ).length;
  const nextTaskTitle = nextTask?.title ?? "All clear";
  const nextTaskTime = nextTask?.time ?? null;
  const nextTaskDate = nextTask?.date ?? today;
  const nextTaskLabel = nextTask
    ? `${getRelativeDateLabel(nextTaskDate)} at ${nextTaskTime}`
    : "No open tasks";
  const smallWidgetLine = nextTask
    ? `${nextTaskTime} • ${nextTaskTitle}`
    : "All clear for today";
  const lockScreenLine = nextTask
    ? `${openToday.length} open • next ${nextTaskTime}`
    : `${completed}/${todayTasks.length} done • clear`;
  const largeWidgetLines = [
    `${completed}/${todayTasks.length} done today`,
    nextTask ? `Next: ${nextTaskTitle}` : "No open tasks left",
    readinessLabel
      ? `${readinessLabel}${readinessScore ? ` • ${readinessScore}/100` : ""}`
      : highPriorityOpen
        ? `${highPriorityOpen} high-priority task${highPriorityOpen === 1 ? "" : "s"} open`
        : "Keep the day clean",
  ];

  return {
    date: today,
    total: todayTasks.length,
    completed,
    open: openToday.length,
    progressPercent,
    nextTaskTitle,
    nextTaskTime,
    nextTaskDate,
    nextTaskLabel,
    highPriorityOpen,
    readinessLabel,
    readinessScore,
    petName,
    petKey,
    energyMode,
    themeName,
    smallWidgetLine,
    lockScreenLine,
    largeWidgetLines,
    updatedAtIso: new Date().toISOString(),
  };
};

export const cacheWidgetSummary = async (
  summary: WidgetSummary,
  uid?: string | null
) => {
  await AsyncStorage.setItem(getWidgetCacheKey(uid), JSON.stringify(summary));
};

export const getCachedWidgetSummary = async (uid?: string | null) => {
  const raw = await AsyncStorage.getItem(getWidgetCacheKey(uid));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as WidgetSummary;
  } catch {
    return null;
  }
};

export const saveWidgetSummary = async ({
  uid,
  ...input
}: SaveWidgetSummaryInput) => {
  const summary = buildWidgetSummary(input);
  await cacheWidgetSummary(summary, uid);

  if (uid) {
    // I write this tiny Firestore document so Cloud Functions, future widgets,
    // and tester dashboards can read the same home-screen snapshot without
    // walking every task document.
    await setDoc(
      doc(db, "users", uid, "widgetSummary", "today"),
      {
        ...summary,
        updatedAt: new Date(),
      },
      { merge: true }
    ).catch(() => {});
  }

  return summary;
};
