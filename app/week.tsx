import { useRouter } from "expo-router";
import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { AmbientBackground } from "@/components/ambient-background";
import { useAppTheme } from "@/constants/appTheme";
import { Colors } from "@/constants/theme";
import { openTaskInGoogleCalendar } from "@/utils/calendar";
import { formatDateKey, getRelativeDateLabel, parseTimeToMinutes } from "@/utils/task-helpers";
import { auth, db } from "../constants/firebaseConfig";

type Task = {
  id: string;
  title: string;
  date: string;
  time: string;
  completed: boolean;
  priority?: "Low" | "Medium" | "High";
  notes?: string | null;
  status?: "pending" | "completed" | "skipped";
};

const priorityColors = {
  Low: "#8dcf9f",
  Medium: "#f2b97f",
  High: "#e58ca8",
};

const getNextSevenDays = () =>
  Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return formatDateKey(date);
  });

const getCalendarDays = () => {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const cursor = new Date(firstOfMonth);
  cursor.setDate(cursor.getDate() - cursor.getDay());

  return Array.from({ length: 42 }, () => {
    const dateKey = formatDateKey(cursor);
    const inCurrentMonth = cursor.getMonth() === today.getMonth();
    const isToday = dateKey === formatDateKey(today);
    cursor.setDate(cursor.getDate() + 1);
    return { dateKey, inCurrentMonth, isToday };
  });
};

export default function WeekScreen() {
  const router = useRouter();
  const { themeName } = useAppTheme();
  const colors = Colors[themeName];
  const [tasks, setTasks] = useState<Task[]>([]);
  const [calendarMessage, setCalendarMessage] = useState("");

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    return onSnapshot(
      collection(db, "users", uid, "tasks"),
      (snap) => {
        setTasks(
          snap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as Task[]
        );
      },
      () => {
        setTasks([]);
      }
    );
  }, []);

  const week = useMemo(() => {
    const days = getNextSevenDays();
    return days.map((date) => {
      const dayTasks = tasks
        .filter((task) => task.date === date)
        .sort(
          (a, b) =>
            (parseTimeToMinutes(a.time) ?? 0) -
            (parseTimeToMinutes(b.time) ?? 0)
        );
      const completed = dayTasks.filter((task) => task.completed).length;

      return {
        date,
        label: getRelativeDateLabel(date),
        tasks: dayTasks,
        completed,
      };
    });
  }, [tasks]);
  const calendar = useMemo(() => {
    const today = new Date();
    const monthLabel = today.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
    const days = getCalendarDays().map((day) => {
      const dayTasks = tasks.filter((task) => task.date === day.dateKey);
      const completed = dayTasks.filter((task) => task.completed).length;
      const skipped = dayTasks.filter(
        (task) => (task.status ?? "pending") === "skipped"
      ).length;
      const high = dayTasks.filter(
        (task) => (task.priority ?? "Medium") === "High"
      ).length;

      return {
        ...day,
        total: dayTasks.length,
        completed,
        skipped,
        high,
        completionPercent: dayTasks.length
          ? Math.round((completed / dayTasks.length) * 100)
          : 0,
      };
    });

    return { monthLabel, days };
  }, [tasks]);

  const handleAddToCalendar = async (task: Task) => {
    const opened = await openTaskInGoogleCalendar(task);
    setCalendarMessage(
      opened
        ? `${task.title} opened in Google Calendar.`
        : "Calendar export could not open on this device."
    );
    setTimeout(() => setCalendarMessage(""), 2600);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientBackground colors={colors} variant="calm" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.backText, { color: colors.tint }]}>Back</Text>
        </TouchableOpacity>

        <Text style={[styles.kicker, { color: colors.tint }]}>Week Planner</Text>
        <Text style={[styles.title, { color: colors.text }]}>Next 7 Days</Text>
        <Text style={[styles.subtitle, { color: colors.subtle }]}>
          See the month, then scan the next seven days before the schedule gets noisy.
        </Text>

        {calendarMessage ? (
          <Text style={[styles.statusMessage, { color: colors.subtle }]}>
            {calendarMessage}
          </Text>
        ) : null}

        <View
          style={[
            styles.calendarCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowColor: colors.tint,
            },
          ]}
        >
          <View style={styles.calendarHeader}>
            <View>
              <Text style={[styles.calendarKicker, { color: colors.tint }]}>
                Calendar
              </Text>
              <Text style={[styles.calendarTitle, { color: colors.text }]}>
                {calendar.monthLabel}
              </Text>
            </View>
            <View
              style={[
                styles.calendarPill,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.calendarPillText, { color: colors.subtle }]}>
                {tasks.filter((task) => task.date >= formatDateKey(new Date())).length} upcoming
              </Text>
            </View>
          </View>

          <View style={styles.weekdayRow}>
            {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
              <Text
                key={`${day}-${index}`}
                style={[styles.weekdayLabel, { color: colors.subtle }]}
              >
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {calendar.days.map((day) => {
              const dayNumber = new Date(`${day.dateKey}T12:00:00`).getDate();
              const hasTasks = day.total > 0;
              return (
                <View
                  key={day.dateKey}
                  style={[
                    styles.calendarDay,
                    {
                      backgroundColor: day.isToday
                        ? colors.tint
                        : hasTasks
                          ? colors.surface
                          : colors.background,
                      borderColor: day.isToday ? colors.tint : colors.border,
                      opacity: day.inCurrentMonth ? 1 : 0.42,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.calendarDayNumber,
                      { color: day.isToday ? "#fff" : colors.text },
                    ]}
                  >
                    {dayNumber}
                  </Text>
                  {hasTasks && (
                    <>
                      <Text
                        style={[
                          styles.calendarDayMeta,
                          { color: day.isToday ? "rgba(255,255,255,0.82)" : colors.subtle },
                        ]}
                      >
                        {day.completed}/{day.total}
                      </Text>
                      <View style={styles.calendarDotRow}>
                        {day.high > 0 && (
                          <View
                            style={[
                              styles.calendarDot,
                              { backgroundColor: priorityColors.High },
                            ]}
                          />
                        )}
                        {day.skipped > 0 && (
                          <View
                            style={[
                              styles.calendarDot,
                              { backgroundColor: colors.warning },
                            ]}
                          />
                        )}
                      </View>
                    </>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {week.map((day) => (
          <View
            key={day.date}
            style={[
              styles.dayCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                shadowColor: colors.tint,
              },
            ]}
          >
            <View style={styles.dayHeader}>
              <View>
                <Text style={[styles.dayLabel, { color: colors.text }]}>
                  {day.label}
                </Text>
                <Text style={[styles.dayDate, { color: colors.subtle }]}>
                  {day.date}
                </Text>
              </View>
              <Text style={[styles.dayCount, { color: colors.subtle }]}>
                {day.completed}/{day.tasks.length}
              </Text>
            </View>

            {day.tasks.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.subtle }]}>
                No tasks planned.
              </Text>
            ) : (
              <>
                <Text style={[styles.dueOrderLabel, { color: colors.subtle }]}>
                  Due order
                </Text>
                {day.tasks.map((task) => {
                const priority = task.priority ?? "Medium";
                const isSkipped = (task.status ?? "pending") === "skipped";

                return (
                  <View
                    key={task.id}
                    style={[
                      styles.taskRow,
                      { borderTopColor: colors.border },
                    ]}
                  >
                    <View
                      style={[
                        styles.priorityDot,
                        { backgroundColor: priorityColors[priority] },
                      ]}
                    />
                    <View style={styles.taskCopy}>
                      <Text
                        style={[
                          styles.taskTitle,
                          { color: task.completed || isSkipped ? colors.subtle : colors.text },
                          (task.completed || isSkipped) && styles.taskDone,
                        ]}
                      >
                        {task.title}
                      </Text>
                      <Text style={[styles.taskMeta, { color: colors.subtle }]}>
                        {task.time}
                        {task.completed ? " · Done" : isSkipped ? " · Skipped" : ""}
                      </Text>
                    </View>
                    {!task.completed && !isSkipped && (
                      <TouchableOpacity
                        style={[
                          styles.calendarButton,
                          {
                            backgroundColor: colors.surface,
                            borderColor: colors.border,
                          },
                        ]}
                        onPress={() => handleAddToCalendar(task)}
                      >
                        <Text
                          style={[
                            styles.calendarButtonText,
                            { color: colors.tint },
                          ]}
                        >
                          Calendar
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
                })}
              </>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: 20,
    paddingTop: 58,
    paddingBottom: 48,
  },
  backText: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 18,
  },
  kicker: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 18,
  },
  statusMessage: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginBottom: 14,
  },
  calendarCard: {
    borderRadius: 26,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 4,
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  calendarKicker: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  calendarTitle: {
    fontSize: 22,
    fontWeight: "900",
  },
  calendarPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  calendarPillText: {
    fontSize: 11,
    fontWeight: "900",
  },
  weekdayRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  weekdayLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -3,
  },
  calendarDay: {
    width: "14.2857%",
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    padding: 6,
    marginBottom: 6,
    transform: [{ scale: 0.96 }],
  },
  calendarDayNumber: {
    fontSize: 13,
    fontWeight: "900",
  },
  calendarDayMeta: {
    fontSize: 10,
    fontWeight: "800",
    marginTop: 7,
  },
  calendarDotRow: {
    flexDirection: "row",
    marginTop: 4,
  },
  calendarDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    marginRight: 3,
  },
  dayCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  dayLabel: {
    fontSize: 18,
    fontWeight: "900",
  },
  dayDate: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  dayCount: {
    fontSize: 13,
    fontWeight: "900",
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 19,
    paddingTop: 8,
  },
  dueOrderLabel: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
    marginTop: 10,
    textTransform: "uppercase",
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 11,
    marginTop: 9,
  },
  priorityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
    marginRight: 10,
  },
  taskCopy: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  taskDone: {
    textDecorationLine: "line-through",
  },
  taskMeta: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  calendarButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginLeft: 10,
  },
  calendarButtonText: {
    fontSize: 11,
    fontWeight: "900",
  },
});
