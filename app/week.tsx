import { useRouter } from "expo-router";
import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { AmbientBackground } from "@/components/ambient-background";
import { useAppTheme } from "@/constants/appTheme";
import { Colors } from "@/constants/theme";
import { formatDateKey, getRelativeDateLabel, parseTimeToMinutes } from "@/utils/task-helpers";
import { auth, db } from "../constants/firebaseConfig";

type Task = {
  id: string;
  title: string;
  date: string;
  time: string;
  completed: boolean;
  priority?: "Low" | "Medium" | "High";
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

export default function WeekScreen() {
  const router = useRouter();
  const { themeName } = useAppTheme();
  const colors = Colors[themeName];
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    return onSnapshot(collection(db, "users", uid, "tasks"), (snap) => {
      setTasks(
        snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Task[]
      );
    });
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
          See the whole week before the schedule gets noisy.
        </Text>

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
              day.tasks.map((task) => {
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
                  </View>
                );
              })
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
});
