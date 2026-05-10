const admin = require("firebase-admin");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");

admin.initializeApp();

const db = admin.firestore();

const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseTaskDate = (dateKey) => {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
};

const getNextRecurringDate = (task) => {
  const current = parseTaskDate(task.date);

  if (task.recurrence === "daily") {
    current.setDate(current.getDate() + 1);
    return formatDateKey(current);
  }

  if (task.recurrence === "weekdays") {
    do {
      current.setDate(current.getDate() + 1);
    } while (current.getDay() === 0 || current.getDay() === 6);
    return formatDateKey(current);
  }

  if (task.recurrence === "weekly") {
    current.setDate(current.getDate() + 7);
    return formatDateKey(current);
  }

  if (task.recurrence === "custom" && Array.isArray(task.recurrenceDays)) {
    const allowedDays = task.recurrenceDays
      .map(Number)
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);

    if (allowedDays.length === 0) return null;

    do {
      current.setDate(current.getDate() + 1);
    } while (!allowedDays.includes(current.getDay()));
    return formatDateKey(current);
  }

  return null;
};

const buildWidgetSummary = (tasks, dateKey) => {
  const todayTasks = tasks.filter((task) => task.date === dateKey);
  const completed = todayTasks.filter((task) => task.completed).length;
  const open = todayTasks.filter(
    (task) => !task.completed && (task.status || "pending") !== "skipped"
  ).length;
  const nextTask = todayTasks
    .filter((task) => !task.completed && (task.status || "pending") !== "skipped")
    .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")))[0];

  return {
    today: dateKey,
    total: todayTasks.length,
    completed,
    open,
    nextTask: nextTask
      ? {
          title: nextTask.title,
          time: nextTask.time,
          priority: nextTask.priority || "Medium",
        }
      : null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
};

exports.updateWidgetSummaryOnTaskWrite = onDocumentWritten(
  "users/{userId}/tasks/{taskId}",
  async (event) => {
    const { userId } = event.params;
    const today = formatDateKey(new Date());
    const snapshot = await db.collection("users").doc(userId).collection("tasks").get();
    const tasks = snapshot.docs.map((doc) => doc.data());

    // I added this function so widget data can be refreshed by the backend too.
    // The app still writes a summary locally, but this gives the project a real
    // Cloud Functions story for production-style automation.
    await db
      .collection("users")
      .doc(userId)
      .collection("widgetSummary")
      .doc("today")
      .set(buildWidgetSummary(tasks, today), { merge: true });
  }
);

exports.refillRollingRoutines = onSchedule(
  {
    schedule: "every day 00:10",
    timeZone: "America/New_York",
  },
  async () => {
    const today = formatDateKey(new Date());
    const routines = await db
      .collectionGroup("tasks")
      .where("rollingRoutine", "==", true)
      .get();
    const latestByGroup = new Map();

    routines.docs.forEach((document) => {
      const task = { id: document.id, ref: document.ref, ...document.data() };
      if (!task.recurrenceGroupId || !task.recurrence || task.recurrence === "none") {
        return;
      }

      const current = latestByGroup.get(task.recurrenceGroupId);
      if (!current || String(task.date) > String(current.date)) {
        latestByGroup.set(task.recurrenceGroupId, task);
      }
    });

    const batch = db.batch();
    let created = 0;

    latestByGroup.forEach((task) => {
      if (String(task.date) > today) return;

      const nextDate = getNextRecurringDate(task);
      if (!nextDate) return;

      const nextRef = task.ref.parent.doc();
      batch.set(nextRef, {
        title: task.title,
        notes: task.notes || "",
        priority: task.priority || "Medium",
        time: task.time,
        date: nextDate,
        completed: false,
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        completedAt: null,
        skippedAt: null,
        lastActionAt: admin.firestore.FieldValue.serverTimestamp(),
        rescheduledCount: 0,
        originalTime: task.originalTime || task.time,
        recurrence: task.recurrence,
        recurrenceGroupId: task.recurrenceGroupId,
        recurrenceDays: task.recurrenceDays || null,
        rollingRoutine: true,
        generatedByFunction: true,
      });
      created += 1;
    });

    if (created > 0) await batch.commit();
    console.log(`refillRollingRoutines created ${created} task(s).`);
  }
);
