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
import { Colors } from "@/constants/theme";
import {
  parseNaturalTasks,
  type ParsedAiTask,
} from "../../utils/ai";
import {
  buildRecurringDates,
  formatDateKey,
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

const getDefaultFutureDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 2);
  date.setHours(12, 0, 0, 0);
  return date;
};

export default function AddTask() {
  const { themeName } = useAppTheme();
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
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [aiSource, setAiSource] = useState<"openai" | "local" | "offline" | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
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
      }
    );

    return unsubscribe;
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

    return { warnings, suggestion };
  }, [formattedTime, priority, selectedDateKey, selectedDateLabel, tasks, title]);

  const resetForm = () => {
    setTitle("");
    setNotes("");
    setPriority("Medium");
    setRecurrence("none");
    setSelectedDate(new Date());
    setTime(new Date());
    setFutureDraftDate(getDefaultFutureDate());
    setFutureDraftTime(new Date());
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
        })),
      });

      setParsedTasks(result.tasks);
      setAiWarnings(result.warnings);
      setAiSource(result.source);

      if (result.tasks.length === 0) {
        setError("I could not turn that into tasks yet. Try adding times with 'at'.");
      }
    } catch (e: any) {
      setError(e.message ?? "The AI parser could not read that yet.");
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

  const handleAddParsedTasks = async () => {
    if (parsedTasks.length === 0) {
      setError("Parse tasks first, then you can add them.");
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
      }[] = [];

      parsedTasks.forEach((parsedTask) => {
        const taskRef = doc(collection(db, "users", uid, "tasks"));
        const safePriority = parsedTask.priority ?? "Medium";

        batch.set(taskRef, {
          title: parsedTask.title.trim(),
          notes: composeParsedNotes(parsedTask),
          priority: safePriority,
          time: parsedTask.time,
          date: parsedTask.date,
          completed: false,
          status: "pending",
          createdAt: new Date(),
          completedAt: null,
          skippedAt: null,
          lastActionAt: new Date(),
          rescheduledCount: 0,
          originalTime: parsedTask.time,
          recurrence: "none",
          recurrenceGroupId: null,
          aiCreated: true,
        });

        createdTasks.push({
          id: taskRef.id,
          title: parsedTask.title.trim(),
          time: parsedTask.time,
          date: parsedTask.date,
          priority: safePriority,
        });
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
      );

      await syncMorningSummaryNotification(uid);

      setNaturalInput("");
      setParsedTasks([]);
      setAiWarnings([]);
      setAiSource(null);
      setError("");
      setSuccessMessage(`${createdTasks.length} AI-parsed task${createdTasks.length === 1 ? "" : "s"} added.`);
      setTimeout(() => setSuccessMessage(""), 2600);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong while adding AI-parsed tasks.");
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
        });

        createdTasks.push({
          id: taskRef.id,
          title: title.trim(),
          time: formattedTime,
          date: dateKey,
          priority,
        });
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
      );

      await syncMorningSummaryNotification(uid);

      resetForm();
      setError("");

      const success =
        recurrence === "none"
          ? `Task scheduled for ${selectedDateLabel}.`
          : `${createdTasks.length} ${recurrenceLabels[recurrence].toLowerCase()} tasks scheduled starting ${selectedDateLabel}.`;

      setSuccessMessage(success);
      setTimeout(() => setSuccessMessage(""), 2600);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong while adding the task.");
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.emoji}>📝</Text>
          <Text style={[styles.title, { color: colors.text }]}>Plan Your Tasks</Text>
          <Text style={[styles.subtitle, { color: colors.subtle }]}>
            Add something for later today, tomorrow, or weeks ahead.
          </Text>
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
                {aiBusy ? "Parsing..." : "Parse Tasks"}
              </Text>
            </TouchableOpacity>
          </View>

          {parsedTasks.length > 0 && (
            <View style={styles.aiPreviewWrap}>
              <View style={styles.aiPreviewHeader}>
                <Text style={[styles.aiPreviewTitle, { color: colors.text }]}>
                  Parsed Tasks
                </Text>
                {aiSource ? (
                  <Text style={[styles.aiSourceText, { color: colors.subtle }]}>
                    {aiSource === "openai" ? "AI" : "Local"} parser
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

              <TouchableOpacity
                style={[styles.aiAddButton, { backgroundColor: colors.tint }]}
                onPress={handleAddParsedTasks}
              >
                <Text style={styles.aiPrimaryText}>
                  Add {parsedTasks.length} Parsed Task
                  {parsedTasks.length === 1 ? "" : "s"}
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

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: "center", paddingTop: 60, paddingBottom: 32 },
  emoji: { fontSize: 48, marginBottom: 12 },
  title: { fontSize: 32, fontWeight: "700", textAlign: "center" },
  subtitle: {
    fontSize: 14,
    marginTop: 6,
    textAlign: "center",
    lineHeight: 21,
    paddingHorizontal: 30,
  },
  aiCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginHorizontal: 24,
    marginBottom: 18,
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
  aiWarningText: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  aiAddButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
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
    marginBottom: 16,
  },
  timeText: { fontSize: 15 },
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
