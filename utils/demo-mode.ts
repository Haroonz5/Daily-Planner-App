import { collection, doc, writeBatch } from "firebase/firestore";

import { db } from "@/constants/firebaseConfig";
import { formatDateKey } from "@/utils/task-helpers";

const addDays = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return formatDateKey(date);
};

const demoTasks = [
  {
    title: "Gym strength block",
    time: "6:00 PM",
    priority: "High",
    dateOffset: 0,
    notes: "Demo high-priority recurring habit.",
  },
  {
    title: "Study algorithms",
    time: "8:00 PM",
    priority: "High",
    dateOffset: 0,
    notes: "Demo deep-work task for AI breakdown and Focus Mode.",
  },
  {
    title: "Meal prep",
    time: "4:00 PM",
    priority: "Medium",
    dateOffset: 1,
    notes: "Demo future planning task.",
  },
  {
    title: "Read 10 pages",
    time: "9:30 PM",
    priority: "Low",
    dateOffset: -1,
    completed: true,
    notes: "Completed demo history for stats.",
  },
  {
    title: "Clean room reset",
    time: "7:00 PM",
    priority: "Medium",
    dateOffset: -2,
    completed: true,
    notes: "Completed demo history for streaks.",
  },
] as const;

export const seedDemoMode = async (uid: string) => {
  const batch = writeBatch(db);
  const now = new Date();

  batch.set(
    doc(db, "users", uid),
    {
      demoModeEnabled: true,
      demoSeededAt: now,
      weeklyFocusGoal: "Ship one polished portfolio feature every week.",
      planningRules:
        "Prefer realistic plans, protect workouts, and keep high-priority work before 9 PM.",
      aiMemory:
        "Demo user performs best in evening focus blocks and needs space around gym tasks.",
      energyMode: "steady",
      proPreviewEnabled: true,
    },
    { merge: true }
  );

  demoTasks.forEach((task, index) => {
    const taskRef = doc(collection(db, "users", uid, "tasks"));
    const completed = "completed" in task ? Boolean(task.completed) : false;

    batch.set(taskRef, {
      title: task.title,
      time: task.time,
      date: addDays(task.dateOffset),
      priority: task.priority,
      notes: task.notes,
      completed,
      status: completed ? "completed" : "pending",
      createdAt: now,
      completedAt: completed ? now : null,
      skippedAt: null,
      lastActionAt: now,
      rescheduledCount: index === 1 ? 1 : 0,
      originalTime: task.time,
      recurrence: index === 0 ? "daily" : "none",
      recurrenceGroupId: index === 0 ? `${uid}-demo-gym-routine` : null,
      recurrenceDays: null,
      rollingRoutine: index === 0,
      demoTask: true,
    });
  });

  await batch.commit();
  return demoTasks.length;
};
