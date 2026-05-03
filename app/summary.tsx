import { useRouter } from "expo-router";
import { collection, deleteDoc, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useAppTheme } from "@/constants/appTheme";
import { AmbientBackground } from "@/components/ambient-background";
import { PetSprite } from "@/components/pet-sprite";
import {
  getActivePet,
  getPetProgress,
  getTaskXp,
  type Priority,
} from "@/constants/rewards";
import { Colors } from "@/constants/theme";
import { useUserProfile } from "@/hooks/use-user-profile";
import {
  getDailyFeedback,
  type DailyFeedbackResult,
} from "@/utils/ai";
import {
  cancelTaskNotifications,
  syncMorningSummaryNotification,
  syncTaskNotifications,
} from "@/utils/notifications";
import { formatDateKey } from "@/utils/task-helpers";
import { auth, db } from "../constants/firebaseConfig";

type TaskStatus = "pending" | "completed" | "skipped";

type Task = {
  id: string;
  title: string;
  completed: boolean;
  date: string;
  time?: string;
  priority?: Priority;
  notes?: string;
  status?: TaskStatus;
  completedAt?: any;
  rescheduledCount?: number;
  originalTime?: string;
};

const priorityColors: Record<Priority, string> = {
  Low: "#8dcf9f",
  Medium: "#f2b97f",
  High: "#e58ca8",
};

const serializeDateValue = (value: any) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  return null;
};

export default function SummaryScreen() {
  const router = useRouter();
  const { themeName } = useAppTheme();
  const { profile } = useUserProfile();
  const colors = Colors[themeName];
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dailyFeedback, setDailyFeedback] =
    useState<DailyFeedbackResult | null>(null);
  const [feedbackBusy, setFeedbackBusy] = useState(false);

  const todayDate = formatDateKey(new Date());
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const unsubscribe = onSnapshot(
      collection(db, "users", uid, "tasks"),
      (snap) => {
        const fetched = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Task[];

        setTasks(fetched);
      },
      () => {
        setTasks([]);
      }
    );

    return unsubscribe;
  }, []);

  const summary = useMemo(() => {
    const todayTasks = tasks.filter((task) => task.date === todayDate);
    const completed = todayTasks.filter((task) => task.completed).length;
    const skipped = todayTasks.filter(
      (task) => (task.status ?? "pending") === "skipped"
    ).length;
    const total = todayTasks.length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const allDone = completed === total && total > 0;

    const todayXp = todayTasks.reduce((sum, task) => sum + getTaskXp(task), 0);
    const totalXp = tasks.reduce((sum, task) => sum + getTaskXp(task), 0);
    const petProgress = getPetProgress(totalXp);
    const activePet = getActivePet(totalXp, profile.activePetKey);

    return {
      todayTasks,
      completed,
      skipped,
      total,
      percent,
      allDone,
      todayXp,
      totalXp,
      activePet,
      petProgress,
    };
  }, [profile.activePetKey, tasks, todayDate]);

  const message =
    summary.total === 0
      ? "No tasks were scheduled for today. A fresh reset is waiting for you tomorrow."
      : summary.allDone
        ? "You completed all your tasks today. Amazing work!"
        : `You completed ${summary.completed} out of ${summary.total} tasks (${summary.percent}%). Tomorrow is a new chance!`;
  const reviewTasks = useMemo(
    () =>
      summary.todayTasks.filter(
        (task) => !task.completed && (task.status ?? "pending") !== "skipped"
      ),
    [summary.todayTasks]
  );

  const rescheduleTaskTomorrow = async (task: Task) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = formatDateKey(tomorrow);
    const nextTime = task.time ?? "9:00 AM";

    await updateDoc(doc(db, "users", uid, "tasks", task.id), {
      date: tomorrowDate,
      time: nextTime,
      status: "pending",
      completed: false,
      skippedAt: null,
      lastActionAt: new Date(),
      rescheduledCount: (task.rescheduledCount ?? 0) + 1,
    });

    await syncTaskNotifications({
      id: task.id,
      title: task.title,
      time: nextTime,
      date: tomorrowDate,
      priority: task.priority,
      completed: false,
      status: "pending",
    });
    await syncMorningSummaryNotification(uid);
  };

  const deleteReviewTask = async (task: Task) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    await cancelTaskNotifications(task.id);
    await deleteDoc(doc(db, "users", uid, "tasks", task.id));
    await syncMorningSummaryNotification(uid);
  };

  useEffect(() => {
    let active = true;

    const loadFeedback = async () => {
      setFeedbackBusy(true);

      try {
        const result = await getDailyFeedback({
          date: todayDate,
          timezone,
          tasks: summary.todayTasks.map((task) => ({
            id: task.id,
            title: task.title,
            date: task.date,
            time: task.time ?? "9:00 PM",
            priority: task.priority ?? "Medium",
            completed: task.completed,
            status: task.status ?? "pending",
            rescheduledCount: task.rescheduledCount ?? 0,
            completedAt: serializeDateValue(task.completedAt),
          })),
        });

        if (active) setDailyFeedback(result);
      } finally {
        if (active) setFeedbackBusy(false);
      }
    };

    loadFeedback();

    return () => {
      active = false;
    };
  }, [summary.todayTasks, todayDate, timezone]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientBackground colors={colors} variant="calm" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
      <Text style={styles.emoji}>
        {summary.total === 0 ? "🌙" : summary.allDone ? "🎉" : "💪"}
      </Text>

      <Text style={[styles.title, { color: colors.text }]}>
        {summary.total === 0
          ? "Quiet day"
          : summary.allDone
            ? "You did it!"
            : "Let's try changing it up tomorrow"}
      </Text>

      <Text style={[styles.subtitle, { color: colors.subtle }]}>{message}</Text>

      <View
        style={[
          styles.feedbackCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            shadowColor: colors.tint,
          },
        ]}
      >
        <View style={styles.feedbackHeader}>
          <Text style={[styles.feedbackEyebrow, { color: colors.tint }]}>
            AI Daily Feedback
          </Text>
          <Text style={[styles.feedbackSource, { color: colors.subtle }]}>
            {feedbackBusy
              ? "Checking"
              : dailyFeedback?.source === "openai"
                ? "AI"
                : "Local"}
          </Text>
        </View>

        <Text style={[styles.feedbackTitle, { color: colors.text }]}>
          {feedbackBusy
            ? "Reading your day..."
            : dailyFeedback?.headline ?? "Daily feedback"}
        </Text>
        <Text style={[styles.feedbackBody, { color: colors.subtle }]}>
          {feedbackBusy
            ? "Turning your completion data into one useful next move."
            : dailyFeedback?.message ?? "Review your day and adjust tomorrow."}
        </Text>

        {!!dailyFeedback?.wins.length && (
          <View style={styles.feedbackList}>
            <Text style={[styles.feedbackListTitle, { color: colors.text }]}>
              Wins
            </Text>
            {dailyFeedback.wins.map((win) => (
              <Text
                key={win}
                style={[styles.feedbackLine, { color: colors.subtle }]}
              >
                {win}
              </Text>
            ))}
          </View>
        )}

        {!!dailyFeedback?.adjustments.length && (
          <View style={styles.feedbackList}>
            <Text style={[styles.feedbackListTitle, { color: colors.text }]}>
              Tomorrow&apos;s Adjustment
            </Text>
            {dailyFeedback.adjustments.map((adjustment) => (
              <Text
                key={adjustment}
                style={[styles.feedbackLine, { color: colors.subtle }]}
              >
                {adjustment}
              </Text>
            ))}
          </View>
        )}
      </View>

      <View
        style={[
          styles.petCard,
          { backgroundColor: colors.card, shadowColor: colors.tint },
        ]}
      >
        <View style={styles.petHero}>
          <PetSprite petKey={summary.activePet.key} size={72} style={styles.petSprite} />
          <View style={styles.petCopy}>
            <Text style={[styles.petName, { color: colors.text }]}>
              {summary.activePet.name}
            </Text>
            <Text style={[styles.petDescription, { color: colors.subtle }]}>
              {summary.activePet.description}
            </Text>
            <Text style={[styles.petProgressText, { color: colors.subtle }]}>
              {summary.petProgress.nextPet
                ? `Collection progress: ${summary.petProgress.remainingXp} XP until ${summary.petProgress.nextPet.name}`
                : "Collection complete. Final companion unlocked"}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.progressBarContainer,
            { backgroundColor: colors.border, marginTop: 16 },
          ]}
        >
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${summary.petProgress.progressPercent}%`,
                backgroundColor: colors.tint,
              },
            ]}
          />
        </View>
      </View>

      <View
        style={[
          styles.xpCard,
          { backgroundColor: colors.card, shadowColor: colors.tint },
        ]}
      >
        <Text style={[styles.xpLabel, { color: colors.subtle }]}>Today&apos;s XP</Text>
        <Text style={[styles.xpNumber, { color: colors.text }]}>
          {summary.todayXp >= 0 ? `+${summary.todayXp}` : summary.todayXp}
        </Text>
        <Text style={[styles.xpSubtext, { color: colors.subtle }]}>
          {summary.completed} completed • {summary.skipped} skipped • {summary.totalXp} total XP
        </Text>
      </View>

      <View
        style={[
          styles.progressCard,
          { backgroundColor: colors.card, shadowColor: colors.tint },
        ]}
      >
        <Text style={[styles.progressLabel, { color: colors.subtle }]}>
          Today&apos;s Score
        </Text>
        <Text style={[styles.progressNumber, { color: colors.text }]}>
          {summary.percent}%
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
              { width: `${summary.percent}%`, backgroundColor: colors.tint },
            ]}
          />
        </View>
      </View>

      {reviewTasks.length > 0 && (
        <View
          style={[
            styles.reviewCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.warning,
              shadowColor: colors.tint,
            },
          ]}
        >
          <Text style={[styles.reviewEyebrow, { color: colors.warning }]}>
            Missed Task Review
          </Text>
          <Text style={[styles.reviewTitle, { color: colors.text }]}>
            Decide what deserves another shot
          </Text>
          <Text style={[styles.reviewBody, { color: colors.subtle }]}>
            Move worthwhile tasks to tomorrow, or delete the ones that were
            really just noise.
          </Text>

          {reviewTasks.map((task) => (
            <View
              key={`review-${task.id}`}
              style={[
                styles.reviewTask,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.reviewTaskCopy}>
                <Text style={[styles.reviewTaskTitle, { color: colors.text }]}>
                  {task.title}
                </Text>
                <Text style={[styles.reviewTaskMeta, { color: colors.subtle }]}>
                  {task.time ?? "No time"} • {task.priority ?? "Medium"}
                </Text>
              </View>

              <View style={styles.reviewActions}>
                <TouchableOpacity
                  style={[
                    styles.reviewActionButton,
                    { backgroundColor: colors.tint },
                  ]}
                  onPress={() => rescheduleTaskTomorrow(task)}
                >
                  <Text style={styles.reviewActionText}>Tomorrow</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.reviewActionButton,
                    { backgroundColor: colors.danger },
                  ]}
                  onPress={() => deleteReviewTask(task)}
                >
                  <Text style={styles.reviewActionText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, shadowColor: colors.tint },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>
          Today&apos;s Tasks
        </Text>

        {summary.todayTasks.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              Nothing was planned today
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.subtle }]}>
              Use tonight to set up tomorrow with a few clear priorities.
            </Text>
          </View>
        ) : (
          summary.todayTasks.map((task) => {
            const priority = task.priority ?? "Medium";
            const xp = getTaskXp(task);
            const isSkipped = (task.status ?? "pending") === "skipped";
            const xpLabel = task.completed ? `+${xp} XP` : isSkipped ? "No XP" : "Pending";

            return (
              <View key={task.id} style={styles.taskRow}>
                <Text style={styles.taskDot}>
                  {task.completed ? "✅" : isSkipped ? "⏭️" : "❌"}
                </Text>

                <View style={styles.taskInfo}>
                  <Text
                    style={[
                      styles.taskTitle,
                      { color: colors.text },
                      !task.completed && (task.status ?? "pending") !== "skipped"
                        ? { color: colors.subtle }
                        : null,
                    ]}
                  >
                    {task.title}
                  </Text>

                  <View style={styles.metaRow}>
                    {task.time ? (
                      <Text style={[styles.taskMeta, { color: colors.subtle }]}>
                        {task.time}
                      </Text>
                    ) : null}

                    <View
                      style={[
                        styles.priorityBadge,
                        { backgroundColor: colors.surface },
                      ]}
                    >
                      <View
                        style={[
                          styles.priorityDot,
                          { backgroundColor: priorityColors[priority] },
                        ]}
                      />
                      <Text style={[styles.priorityText, { color: colors.subtle }]}>
                        {priority}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.xpBadge,
                        { backgroundColor: colors.surface },
                      ]}
                    >
                      <Text
                        style={[
                          styles.xpBadgeText,
                          { color: task.completed ? colors.text : colors.subtle },
                        ]}
                      >
                        {xpLabel}
                      </Text>
                    </View>
                  </View>

                  {!!task.notes && (
                    <Text
                      style={[styles.taskNotes, { color: colors.subtle }]}
                      numberOfLines={2}
                    >
                      {task.notes}
                    </Text>
                  )}
                </View>
              </View>
            );
          })
        )}
      </View>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.tint }]}
        onPress={() => router.replace("/(tabs)")}
      >
        <Text style={styles.buttonText}>Back to Today</Text>
      </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: 24,
    paddingTop: 72,
    paddingBottom: 40,
    alignItems: "center",
  },
  emoji: { fontSize: 72, marginBottom: 16 },
  title: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  feedbackCard: {
    borderRadius: 22,
    padding: 18,
    width: "100%",
    marginBottom: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  feedbackHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  feedbackEyebrow: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  feedbackSource: {
    fontSize: 12,
    fontWeight: "700",
  },
  feedbackTitle: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 8,
  },
  feedbackBody: {
    fontSize: 14,
    lineHeight: 21,
  },
  feedbackList: {
    marginTop: 14,
  },
  feedbackListTitle: {
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 6,
  },
  feedbackLine: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 5,
  },
  petCard: {
    borderRadius: 22,
    padding: 20,
    width: "100%",
    marginBottom: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  petHero: {
    flexDirection: "row",
    alignItems: "center",
  },
  petEmoji: {
    fontSize: 52,
    marginRight: 16,
  },
  petSprite: {
    marginRight: 16,
  },
  petCopy: {
    flex: 1,
  },
  petName: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
  },
  petDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 6,
  },
  petProgressText: {
    fontSize: 13,
    fontWeight: "600",
  },
  xpCard: {
    borderRadius: 20,
    padding: 20,
    width: "100%",
    marginBottom: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  xpLabel: {
    fontSize: 14,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  xpNumber: {
    fontSize: 40,
    fontWeight: "700",
    marginBottom: 6,
  },
  xpSubtext: {
    fontSize: 14,
  },
  progressCard: {
    borderRadius: 20,
    padding: 20,
    width: "100%",
    marginBottom: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  progressNumber: {
    fontSize: 42,
    fontWeight: "700",
    marginBottom: 12,
  },
  progressBarContainer: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 8,
    borderRadius: 4,
  },
  reviewCard: {
    borderRadius: 22,
    padding: 18,
    width: "100%",
    marginBottom: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  reviewEyebrow: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 7,
  },
  reviewTitle: {
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 6,
  },
  reviewBody: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  reviewTask: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginTop: 10,
  },
  reviewTaskCopy: {
    marginBottom: 10,
  },
  reviewTaskTitle: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 3,
  },
  reviewTaskMeta: {
    fontSize: 12,
    fontWeight: "700",
  },
  reviewActions: {
    flexDirection: "row",
  },
  reviewActionButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
    marginRight: 8,
  },
  reviewActionText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  card: {
    borderRadius: 20,
    padding: 20,
    width: "100%",
    marginBottom: 24,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 16,
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  taskDot: {
    fontSize: 16,
    marginRight: 10,
    marginTop: 2,
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: "500",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 4,
  },
  taskMeta: {
    fontSize: 12,
    marginRight: 10,
  },
  priorityBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 8,
    marginTop: 6,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  priorityText: {
    fontSize: 12,
    fontWeight: "600",
  },
  xpBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 6,
  },
  xpBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  taskNotes: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 10,
  },
  emptyEmoji: {
    fontSize: 42,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  button: {
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    width: "100%",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});
