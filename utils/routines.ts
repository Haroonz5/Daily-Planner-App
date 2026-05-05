import { collection, doc, writeBatch } from "firebase/firestore";

import { db } from "../constants/firebaseConfig";
import { cancelTaskNotifications, syncTaskNotifications } from "./notifications";
import {
  formatDateKey,
  getNextRecurringDate,
  normalizeRecurrenceDays,
  parseTimeToMinutes,
  type RecurrenceRule,
  type TaskPriority,
  type TaskStatus,
} from "./task-helpers";

export type RollingRoutineTask = {
  id: string;
  title: string;
  time: string;
  date: string;
  completed: boolean;
  priority?: TaskPriority;
  notes?: string | null;
  status?: TaskStatus;
  recurrence?: RecurrenceRule;
  recurrenceGroupId?: string | null;
  recurrenceDays?: number[] | null;
};

export const ensureRollingRoutineTasks = async ({
  uid,
  tasks,
}: {
  uid: string;
  tasks: RollingRoutineTask[];
}) => {
  const todayKey = formatDateKey(new Date());
  const grouped = new Map<string, RollingRoutineTask[]>();

  tasks.forEach((task) => {
    if (
      !task.recurrenceGroupId ||
      !task.recurrence ||
      task.recurrence === "none"
    ) {
      return;
    }

    grouped.set(task.recurrenceGroupId, [
      ...(grouped.get(task.recurrenceGroupId) ?? []),
      task,
    ]);
  });

  const batch = writeBatch(db);
  const taskIdsToCancel: string[] = [];
  const notificationTasks: {
    id: string;
    title: string;
    time: string;
    date: string;
    priority?: TaskPriority;
  }[] = [];
  let generatedCount = 0;
  let operationCount = 0;

  grouped.forEach((groupTasks, recurrenceGroupId) => {
    const sortedTasks = [...groupTasks].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (parseTimeToMinutes(a.time) ?? 0) - (parseTimeToMinutes(b.time) ?? 0);
    });
    const template =
      sortedTasks.find(
        (task) =>
          task.date >= todayKey &&
          !task.completed &&
          (task.status ?? "pending") !== "skipped"
      ) ?? sortedTasks[sortedTasks.length - 1];

    if (!template?.recurrence || template.recurrence === "none") return;

    const activeFutureTasks = sortedTasks.filter(
      (task) =>
        task.date >= todayKey &&
        !task.completed &&
        (task.status ?? "pending") !== "skipped"
    );

    if (activeFutureTasks.length > 1) {
      activeFutureTasks.slice(1).forEach((task) => {
        batch.delete(doc(db, "users", uid, "tasks", task.id));
        taskIdsToCancel.push(task.id);
        operationCount += 1;
      });
    }

    if (activeFutureTasks.length > 0) return;

    const latestExistingDate = sortedTasks[sortedTasks.length - 1]?.date ?? todayKey;
    const nextDate = getNextRecurringDate({
      fromDateKey: latestExistingDate,
      recurrence: template.recurrence,
      recurrenceDays: template.recurrenceDays,
      weeklyAnchorDateKey: template.date,
    });

    if (!nextDate) return;

    const taskRef = doc(collection(db, "users", uid, "tasks"));
    const recurrenceDays =
      template.recurrence === "custom"
        ? normalizeRecurrenceDays(template.recurrenceDays)
        : null;

    batch.set(taskRef, {
      title: template.title,
      notes: template.notes ?? "",
      priority: template.priority ?? "Medium",
      time: template.time,
      date: nextDate,
      completed: false,
      status: "pending",
      createdAt: new Date(),
      completedAt: null,
      skippedAt: null,
      lastActionAt: new Date(),
      rescheduledCount: 0,
      originalTime: template.time,
      recurrence: template.recurrence,
      recurrenceGroupId,
      recurrenceDays,
      rollingRoutine: true,
      routineGeneratedAt: new Date(),
    });

    notificationTasks.push({
      id: taskRef.id,
      title: template.title,
      time: template.time,
      date: nextDate,
      priority: template.priority,
    });
    generatedCount += 1;
    operationCount += 1;
  });

  if (operationCount === 0) return 0;

  await batch.commit();
  await Promise.all(taskIdsToCancel.map((taskId) => cancelTaskNotifications(taskId)));
  await Promise.all(
    notificationTasks.map((task) =>
      syncTaskNotifications({
        ...task,
        completed: false,
        status: "pending",
      })
    )
  ).catch(() => {});

  return generatedCount;
};
