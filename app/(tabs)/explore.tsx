import DateTimePicker from "@react-native-community/datetimepicker";
import { addDoc, collection, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
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
  rescheduledCount?: number;
  originalTime?: string;
};

const priorityColors: Record<Priority, string> = {
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

const getTomorrowDate = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split("T")[0];
};

const parseTimeToMinutes = (time: string) => {
  const parts = time.split(" ");
  if (parts.length !== 2) return null;

  const [timePart, period] = parts;
  const [hoursStr, minutesStr] = timePart.split(":");
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

  let normalizedHours = hours;
  if (period === "PM" && hours !== 12) normalizedHours += 12;
  if (period === "AM" && hours === 12) normalizedHours = 0;

  return normalizedHours * 60 + minutes;
};

const getTimeBucket = (minutes: number | null): TimeBucket => {
  if (minutes === null) return "morning";
  if (minutes < 9 * 60) return "early";
  if (minutes < 12 * 60) return "morning";
  if (minutes < 17 * 60) return "afternoon";
  return "evening";
};

export default function AddTask() {
  const { themeName } = useAppTheme();
  const colors = Colors[themeName];

  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [time, setTime] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const unsubscribe = onSnapshot(collection(db, "users", uid, "tasks"), (snap) => {
      const fetched = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Task[];

      setTasks(fetched);
    });

    return unsubscribe;
  }, []);

  const planningInsights = useMemo(() => {
    const tomorrowDate = getTomorrowDate();
    const tomorrowTasks = tasks.filter((task) => task.date === tomorrowDate);
    const historyTasks = tasks.filter((task) => task.date < tomorrowDate);

    const selectedTime = time.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const selectedMinutes = parseTimeToMinutes(selectedTime);
    const selectedBucket = getTimeBucket(selectedMinutes);

    const projectedTaskCount = tomorrowTasks.length + (title.trim() ? 1 : 0);
    const projectedHighPriorityCount =
      tomorrowTasks.filter((task) => task.priority === "High").length +
      (title.trim() && priority === "High" ? 1 : 0);

    const closeTasks = tomorrowTasks.filter((task) => {
      const existing = parseTimeToMinutes(task.time);
      if (existing === null || selectedMinutes === null) return false;
      return Math.abs(existing - selectedMinutes) <= 45;
    });

    const warnings: string[] = [];

    if (projectedTaskCount >= 8) {
      warnings.push(
        `Tomorrow already has ${projectedTaskCount} tasks planned. That may be too much to execute cleanly.`
      );
    }

    if (projectedHighPriorityCount >= 4) {
      warnings.push(
        `You already have ${projectedHighPriorityCount} high-priority tasks planned. That may be unrealistic for one day.`
      );
    }

    if (closeTasks.length >= 2) {
      warnings.push(
        "This time slot is getting crowded. Give yourself more breathing room between tasks."
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
      if ((task.status ?? "pending") === "skipped" || (task.rescheduledCount ?? 0) > 0) {
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
  }, [notes, priority, tasks, time, title]);

  const resetForm = () => {
    setTitle("");
    setNotes("");
    setPriority("Medium");
    setTime(new Date());
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

      const formattedTime = time.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      const tomorrowDate = getTomorrowDate();

      const docRef = await addDoc(collection(db, "users", uid, "tasks"), {
        title: title.trim(),
        notes: notes.trim(),
        priority,
        time: formattedTime,
        date: tomorrowDate,
        completed: false,
        status: "pending",
        createdAt: new Date(),
        completedAt: null,
        skippedAt: null,
        lastActionAt: new Date(),
        rescheduledCount: 0,
        originalTime: formattedTime,
      });

      await syncTaskNotifications({
        id: docRef.id,
        title: title.trim(),
        time: formattedTime,
        date: tomorrowDate,
        priority,
        completed: false,
        status: "pending",
      });

      await syncMorningSummaryNotification(uid);

      resetForm();
      setSuccess(true);
      setError("");
      setTimeout(() => setSuccess(false), 2200);
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
          <Text style={[styles.title, { color: colors.text }]}>Plan Tomorrow</Text>
          <Text style={[styles.subtitle, { color: colors.subtle }]}>
            What do you want to get done?
          </Text>
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

        <View style={styles.prioritySection}>
          <Text style={[styles.sectionLabel, { color: colors.subtle }]}>Priority</Text>
          <View style={styles.priorityRow}>
            {(["Low", "Medium", "High"] as Priority[]).map((item) => (
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
          onPress={() => setShowPicker(true)}
        >
          <Text style={[styles.timeText, { color: colors.text }]}>
            ⏰{" "}
            {time.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </TouchableOpacity>

        {showPicker && (
          <DateTimePicker
            value={time}
            mode="time"
            is24Hour={false}
            onChange={(event, selected) => {
              setShowPicker(Platform.OS === "ios");
              if (selected) setTime(selected);
            }}
          />
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
              Reality Check 👀
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
              Suggested Time 🌤️
            </Text>
            <Text style={[styles.insightText, { color: colors.subtle }]}>
              {planningInsights.suggestion}
            </Text>
          </View>
        )}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
        {success ? (
          <Text style={[styles.success, { color: colors.subtle }]}>
            Task added and tomorrow’s reminders updated 🌸
          </Text>
        ) : null}

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.tint }]}
          onPress={handleAddTask}
        >
          <Text style={styles.buttonText}>Add Task</Text>
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
  title: { fontSize: 32, fontWeight: "700" },
  subtitle: { fontSize: 14, marginTop: 6 },
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
  prioritySection: {
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
  },
});
