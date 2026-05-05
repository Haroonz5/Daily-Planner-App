import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  collection,
  doc,
  onSnapshot,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useAppTheme } from "@/constants/appTheme";
import { AmbientBackground } from "@/components/ambient-background";
import { Colors } from "@/constants/theme";
import { useUserProfile } from "@/hooks/use-user-profile";
import {
  breakDownTask,
  parseNaturalTasks,
  runRealityCheck,
  type AiSource,
  type ParsedAiTask,
  type RealityCheckResult,
  type TaskBreakdownResult,
} from "../../utils/ai";
import {
  buildRecurringDates,
  formatDateKey,
  formatRecurrenceLabel,
  formatTimeFromDate,
  getRelativeDateLabel,
  getTimeBucket,
  parseTimeToMinutes,
  recurrenceLabels,
  sortTasksBySchedule,
  type RecurrenceRule,
  type TaskPriority,
  type TaskStatus,
  type TimeBucket,
} from "../../utils/task-helpers";
import {
  syncMorningSummaryNotification,
  syncTaskNotifications,
} from "../../utils/notifications";
import { ensureRollingRoutineTasks } from "../../utils/routines";
import { auth, db } from "../../constants/firebaseConfig";

type Task = {
  id: string;
  title: string;
  time: string;
  date: string;
  completed: boolean;
  priority?: TaskPriority;
  notes?: string;
  status?: TaskStatus;
  rescheduledCount?: number;
  originalTime?: string;
  recurrence?: RecurrenceRule;
  recurrenceGroupId?: string | null;
  recurrenceDays?: number[] | null;
};

type TaskTemplate = {
  id: string;
  title: string;
  notes?: string;
  priority: TaskPriority;
  recurrence: RecurrenceRule;
  time: string;
};

type EnergyMode = "light" | "steady" | "lockedIn";

const energyModeBudgets: Record<
  EnergyMode,
  { label: string; maxMinutes: number; maxTasks: number; copy: string }
> = {
  light: {
    label: "Light Day",
    maxMinutes: 180,
    maxTasks: 3,
    copy: "Keep the plan small and protect the essentials.",
  },
  steady: {
    label: "Steady Day",
    maxMinutes: 360,
    maxTasks: 5,
    copy: "Balanced planning for a normal day.",
  },
  lockedIn: {
    label: "Locked In",
    maxMinutes: 540,
    maxTasks: 8,
    copy: "Higher output, but still avoid fantasy scheduling.",
  },
};

const priorityColors: Record<TaskPriority, string> = {
  Low: "#8dcf9f",
  Medium: "#f2b97f",
  High: "#e58ca8",
};

const bucketLabels: Record<TimeBucket, string> = {
  early: "early morning",
  morning: "morning",
  afternoon: "afternoon",
  evening: "evening",
};

const bucketSuggestedTimes: Record<TimeBucket, string> = {
  early: "8:00 AM",
  morning: "10:00 AM",
  afternoon: "2:00 PM",
  evening: "6:30 PM",
};

const aiPromptExamples = [
  "Gym at 6 PM every day",
  "Study math for 2 hours at 8 PM",
  "Meal prep Sunday at 4 PM",
];

const quickTimePresets = ["8:00 AM", "12:30 PM", "3:30 PM", "6:00 PM", "9:00 PM"];
const TASK_TEMPLATES_KEY = "dailyDisciplineTaskTemplates";
const defaultTaskTemplates: TaskTemplate[] = [
  {
    id: "gym",
    title: "Gym",
    notes: "Show up, warm up, finish the planned workout.",
    priority: "High",
    recurrence: "none",
    time: "6:00 PM",
  },
  {
    id: "study",
    title: "Study block",
    notes: "Pick one subject and remove distractions.",
    priority: "High",
    recurrence: "none",
    time: "8:00 PM",
  },
  {
    id: "meal-prep",
    title: "Meal prep",
    notes: "Prep food so tomorrow is easier.",
    priority: "Medium",
    recurrence: "weekly",
    time: "4:00 PM",
  },
  {
    id: "clean-room",
    title: "Clean room reset",
    notes: "10-minute reset. Trash, clothes, desk.",
    priority: "Low",
    recurrence: "none",
    time: "7:00 PM",
  },
  {
    id: "morning-routine",
    title: "Morning routine",
    notes: "Water, hygiene, quick reset, and one clear intention.",
    priority: "Medium",
    recurrence: "daily",
    time: "8:00 AM",
  },
  {
    id: "deep-work",
    title: "Deep work block",
    notes: "One outcome, phone away, no switching tabs.",
    priority: "High",
    recurrence: "weekdays",
    time: "10:00 AM",
  },
  {
    id: "night-reset",
    title: "Night reset",
    notes: "Review tomorrow, clean one area, set the first task.",
    priority: "Medium",
    recurrence: "daily",
    time: "9:00 PM",
  },
];

const getTaskSaveErrorMessage = (error: any) =>
  error?.code === "permission-denied"
    ? "Firebase blocked saving tasks. Log out and back in, then deploy the latest Firestore rules."
    : error?.message ?? "Something went wrong while saving tasks.";

const getDefaultFutureDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 2);
  date.setHours(12, 0, 0, 0);
  return date;
};

export default function AddTask() {
  const { themeName } = useAppTheme();
  const { profile, saveProfile } = useUserProfile();
  const colors = Colors[themeName];

  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [time, setTime] = useState(new Date());
  const [recurrence, setRecurrence] = useState<RecurrenceRule>("none");
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [futureScheduleVisible, setFutureScheduleVisible] = useState(false);
  const [futureDraftDate, setFutureDraftDate] = useState(getDefaultFutureDate());
  const [futureDraftTime, setFutureDraftTime] = useState(new Date());
  const [showFutureDatePicker, setShowFutureDatePicker] = useState(false);
  const [showFutureTimePicker, setShowFutureTimePicker] = useState(false);
  const [naturalInput, setNaturalInput] = useState("");
  const [parsedTasks, setParsedTasks] = useState<ParsedAiTask[]>([]);
  const [customTemplates, setCustomTemplates] = useState<TaskTemplate[]>([]);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [aiSource, setAiSource] = useState<AiSource | null>(null);
  const [realityCheck, setRealityCheck] = useState<RealityCheckResult | null>(null);
  const [breakdown, setBreakdown] = useState<TaskBreakdownResult | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [breakdownBusy, setBreakdownBusy] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const unsubscribe = onSnapshot(
      collection(db, "users", uid, "tasks"),
      (snap) => {
        const fetched = snap.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        })) as Task[];

        setTasks(sortTasksBySchedule(fetched));
      },
      () => {
        setTasks([]);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    let active = true;

    void AsyncStorage.getItem(TASK_TEMPLATES_KEY).then((raw) => {
      if (!active || !raw) return;

      try {
        setCustomTemplates(JSON.parse(raw) as TaskTemplate[]);
      } catch {
        setCustomTemplates([]);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const selectedDateKey = formatDateKey(selectedDate);
  const selectedDateLabel = getRelativeDateLabel(selectedDateKey);
  const formattedTime = formatTimeFromDate(time);
  const recurringDates = buildRecurringDates(selectedDateKey, recurrence);
  const todayKey = formatDateKey(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowKey = formatDateKey(tomorrowDate);
  const minimumFutureDate = getDefaultFutureDate();
  minimumFutureDate.setHours(0, 0, 0, 0);
  const isCustomFutureDate =
    selectedDateKey !== todayKey && selectedDateKey !== tomorrowKey;
  const futureChipLabel = isCustomFutureDate
    ? selectedDateLabel
    : "Pick Future Day";
  const futureDraftDateKey = formatDateKey(futureDraftDate);
  const futureDraftLabel = getRelativeDateLabel(futureDraftDateKey);
  const futureDraftTimeLabel = formatTimeFromDate(futureDraftTime);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const aiDraftOccurrenceCount = parsedTasks.reduce(
    (sum, task) =>
      sum +
      buildRecurringDates(
        task.date,
        task.recurrence ?? "none",
        task.recurrenceDays
      ).length,
    0
  );
  const templates = [...defaultTaskTemplates, ...customTemplates];
  const energyMode = (profile.energyMode ?? "steady") as EnergyMode;
  const energyBudget = energyModeBudgets[energyMode] ?? energyModeBudgets.steady;

  const planningInsights = useMemo(() => {
    const selectedDayTasks = tasks.filter((task) => task.date === selectedDateKey);
    const historyTasks = tasks.filter((task) => task.date < selectedDateKey);

    const selectedMinutes = parseTimeToMinutes(formattedTime);
    const selectedBucket = getTimeBucket(selectedMinutes);

    const projectedTaskCount = selectedDayTasks.length + (title.trim() ? 1 : 0);
    const projectedHighPriorityCount =
      selectedDayTasks.filter((task) => task.priority === "High").length +
      (title.trim() && priority === "High" ? 1 : 0);

    const closeTasks = selectedDayTasks.filter((task) => {
      const existing = parseTimeToMinutes(task.time);
      if (existing === null || selectedMinutes === null) return false;
      return Math.abs(existing - selectedMinutes) <= 45;
    });

    const warnings: string[] = [];

    if (projectedTaskCount >= 8) {
      warnings.push(
        `${selectedDateLabel} already has ${projectedTaskCount} tasks planned. That may be too much to execute cleanly.`
      );
    }

    if (projectedHighPriorityCount >= 4) {
      warnings.push(
        `${selectedDateLabel} already has ${projectedHighPriorityCount} high-priority tasks. That may be unrealistic for one day.`
      );
    }

    if (closeTasks.length >= 2) {
      warnings.push(
        "This time slot is getting crowded. Give yourself more breathing room between tasks."
      );
    }

    if (
      selectedDateKey === formatDateKey(new Date()) &&
      selectedMinutes !== null &&
      selectedMinutes < new Date().getHours() * 60 + new Date().getMinutes()
    ) {
      warnings.push(
        "That time has already passed today. The task will still be created, but it won't feel like a fresh start."
      );
    }

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
      const baseTime = parseTimeToMinutes(task.originalTime ?? task.time);
      const bucket = getTimeBucket(baseTime);

      bucketStats[bucket].total += 1;
      if (task.completed) bucketStats[bucket].completed += 1;
      if (
        (task.status ?? "pending") === "skipped" ||
        (task.rescheduledCount ?? 0) > 0
      ) {
        bucketStats[bucket].friction += 1;
      }
    });

    const bucketScore = (bucket: TimeBucket) => {
      const stat = bucketStats[bucket];
      if (stat.total === 0) return -1;
      const completionRate = stat.completed / stat.total;
      const frictionRate = stat.friction / stat.total;
      return completionRate - frictionRate * 0.35;
    };

    const bestBucket = (Object.keys(bucketStats) as TimeBucket[]).reduce(
      (best, bucket) => {
        if (!best) return bucket;
        return bucketScore(bucket) > bucketScore(best) ? bucket : best;
      },
      null as TimeBucket | null
    );

    const selectedBucketStats = bucketStats[selectedBucket];
    const bestBucketStats = bestBucket ? bucketStats[bestBucket] : null;

    let suggestion: string | null = null;

    if (
      bestBucket &&
      bestBucket !== selectedBucket &&
      bestBucketStats &&
      bestBucketStats.total >= 3
    ) {
      const currentScore = bucketScore(selectedBucket);
      const bestScore = bucketScore(bestBucket);

      if (bestScore > currentScore + 0.2 || selectedBucketStats.total < 2) {
        suggestion = `You usually follow through better in the ${bucketLabels[bestBucket]}. Consider planning this around ${bucketSuggestedTimes[bestBucket]}.`;
      }
    }

    if (
      selectedBucketStats.total >= 3 &&
      selectedBucketStats.friction / selectedBucketStats.total >= 0.5
    ) {
      warnings.push(
        `You often reschedule or skip tasks planned in the ${bucketLabels[selectedBucket]}.`
      );
    }

    return {
      warnings,
      suggestion,
      dayTaskCount: projectedTaskCount,
      closeTaskCount: closeTasks.length,
    };
  }, [formattedTime, priority, selectedDateKey, selectedDateLabel, tasks, title]);

  const selectedDayTaskCount = tasks.filter(
    (task) => task.date === selectedDateKey
  ).length;

  const resetForm = () => {
    setTitle("");
    setNotes("");
    setPriority("Medium");
    setRecurrence("none");
    setSelectedDate(new Date());
    setTime(new Date());
    setFutureDraftDate(getDefaultFutureDate());
    setFutureDraftTime(new Date());
    setBreakdown(null);
  };

  const openFutureScheduler = () => {
    const baseFutureDate =
      isCustomFutureDate && selectedDate >= minimumFutureDate
        ? new Date(selectedDate)
        : getDefaultFutureDate();

    setFutureDraftDate(baseFutureDate);
    setFutureDraftTime(new Date(time));
    setShowFutureDatePicker(false);
    setShowFutureTimePicker(false);
    setFutureScheduleVisible(true);
  };

  const applyFutureSchedule = () => {
    setSelectedDate(new Date(futureDraftDate));
    setTime(new Date(futureDraftTime));
    setFutureScheduleVisible(false);
    setShowFutureDatePicker(false);
    setShowFutureTimePicker(false);
  };

  const handleParseNaturalTasks = async () => {
    if (!naturalInput.trim()) {
      setError("Type a few tasks first, like: Gym at 6 PM, study at 8 PM.");
      return;
    }

    setAiBusy(true);
    setError("");
    setSuccessMessage("");

    try {
      const result = await parseNaturalTasks({
        text: naturalInput.trim(),
        defaultDate: selectedDateKey,
        timezone,
        existingTasks: tasks.map((task) => ({
          title: task.title,
          date: task.date,
          time: task.time,
          priority: task.priority,
          completed: task.completed,
          status: task.status,
        })),
      });

      setParsedTasks(result.tasks);
      setAiWarnings(result.warnings);
      setAiSource(result.source);

      if (result.tasks.length === 0) {
        setRealityCheck(null);
        setError("I could not turn that into tasks yet. Try adding times with 'at'.");
      } else {
        const check = await runRealityCheck({
          proposedTasks: result.tasks,
          existingTasks: tasks.map((task) => ({
            title: task.title,
            date: task.date,
            time: task.time,
            priority: task.priority,
            completed: task.completed,
            status: task.status,
          })),
          timezone,
        });
        const exceedsEnergy =
          check.totalMinutes > energyBudget.maxMinutes ||
          check.taskCount > energyBudget.maxTasks;

        setRealityCheck(
          exceedsEnergy
            ? {
                ...check,
                severity:
                  check.severity === "clear" ? "watch" : check.severity,
                warnings: [
                  ...check.warnings,
                  `${energyBudget.label} target: ${Math.round(
                    energyBudget.maxMinutes / 60
                  )} hours or ${energyBudget.maxTasks} active tasks.`,
                ],
                suggestions: [
                  ...check.suggestions,
                  "Switch energy mode if you truly have more capacity, or trim the lowest-value task.",
                ],
              }
            : check
        );
      }
    } catch (e: any) {
      setError(e.message ?? "The AI planner could not read that yet.");
    } finally {
      setAiBusy(false);
    }
  };

  const composeParsedNotes = (task: ParsedAiTask) => {
    const noteParts = [
      task.notes?.trim(),
      task.durationMinutes ? `Estimated duration: ${task.durationMinutes} minutes` : "",
    ].filter(Boolean);

    return noteParts.join("\n");
  };

  const formatMinutesAsTaskTime = (minutes: number) => {
    const date = new Date();
    date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    return formatTimeFromDate(date);
  };

  const applyTimePreset = (timeLabel: string) => {
    const minutes = parseTimeToMinutes(timeLabel);
    if (minutes === null) return;

    const nextTime = new Date(time);
    nextTime.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    setTime(nextTime);
  };

  const applyTemplate = (template: TaskTemplate) => {
    setTitle(template.title);
    setNotes(template.notes ?? "");
    setPriority(template.priority);
    setRecurrence(template.recurrence);
    applyTimePreset(template.time);
    setError("");
    setSuccessMessage(`${template.title} template loaded.`);
    setTimeout(() => setSuccessMessage(""), 1800);
  };

  const saveCurrentAsTemplate = async () => {
    if (!title.trim()) {
      setError("Add a task title before saving a template.");
      return;
    }

    const nextTemplate: TaskTemplate = {
      id: `${Date.now()}`,
      title: title.trim(),
      notes: notes.trim(),
      priority,
      recurrence,
      time: formattedTime,
    };
    const deduped = customTemplates.filter(
      (template) => template.title.toLowerCase() !== nextTemplate.title.toLowerCase()
    );
    const nextTemplates = [nextTemplate, ...deduped].slice(0, 8);

    setCustomTemplates(nextTemplates);
    await AsyncStorage.setItem(TASK_TEMPLATES_KEY, JSON.stringify(nextTemplates));
    setError("");
    setSuccessMessage(`${nextTemplate.title} saved as a quick template.`);
    setTimeout(() => setSuccessMessage(""), 2200);
  };

  const removeCustomTemplate = async (templateId: string) => {
    // I added removal for custom templates so saved routines stay useful instead
    // of becoming a cluttered list the user cannot clean up.
    const nextTemplates = customTemplates.filter(
      (template) => template.id !== templateId
    );

    setCustomTemplates(nextTemplates);
    await AsyncStorage.setItem(TASK_TEMPLATES_KEY, JSON.stringify(nextTemplates));
    setSuccessMessage("Custom template removed.");
    setTimeout(() => setSuccessMessage(""), 1800);
  };

  const handleBreakDownTask = async () => {
    if (!title.trim()) {
      setError("Add a task title first, like: Study for biology exam.");
      return;
    }

    setBreakdownBusy(true);
    setError("");
    setSuccessMessage("");

    try {
      const result = await breakDownTask({
        title: title.trim(),
        notes: notes.trim(),
        date: selectedDateKey,
        time: formattedTime,
        priority,
        timezone,
        existingTasks: tasks.map((task) => ({
          title: task.title,
          date: task.date,
          time: task.time,
          priority: task.priority,
          completed: task.completed,
          status: task.status,
        })),
      });

      setBreakdown(result);
    } catch (e: any) {
      setError(e.message ?? "Could not break this task down yet.");
    } finally {
      setBreakdownBusy(false);
    }
  };

  const handleAddBreakdownTasks = async () => {
    if (!breakdown || breakdown.steps.length === 0) {
      setError("Break the task into steps first.");
      return;
    }

    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        setError("You need to be logged in to add tasks.");
        return;
      }

      const batch = writeBatch(db);
      const startMinutes =
        parseTimeToMinutes(formattedTime) ??
        time.getHours() * 60 + time.getMinutes();
      let cursorMinutes = startMinutes;
      const createdTasks: {
        id: string;
        title: string;
        time: string;
        date: string;
        priority: TaskPriority;
      }[] = [];

      breakdown.steps.forEach((step) => {
        const taskRef = doc(collection(db, "users", uid, "tasks"));
        const stepTime = formatMinutesAsTaskTime(
          Math.min(cursorMinutes, 23 * 60 + 45)
        );
        const stepNotes = [
          step.notes,
          `Part of: ${title.trim()}`,
          `Estimated duration: ${step.durationMinutes} minutes`,
        ]
          .filter(Boolean)
          .join("\n");

        batch.set(taskRef, {
          title: step.title.trim(),
          notes: stepNotes,
          priority: step.priority,
          time: stepTime,
          date: selectedDateKey,
          completed: false,
          status: "pending",
          createdAt: new Date(),
          completedAt: null,
          skippedAt: null,
          lastActionAt: new Date(),
          rescheduledCount: 0,
          originalTime: stepTime,
          recurrence: "none",
          recurrenceGroupId: null,
          aiCreated: true,
          breakdownCreated: true,
          parentTaskTitle: title.trim(),
        });

        createdTasks.push({
          id: taskRef.id,
          title: step.title.trim(),
          time: stepTime,
          date: selectedDateKey,
          priority: step.priority,
        });

        cursorMinutes += step.durationMinutes + 10;
      });

      await batch.commit();

      await Promise.all(
        createdTasks.map((task) =>
          syncTaskNotifications({
            ...task,
            completed: false,
            status: "pending",
          })
        )
      ).catch(() => {});

      await syncMorningSummaryNotification(uid).catch(() => {});

      resetForm();
      setError("");
      setSuccessMessage(
        `${createdTasks.length} breakdown step${createdTasks.length === 1 ? "" : "s"} scheduled for ${selectedDateLabel}.`
      );
      setTimeout(() => setSuccessMessage(""), 2600);
    } catch (e: any) {
      setError(getTaskSaveErrorMessage(e));
    }
  };

  const handleAddParsedTasks = async () => {
    if (parsedTasks.length === 0) {
      setError("Use Plan with AI first, then you can add the drafts.");
      return;
    }

    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        setError("You need to be logged in to add tasks.");
        return;
      }

      const batch = writeBatch(db);
      const createdTasks: {
        id: string;
        title: string;
        time: string;
        date: string;
        priority: TaskPriority;
        notes?: string;
        completed: boolean;
        status: TaskStatus;
        recurrence: RecurrenceRule;
        recurrenceGroupId: string | null;
        recurrenceDays?: number[] | null;
      }[] = [];

      parsedTasks.forEach((parsedTask, index) => {
        const safePriority = parsedTask.priority ?? "Medium";
        const taskRecurrence = parsedTask.recurrence ?? "none";
        const taskDates = buildRecurringDates(
          parsedTask.date,
          taskRecurrence,
          parsedTask.recurrenceDays
        );
        const recurrenceGroupId =
          taskRecurrence === "none" ? null : `${uid}-${Date.now()}-ai-${index}`;

        taskDates.forEach((dateKey) => {
          const taskRef = doc(collection(db, "users", uid, "tasks"));

          batch.set(taskRef, {
            title: parsedTask.title.trim(),
            notes: composeParsedNotes(parsedTask),
            priority: safePriority,
            time: parsedTask.time,
            date: dateKey,
            completed: false,
            status: "pending",
            createdAt: new Date(),
            completedAt: null,
            skippedAt: null,
            lastActionAt: new Date(),
            rescheduledCount: 0,
            originalTime: parsedTask.time,
            recurrence: taskRecurrence,
            recurrenceGroupId,
            recurrenceDays:
              taskRecurrence === "custom" ? parsedTask.recurrenceDays ?? [] : null,
            rollingRoutine: taskRecurrence !== "none",
            aiCreated: true,
          });

          createdTasks.push({
            id: taskRef.id,
            title: parsedTask.title.trim(),
            time: parsedTask.time,
            date: dateKey,
            priority: safePriority,
            notes: composeParsedNotes(parsedTask),
            completed: false,
            status: "pending",
            recurrence: taskRecurrence,
            recurrenceGroupId,
            recurrenceDays:
              taskRecurrence === "custom" ? parsedTask.recurrenceDays ?? [] : null,
          });
        });
      });

      await batch.commit();
      await ensureRollingRoutineTasks({
        uid,
        tasks: [...tasks, ...createdTasks],
      }).catch(() => {});

      await Promise.all(
        createdTasks.map((task) =>
          syncTaskNotifications({
            ...task,
            completed: false,
            status: "pending",
          })
        )
      ).catch(() => {});

      await syncMorningSummaryNotification(uid).catch(() => {});

      setNaturalInput("");
      setParsedTasks([]);
      setAiWarnings([]);
      setAiSource(null);
      setRealityCheck(null);
      setError("");
      setSuccessMessage(`${createdTasks.length} AI-planned task${createdTasks.length === 1 ? "" : "s"} added.`);
      setTimeout(() => setSuccessMessage(""), 2600);
    } catch (e: any) {
      setError(getTaskSaveErrorMessage(e));
    }
  };

  const handleAddTask = async () => {
    if (!title.trim()) {
      setError("Please enter a task title");
      return;
    }

    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        setError("You need to be logged in to add a task.");
        return;
      }

      const batch = writeBatch(db);
      const recurrenceGroupId =
        recurrence === "none" ? null : `${uid}-${Date.now()}`;
      const createdTasks: {
        id: string;
        title: string;
        time: string;
        date: string;
        priority: TaskPriority;
        notes?: string;
        completed: boolean;
        status: TaskStatus;
        recurrence: RecurrenceRule;
        recurrenceGroupId: string | null;
        recurrenceDays?: number[] | null;
      }[] = [];

      recurringDates.forEach((dateKey) => {
        const taskRef = doc(collection(db, "users", uid, "tasks"));
        batch.set(taskRef, {
          title: title.trim(),
          notes: notes.trim(),
          priority,
          time: formattedTime,
          date: dateKey,
          completed: false,
          status: "pending",
          createdAt: new Date(),
          completedAt: null,
          skippedAt: null,
          lastActionAt: new Date(),
          rescheduledCount: 0,
          originalTime: formattedTime,
          recurrence,
          recurrenceGroupId,
          recurrenceDays: null,
          rollingRoutine: recurrence !== "none",
        });

        createdTasks.push({
          id: taskRef.id,
          title: title.trim(),
          time: formattedTime,
          date: dateKey,
          priority,
          notes: notes.trim(),
          completed: false,
          status: "pending",
          recurrence,
          recurrenceGroupId,
          recurrenceDays: null,
        });
      });

      await batch.commit();
      await ensureRollingRoutineTasks({
        uid,
        tasks: [...tasks, ...createdTasks],
      }).catch(() => {});

      await Promise.all(
        createdTasks.map((task) =>
          syncTaskNotifications({
            ...task,
            completed: false,
            status: "pending",
          })
        )
      ).catch(() => {});

      await syncMorningSummaryNotification(uid).catch(() => {});

      resetForm();
      setError("");

      const success =
        recurrence === "none"
          ? `Task scheduled for ${selectedDateLabel}.`
          : `${createdTasks.length} ${recurrenceLabels[recurrence].toLowerCase()} tasks scheduled starting ${selectedDateLabel}.`;

      setSuccessMessage(success);
      setTimeout(() => setSuccessMessage(""), 2600);
    } catch (e: any) {
      setError(getTaskSaveErrorMessage(e));
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <AmbientBackground colors={colors} variant="focus" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={[styles.headerKicker, { color: colors.tint }]}>
              Planner
            </Text>
            <Text style={[styles.title, { color: colors.text }]}>Add Task</Text>
            <Text style={[styles.subtitle, { color: colors.subtle }]}>
              Plan one task, repeat a routine, or let AI turn messy notes into
              a schedule.
            </Text>
          </View>

          <View
            style={[
              styles.headerBadge,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.headerBadgeValue, { color: colors.text }]}>
              {tasks.filter((task) => task.date >= todayKey).length}
            </Text>
            <Text style={[styles.headerBadgeLabel, { color: colors.subtle }]}>
              Planned
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.plannerHero,
            { backgroundColor: colors.tint, shadowColor: colors.tint },
          ]}
        >
          <View
            style={[
              styles.plannerHeroGlow,
              { backgroundColor: colors.warning },
            ]}
          />
          <Text style={styles.plannerHeroKicker}>Smart Planning</Text>
          <Text style={styles.plannerHeroTitle}>Make it doable before you start</Text>
          <Text style={styles.plannerHeroBody}>
            Turn messy ideas into tasks, break big work into steps, and reality-check the day before it gets overloaded.
          </Text>

          <View style={styles.plannerHeroStats}>
            <View style={styles.plannerHeroStat}>
              <Text style={styles.plannerHeroStatValue}>
                {planningInsights.dayTaskCount}
              </Text>
              <Text style={styles.plannerHeroStatLabel}>day load</Text>
            </View>
            <View style={styles.plannerHeroDivider} />
            <View style={styles.plannerHeroStat}>
              <Text style={styles.plannerHeroStatValue}>
                {planningInsights.closeTaskCount}
              </Text>
              <Text style={styles.plannerHeroStatLabel}>nearby</Text>
            </View>
            <View style={styles.plannerHeroDivider} />
            <View style={styles.plannerHeroStat}>
              <Text style={styles.plannerHeroStatValue}>
                {recurringDates.length}
              </Text>
              <Text style={styles.plannerHeroStatLabel}>creates</Text>
            </View>
          </View>
        </View>

        <View
          style={[
            styles.energyPlannerCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowColor: colors.tint,
            },
          ]}
        >
          <View style={styles.energyPlannerHeader}>
            <View style={styles.energyPlannerCopy}>
              <Text style={[styles.energyPlannerEyebrow, { color: colors.tint }]}>
                Mood-Based Planning
              </Text>
              <Text style={[styles.energyPlannerTitle, { color: colors.text }]}>
                {energyBudget.label}
              </Text>
              <Text style={[styles.energyPlannerBody, { color: colors.subtle }]}>
                {energyBudget.copy} AI reality checks will compare drafts against this capacity.
              </Text>
            </View>
            <View
              style={[
                styles.energyPlannerPill,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.energyPlannerPillText, { color: colors.subtle }]}>
                {Math.round(energyBudget.maxMinutes / 60)}h max
              </Text>
            </View>
          </View>

          <View style={styles.energyPlannerChips}>
            {(Object.keys(energyModeBudgets) as EnergyMode[]).map((mode) => {
              const selected = mode === energyMode;
              return (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.energyPlannerChip,
                    {
                      backgroundColor: selected ? colors.tint : colors.surface,
                      borderColor: selected ? colors.tint : colors.border,
                    },
                  ]}
                  onPress={() => saveProfile({ energyMode: mode })}
                >
                  <Text
                    style={[
                      styles.energyPlannerChipText,
                      { color: selected ? "#fff" : colors.text },
                    ]}
                  >
                    {energyModeBudgets[mode].label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View
          style={[
            styles.templateCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowColor: colors.tint,
            },
          ]}
        >
          <View style={styles.templateHeader}>
            <View>
              <Text style={[styles.templateEyebrow, { color: colors.tint }]}>
                Task Templates
              </Text>
              <Text style={[styles.templateTitle, { color: colors.text }]}>
                One-tap routines
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.saveTemplateButton,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              onPress={saveCurrentAsTemplate}
            >
              <Text style={[styles.saveTemplateText, { color: colors.text }]}>
                Save Current
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.templateGrid}>
            {templates.map((template) => {
              const isCustomTemplate = customTemplates.some(
                (customTemplate) => customTemplate.id === template.id
              );

              return (
                <TouchableOpacity
                  key={template.id}
                  style={[
                    styles.templateTile,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => applyTemplate(template)}
                >
                  <Text style={[styles.templateTileTitle, { color: colors.text }]}>
                    {template.title}
                  </Text>
                  <Text style={[styles.templateTileMeta, { color: colors.subtle }]}>
                    {template.time} • {recurrenceLabels[template.recurrence]}
                  </Text>
                  {isCustomTemplate ? (
                    <TouchableOpacity
                      style={[
                        styles.templateRemoveButton,
                        { backgroundColor: colors.surface },
                      ]}
                      onPress={() => removeCustomTemplate(template.id)}
                    >
                      <Text style={[styles.templateRemoveText, { color: colors.warning }]}>
                        Remove
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View
          style={[
            styles.aiCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.aiTitle, { color: colors.text }]}>
            Quick Add with AI
          </Text>
          <Text style={[styles.aiSubtitle, { color: colors.subtle }]}>
            Type multiple tasks in one sentence and review the schedule before adding.
          </Text>

          <View style={styles.exampleRow}>
            {aiPromptExamples.map((example) => (
              <TouchableOpacity
                key={example}
                style={[
                  styles.exampleChip,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => setNaturalInput(example)}
              >
                <Text style={[styles.exampleChipText, { color: colors.text }]}>
                  {example}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={[
              styles.aiInput,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            placeholder="Gym at 6 PM, study for 2 hours at 8 PM"
            placeholderTextColor={colors.subtle}
            value={naturalInput}
            onChangeText={setNaturalInput}
            multiline
          />

          <View style={styles.aiActionRow}>
            <TouchableOpacity
              style={[styles.aiSecondaryButton, { backgroundColor: colors.surface }]}
              onPress={() => {
                setNaturalInput("");
                setParsedTasks([]);
                setAiWarnings([]);
                setAiSource(null);
                setRealityCheck(null);
              }}
              disabled={aiBusy}
            >
              <Text style={[styles.aiSecondaryText, { color: colors.subtle }]}>
                Clear
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.aiPrimaryButton, { backgroundColor: colors.tint }]}
              onPress={handleParseNaturalTasks}
              disabled={aiBusy}
            >
              <Text style={styles.aiPrimaryText}>
                {aiBusy ? "Planning..." : "Plan with AI"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* I added this status card so we can tell whether the task plan came
              from Gemini/OpenAI, the backend fallback, or the phone's offline planner. */}
          {(aiBusy || aiSource) && (
            <View
              style={[
                styles.aiStatusCard,
                {
                  backgroundColor: colors.surface,
                  borderColor:
                    aiSource === "offline" ? colors.warning : colors.border,
                },
              ]}
            >
              <Text style={[styles.aiStatusTitle, { color: colors.text }]}>
                {aiBusy
                  ? "Building your task plan..."
                  : aiSource === "openai" || aiSource === "gemini"
                    ? "AI plan ready"
                    : aiSource === "local"
                      ? "Backend planner used"
                      : "Backend offline - using built-in planner"}
              </Text>
              <Text style={[styles.aiStatusBody, { color: colors.subtle }]}>
                {aiBusy
                  ? "Checking the text, dates, times, and whether the day is realistic."
                  : aiSource === "openai" || aiSource === "gemini"
                    ? `The backend used ${aiSource === "gemini" ? "Gemini" : "OpenAI"} to understand your tasks and check the schedule.`
                    : aiSource === "local"
                      ? "The backend is online but no model key is configured. Add GEMINI_API_KEY or OPENAI_API_KEY in ai/.env when you want model-powered responses."
                      : "Your tasks still work. To use the real backend on your phone, run the Python AI server and restart Expo with npm run start:ai."}
              </Text>
            </View>
          )}

          {parsedTasks.length > 0 && (
            <View style={styles.aiPreviewWrap}>
              <View style={styles.aiPreviewHeader}>
                <Text style={[styles.aiPreviewTitle, { color: colors.text }]}>
                  AI Drafts
                </Text>
                {aiSource ? (
                  <Text style={[styles.aiSourceText, { color: colors.subtle }]}>
                    {aiSource === "openai" || aiSource === "gemini"
                      ? aiSource === "gemini"
                        ? "Gemini"
                        : "AI"
                      : aiSource === "offline"
                        ? "Offline"
                        : "Backend"} planner
                  </Text>
                ) : null}
              </View>

              {parsedTasks.map((task, index) => (
                <View
                  key={`${task.title}-${task.date}-${task.time}-${index}`}
                  style={[
                    styles.aiParsedTask,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.aiParsedTopRow}>
                    <Text style={[styles.aiParsedTitle, { color: colors.text }]}>
                      {task.title}
                    </Text>
                    <Text style={[styles.aiParsedPriority, { color: colors.subtle }]}>
                      {task.priority}
                    </Text>
                  </View>
                  <Text style={[styles.aiParsedMeta, { color: colors.subtle }]}>
                    {getRelativeDateLabel(task.date)} at {task.time}
                    {task.durationMinutes ? ` • ${task.durationMinutes} min` : ""}
                  </Text>
                  {task.recurrence && task.recurrence !== "none" && (
                    <Text style={[styles.aiParsedRepeat, { color: colors.tint }]}>
                      Repeats{" "}
                      {formatRecurrenceLabel(
                        task.recurrence,
                        task.recurrenceDays
                      ).toLowerCase()}{" "}
                      · creates{" "}
                      {
                        buildRecurringDates(
                          task.date,
                          task.recurrence,
                          task.recurrenceDays
                        ).length
                      }{" "}
                      tasks
                    </Text>
                  )}
                </View>
              ))}

              {aiWarnings.map((warning) => (
                <Text
                  key={warning}
                  style={[styles.aiWarningText, { color: colors.warning }]}
                >
                  {warning}
                </Text>
              ))}

              {realityCheck && (
                <View
                  style={[
                    styles.realityCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor:
                        realityCheck.severity === "overloaded"
                          ? colors.danger
                          : realityCheck.severity === "watch"
                            ? colors.warning
                            : colors.success,
                    },
                  ]}
                >
                  <View style={styles.realityHeader}>
                    <Text style={[styles.realityTitle, { color: colors.text }]}>
                      Reality Check
                    </Text>
                    <Text
                      style={[
                        styles.realityBadge,
                        {
                          color:
                            realityCheck.severity === "overloaded"
                              ? colors.danger
                              : realityCheck.severity === "watch"
                                ? colors.warning
                                : colors.success,
                        },
                      ]}
                    >
                      {realityCheck.severity === "overloaded"
                        ? "Too Heavy"
                        : realityCheck.severity === "watch"
                          ? "Watch"
                          : "Clear"}
                    </Text>
                  </View>

                  <Text style={[styles.realitySummary, { color: colors.text }]}>
                    {realityCheck.summary}
                  </Text>
                  <Text style={[styles.realityMeta, { color: colors.subtle }]}>
                    {Math.round((realityCheck.totalMinutes / 60) * 10) / 10} hours
                    planned • {realityCheck.taskCount} active task
                    {realityCheck.taskCount === 1 ? "" : "s"}
                  </Text>

                  {realityCheck.warnings.map((warning) => (
                    <Text
                      key={warning}
                      style={[styles.realityLine, { color: colors.subtle }]}
                    >
                      {warning}
                    </Text>
                  ))}

                  {realityCheck.suggestions.map((suggestion) => (
                    <Text
                      key={suggestion}
                      style={[styles.realityLine, { color: colors.text }]}
                    >
                      {suggestion}
                    </Text>
                  ))}

                  {realityCheck.suggestedTrimTitles.length > 0 && (
                    <TouchableOpacity
                      style={[
                        styles.trimButton,
                        { backgroundColor: colors.background },
                      ]}
                      onPress={() => {
                        const trimSet = new Set(realityCheck.suggestedTrimTitles);
                        const trimmedTasks = parsedTasks.filter(
                          (task) => !trimSet.has(task.title)
                        );

                        setParsedTasks(trimmedTasks);
                        setRealityCheck(
                          trimmedTasks.length === 0
                            ? null
                            : {
                                ...realityCheck,
                                summary:
                                  "Trim candidates removed. Run Plan with AI again if you want a fresh check.",
                                warnings: [],
                                suggestions: [
                                  "Review the remaining tasks before adding them.",
                                ],
                                suggestedTrimTitles: [],
                                severity: "watch",
                              }
                        );
                      }}
                    >
                      <Text style={[styles.trimButtonText, { color: colors.text }]}>
                        Remove suggested trim candidates
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.aiAddButton,
                  {
                    backgroundColor:
                      realityCheck?.severity === "overloaded"
                        ? colors.warning
                        : colors.tint,
                  },
                ]}
                onPress={handleAddParsedTasks}
              >
                <Text style={styles.aiPrimaryText}>
                  {realityCheck?.severity === "overloaded"
                    ? "Add Anyway"
                    : `Add ${aiDraftOccurrenceCount} Scheduled Task${aiDraftOccurrenceCount === 1 ? "" : "s"}`}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
          placeholder="What do you need to do?"
          placeholderTextColor={colors.subtle}
          value={title}
          onChangeText={setTitle}
        />

        <TextInput
          style={[
            styles.input,
            styles.notesInput,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
          placeholder="Optional notes or extra detail"
          placeholderTextColor={colors.subtle}
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        <View
          style={[
            styles.scheduleSnapshot,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowColor: colors.tint,
            },
          ]}
        >
          <View style={styles.scheduleSnapshotHeader}>
            <View>
              <Text style={[styles.snapshotKicker, { color: colors.tint }]}>
                Schedule Snapshot
              </Text>
              <Text style={[styles.snapshotTitle, { color: colors.text }]}>
                {selectedDateLabel} at {formattedTime}
              </Text>
            </View>
            <View
              style={[
                styles.snapshotPill,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.snapshotPillText, { color: colors.subtle }]}>
                {priority}
              </Text>
            </View>
          </View>

          <View style={styles.snapshotMetricRow}>
            <View style={[styles.snapshotMetric, { backgroundColor: colors.surface }]}>
              <Text style={[styles.snapshotMetricValue, { color: colors.text }]}>
                {selectedDayTaskCount}
              </Text>
              <Text style={[styles.snapshotMetricLabel, { color: colors.subtle }]}>
                already planned
              </Text>
            </View>
            <View style={[styles.snapshotMetric, { backgroundColor: colors.surface }]}>
              <Text style={[styles.snapshotMetricValue, { color: colors.text }]}>
                {recurringDates.length}
              </Text>
              <Text style={[styles.snapshotMetricLabel, { color: colors.subtle }]}>
                will create
              </Text>
            </View>
          </View>

          <Text style={[styles.snapshotHint, { color: colors.subtle }]}>
            {planningInsights.warnings.length > 0
              ? "The app spotted some friction below. Adjust before adding if you want a cleaner day."
              : "This plan looks clean so far. Keep it realistic and specific."}
          </Text>
        </View>

        <View
          style={[
            styles.breakdownCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.breakdownHeader}>
            <View>
              <Text style={[styles.breakdownTitle, { color: colors.text }]}>
                Task Breakdown
              </Text>
              <Text style={[styles.breakdownSubtitle, { color: colors.subtle }]}>
                Turn a big task into smaller scheduled steps.
              </Text>
            </View>

            {breakdown ? (
              <Text style={[styles.breakdownSource, { color: colors.subtle }]}>
                {breakdown.source === "openai" || breakdown.source === "gemini"
                  ? "AI"
                  : "Local"}
              </Text>
            ) : null}
          </View>

          <TouchableOpacity
            style={[
              styles.breakdownButton,
              { backgroundColor: colors.surface },
            ]}
            onPress={handleBreakDownTask}
            disabled={breakdownBusy}
          >
            <Text style={[styles.breakdownButtonText, { color: colors.text }]}>
              {breakdownBusy ? "Breaking it down..." : "Break Into Steps"}
            </Text>
          </TouchableOpacity>

          {breakdown && (
            <View style={styles.breakdownPreview}>
              <Text style={[styles.breakdownSummary, { color: colors.subtle }]}>
                {breakdown.summary}
              </Text>

              {breakdown.steps.map((step, index) => (
                <View
                  key={`${step.title}-${index}`}
                  style={[
                    styles.breakdownStep,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.breakdownStepTop}>
                    <Text style={[styles.breakdownStepNumber, { color: colors.tint }]}>
                      {index + 1}
                    </Text>
                    <Text style={[styles.breakdownStepTitle, { color: colors.text }]}>
                      {step.title}
                    </Text>
                  </View>
                  <Text style={[styles.breakdownStepMeta, { color: colors.subtle }]}>
                    {step.durationMinutes} min • {step.priority}
                  </Text>
                  {!!step.notes && (
                    <Text style={[styles.breakdownStepNotes, { color: colors.subtle }]}>
                      {step.notes}
                    </Text>
                  )}
                </View>
              ))}

              <TouchableOpacity
                style={[styles.breakdownAddButton, { backgroundColor: colors.tint }]}
                onPress={handleAddBreakdownTasks}
              >
                <Text style={styles.aiPrimaryText}>
                  Add {breakdown.steps.length} Step
                  {breakdown.steps.length === 1 ? "" : "s"} as Tasks
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.subtle }]}>
            Target Day
          </Text>
          <View style={styles.chipRow}>
            {[0, 1].map((offset) => {
              const date = new Date();
              date.setDate(date.getDate() + offset);
              const dateKey = formatDateKey(date);
              const selected = dateKey === selectedDateKey;

              return (
                <TouchableOpacity
                  key={dateKey}
                  style={[
                    styles.infoChip,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                    selected && {
                      backgroundColor: colors.surface,
                      borderColor: colors.tint,
                    },
                  ]}
                  onPress={() => setSelectedDate(date)}
                >
                  <Text style={[styles.infoChipText, { color: colors.text }]}>
                    {offset === 0 ? "Today" : "Tomorrow"}
                  </Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[
                styles.infoChip,
                styles.longChip,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
                isCustomFutureDate && {
                  backgroundColor: colors.surface,
                  borderColor: colors.tint,
                },
              ]}
              onPress={openFutureScheduler}
            >
              <Text style={[styles.infoChipText, { color: colors.text }]}>
                {futureChipLabel}
              </Text>
            </TouchableOpacity>
          </View>

          {isCustomFutureDate && (
            <Text style={[styles.selectionHint, { color: colors.subtle }]}>
              Future task locked for {selectedDateLabel} at {formattedTime}
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.subtle }]}>Priority</Text>
          <View style={styles.priorityRow}>
            {(["Low", "Medium", "High"] as TaskPriority[]).map((item) => (
              <TouchableOpacity
                key={item}
                style={[
                  styles.priorityChip,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                  priority === item && {
                    backgroundColor: colors.surface,
                    borderColor: colors.tint,
                  },
                ]}
                onPress={() => setPriority(item)}
              >
                <View
                  style={[
                    styles.priorityDot,
                    { backgroundColor: priorityColors[item] },
                  ]}
                />
                <Text style={[styles.priorityChipText, { color: colors.text }]}>
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.timeButton,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
          onPress={() => setShowTimePicker(true)}
        >
          <Text style={[styles.timeText, { color: colors.text }]}>
            ⏰ {formattedTime}
          </Text>
        </TouchableOpacity>

        <View style={styles.quickTimeRow}>
          {quickTimePresets.map((preset) => {
            const selected = formattedTime === preset;

            return (
              <TouchableOpacity
                key={preset}
                style={[
                  styles.quickTimeChip,
                  {
                    backgroundColor: selected ? colors.surface : colors.card,
                    borderColor: selected ? colors.tint : colors.border,
                  },
                ]}
                onPress={() => applyTimePreset(preset)}
              >
                <Text style={[styles.quickTimeText, { color: colors.text }]}>
                  {preset}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.subtle }]}>
            Repeat
          </Text>
          <View style={styles.recurrenceWrap}>
            {(["none", "daily", "weekdays", "weekly"] as RecurrenceRule[]).map(
              (rule) => (
                <TouchableOpacity
                  key={rule}
                  style={[
                    styles.infoChip,
                    styles.recurrenceChip,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                    recurrence === rule && {
                      backgroundColor: colors.surface,
                      borderColor: colors.tint,
                    },
                  ]}
                  onPress={() => setRecurrence(rule)}
                >
                  <Text style={[styles.infoChipText, { color: colors.text }]}>
                    {recurrenceLabels[rule]}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </View>
        </View>

        {showTimePicker && (
          <DateTimePicker
            value={time}
            mode="time"
            is24Hour={false}
            onChange={(_, selected) => {
              setShowTimePicker(Platform.OS === "ios");
              if (selected) setTime(selected);
            }}
          />
        )}

        <Modal
          visible={futureScheduleVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setFutureScheduleVisible(false)}
        >
          <View style={styles.centerModalBackdrop}>
            <View style={[styles.futureModalCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.futureModalTitle, { color: colors.text }]}>
                Schedule for Later
              </Text>
              <Text style={[styles.futureModalBody, { color: colors.subtle }]}>
                Pick the exact future day and due time for this task.
              </Text>

              <TouchableOpacity
                style={[
                  styles.futureSelector,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => {
                  setShowFutureTimePicker(false);
                  setShowFutureDatePicker(true);
                }}
              >
                <Text style={[styles.futureSelectorLabel, { color: colors.subtle }]}>
                  Future day
                </Text>
                <Text style={[styles.futureSelectorValue, { color: colors.text }]}>
                  {futureDraftLabel}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.futureSelector,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => {
                  setShowFutureDatePicker(false);
                  setShowFutureTimePicker(true);
                }}
              >
                <Text style={[styles.futureSelectorLabel, { color: colors.subtle }]}>
                  Due time
                </Text>
                <Text style={[styles.futureSelectorValue, { color: colors.text }]}>
                  {futureDraftTimeLabel}
                </Text>
              </TouchableOpacity>

              {showFutureDatePicker && (
                <DateTimePicker
                  value={futureDraftDate}
                  mode="date"
                  minimumDate={minimumFutureDate}
                  onChange={(_, selected) => {
                    setShowFutureDatePicker(Platform.OS === "ios");
                    if (selected) setFutureDraftDate(selected);
                  }}
                />
              )}

              {showFutureTimePicker && (
                <DateTimePicker
                  value={futureDraftTime}
                  mode="time"
                  is24Hour={false}
                  onChange={(_, selected) => {
                    setShowFutureTimePicker(Platform.OS === "ios");
                    if (selected) setFutureDraftTime(selected);
                  }}
                />
              )}

              <View style={styles.futureActionRow}>
                <TouchableOpacity
                  style={[
                    styles.futureActionButton,
                    styles.futureSecondaryButton,
                    { backgroundColor: colors.surface },
                  ]}
                  onPress={() => {
                    setFutureScheduleVisible(false);
                    setShowFutureDatePicker(false);
                    setShowFutureTimePicker(false);
                  }}
                >
                  <Text
                    style={[styles.futureSecondaryText, { color: colors.subtle }]}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.futureActionButton,
                    { backgroundColor: colors.tint },
                  ]}
                  onPress={applyFutureSchedule}
                >
                  <Text style={styles.futurePrimaryText}>Use This Schedule</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {recurrence !== "none" && (
          <View
            style={[
              styles.insightCard,
              { backgroundColor: colors.card, borderColor: colors.tint },
            ]}
          >
            <Text style={[styles.insightTitle, { color: colors.text }]}>
              Recurring Plan
            </Text>
            <Text style={[styles.insightText, { color: colors.subtle }]}>
              This will create {recurringDates.length} {recurrenceLabels[recurrence].toLowerCase()} tasks starting {selectedDateLabel}.
            </Text>
          </View>
        )}

        {planningInsights.warnings.length > 0 && (
          <View
            style={[
              styles.insightCard,
              styles.warningCard,
              { backgroundColor: colors.card, borderColor: colors.warning },
            ]}
          >
            <Text style={[styles.insightTitle, { color: colors.text }]}>
              Reality Check
            </Text>
            {planningInsights.warnings.map((warning) => (
              <Text
                key={warning}
                style={[styles.insightText, { color: colors.subtle }]}
              >
                • {warning}
              </Text>
            ))}
          </View>
        )}

        {planningInsights.suggestion && (
          <View
            style={[
              styles.insightCard,
              { backgroundColor: colors.card, borderColor: colors.tint },
            ]}
          >
            <Text style={[styles.insightTitle, { color: colors.text }]}>
              Suggested Time
            </Text>
            <Text style={[styles.insightText, { color: colors.subtle }]}>
              {planningInsights.suggestion}
            </Text>
          </View>
        )}

        {error ? (
          <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
        ) : null}

        {successMessage ? (
          <Text style={[styles.success, { color: colors.subtle }]}>
            {successMessage}
          </Text>
        ) : null}

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.tint }]}
          onPress={handleAddTask}
        >
          <Text style={styles.buttonText}>
            {recurrence === "none"
              ? `Add Task for ${selectedDateLabel}`
              : `Create ${recurringDates.length} Tasks`}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 120 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 22,
  },
  headerCopy: {
    flex: 1,
    paddingRight: 16,
  },
  headerKicker: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 5,
    textTransform: "uppercase",
  },
  headerBadge: {
    borderWidth: 1,
    borderRadius: 20,
    minWidth: 82,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  headerBadgeValue: {
    fontSize: 25,
    fontWeight: "900",
    lineHeight: 28,
  },
  headerBadgeLabel: {
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
    textTransform: "uppercase",
  },
  title: { fontSize: 34, fontWeight: "900", letterSpacing: -0.7 },
  subtitle: {
    fontSize: 14,
    marginTop: 7,
    lineHeight: 20,
  },
  plannerHero: {
    marginHorizontal: 24,
    marginBottom: 18,
    borderRadius: 28,
    padding: 20,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 7,
  },
  plannerHeroGlow: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    right: -54,
    top: -62,
    opacity: 0.3,
  },
  plannerHeroKicker: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  plannerHeroTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 29,
    marginBottom: 8,
  },
  plannerHeroBody: {
    color: "rgba(255,255,255,0.84)",
    fontSize: 14,
    lineHeight: 21,
  },
  plannerHeroStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
    borderRadius: 20,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  plannerHeroStat: {
    flex: 1,
    alignItems: "center",
  },
  plannerHeroStatValue: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
  },
  plannerHeroStatLabel: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 3,
    textTransform: "uppercase",
  },
  plannerHeroDivider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  energyPlannerCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    marginHorizontal: 24,
    marginBottom: 18,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  energyPlannerHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  energyPlannerCopy: {
    flex: 1,
    paddingRight: 12,
  },
  energyPlannerEyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 5,
    textTransform: "uppercase",
  },
  energyPlannerTitle: {
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 5,
  },
  energyPlannerBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  energyPlannerPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  energyPlannerPillText: {
    fontSize: 11,
    fontWeight: "900",
  },
  energyPlannerChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
    marginTop: 14,
  },
  energyPlannerChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
    margin: 4,
  },
  energyPlannerChipText: {
    fontSize: 12,
    fontWeight: "900",
  },
  templateCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    marginHorizontal: 24,
    marginBottom: 18,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  templateHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  templateEyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 5,
    textTransform: "uppercase",
  },
  templateTitle: {
    fontSize: 18,
    fontWeight: "900",
  },
  saveTemplateButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  saveTemplateText: {
    fontSize: 11,
    fontWeight: "900",
  },
  templateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  templateTile: {
    width: "48%",
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  templateTileTitle: {
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 5,
  },
  templateTileMeta: {
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
  },
  templateRemoveButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginTop: 9,
  },
  templateRemoveText: {
    fontSize: 10,
    fontWeight: "900",
  },
  aiCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    marginHorizontal: 24,
    marginBottom: 18,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  aiTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 6,
  },
  aiSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  exampleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
    marginBottom: 10,
  },
  exampleChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
    marginHorizontal: 4,
    marginBottom: 8,
  },
  exampleChipText: {
    fontSize: 12,
    fontWeight: "800",
  },
  aiInput: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    minHeight: 88,
    fontSize: 15,
    textAlignVertical: "top",
  },
  aiActionRow: {
    flexDirection: "row",
    marginTop: 12,
  },
  aiSecondaryButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginRight: 8,
  },
  aiPrimaryButton: {
    flex: 2,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  aiSecondaryText: {
    fontSize: 14,
    fontWeight: "700",
  },
  aiPrimaryText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  aiPreviewWrap: {
    marginTop: 16,
  },
  aiPreviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  aiPreviewTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  aiSourceText: {
    fontSize: 12,
    fontWeight: "600",
  },
  aiParsedTask: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  aiParsedTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  aiParsedTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    marginRight: 10,
  },
  aiParsedPriority: {
    fontSize: 12,
    fontWeight: "700",
  },
  aiParsedMeta: {
    fontSize: 13,
    lineHeight: 18,
  },
  aiParsedRepeat: {
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 6,
  },
  aiWarningText: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  realityCard: {
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
    marginBottom: 4,
  },
  realityHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  realityTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  realityBadge: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  realitySummary: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    marginBottom: 6,
  },
  realityMeta: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  realityLine: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  trimButton: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    marginTop: 12,
  },
  trimButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
  aiAddButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  aiStatusCard: {
    borderWidth: 1,
    borderRadius: 15,
    padding: 12,
    marginTop: 12,
  },
  aiStatusTitle: {
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 4,
  },
  aiStatusBody: {
    fontSize: 12,
    lineHeight: 17,
  },
  breakdownCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    marginHorizontal: 24,
    marginBottom: 18,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  breakdownHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  breakdownTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 5,
  },
  breakdownSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  breakdownSource: {
    fontSize: 12,
    fontWeight: "700",
  },
  breakdownButton: {
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  breakdownButtonText: {
    fontSize: 14,
    fontWeight: "800",
  },
  breakdownPreview: {
    marginTop: 14,
  },
  breakdownSummary: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
  },
  breakdownStep: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  breakdownStepTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 5,
  },
  breakdownStepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 22,
    marginRight: 9,
  },
  breakdownStepTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
  },
  breakdownStepMeta: {
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 31,
  },
  breakdownStepNotes: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
    marginLeft: 31,
  },
  breakdownAddButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 24,
    marginBottom: 16,
    fontSize: 15,
  },
  notesInput: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  scheduleSnapshot: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    marginHorizontal: 24,
    marginBottom: 18,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  scheduleSnapshotHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  snapshotKicker: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  snapshotTitle: {
    fontSize: 19,
    fontWeight: "900",
  },
  snapshotPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  snapshotPillText: {
    fontSize: 12,
    fontWeight: "900",
  },
  snapshotMetricRow: {
    flexDirection: "row",
    marginHorizontal: -4,
  },
  snapshotMetric: {
    flex: 1,
    borderRadius: 16,
    padding: 12,
    marginHorizontal: 4,
  },
  snapshotMetricValue: {
    fontSize: 23,
    fontWeight: "900",
  },
  snapshotMetricLabel: {
    fontSize: 11,
    fontWeight: "800",
    marginTop: 3,
    textTransform: "uppercase",
  },
  snapshotHint: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
  },
  section: {
    marginHorizontal: 24,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  chipRow: {
    flexDirection: "row",
  },
  infoChip: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginRight: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  longChip: {
    flex: 1,
  },
  infoChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  selectionHint: {
    fontSize: 12,
    marginTop: 10,
    lineHeight: 18,
  },
  priorityRow: {
    flexDirection: "row",
  },
  priorityChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    marginHorizontal: 4,
  },
  priorityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 7,
  },
  priorityChipText: {
    fontSize: 14,
    fontWeight: "600",
  },
  timeButton: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 24,
    marginBottom: 10,
  },
  timeText: { fontSize: 15 },
  quickTimeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: 20,
    marginBottom: 16,
  },
  quickTimeChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
    marginHorizontal: 4,
    marginBottom: 8,
  },
  quickTimeText: {
    fontSize: 12,
    fontWeight: "800",
  },
  centerModalBackdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    backgroundColor: "rgba(26, 19, 32, 0.32)",
  },
  futureModalCard: {
    width: "100%",
    borderRadius: 24,
    padding: 20,
  },
  futureModalTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
  },
  futureModalBody: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 16,
  },
  futureSelector: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  futureSelectorLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  futureSelectorValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  futureActionRow: {
    flexDirection: "row",
    marginTop: 8,
  },
  futureActionButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
  },
  futureSecondaryButton: {
    marginRight: 8,
  },
  futureSecondaryText: {
    fontSize: 14,
    fontWeight: "700",
  },
  futurePrimaryText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  recurrenceWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  recurrenceChip: {
    marginBottom: 8,
  },
  insightCard: {
    marginHorizontal: 24,
    marginBottom: 16,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
  },
  warningCard: {
    borderWidth: 1.5,
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
  },
  insightText: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 6,
  },
  button: {
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    marginHorizontal: 24,
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: {
    marginBottom: 12,
    textAlign: "center",
    marginHorizontal: 24,
  },
  success: {
    marginBottom: 12,
    textAlign: "center",
    fontSize: 14,
    marginHorizontal: 24,
    lineHeight: 20,
  },
});
