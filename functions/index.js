const admin = require("firebase-admin");
const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");

admin.initializeApp();

const db = admin.firestore();

const TASK_PUSH_LOOKAHEAD_MINUTES = 8;
const TASK_PUSH_GRACE_MINUTES = 2;

const isExpoPushToken = (token) =>
  typeof token === "string" &&
  (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["));

const sendExpoPush = async ({ token, title, body, data }) => {
  if (!isExpoPushToken(token)) {
    return { ok: false, reason: "missing-token" };
  }

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: token,
      sound: "default",
      title,
      body,
      data,
    }),
  });

  if (!response.ok) {
    return { ok: false, reason: `expo-${response.status}` };
  }

  return { ok: true, reason: "sent" };
};

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

const parseClockTime = (time) => {
  const match = String(time || "").trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || "0");
  const period = match[3].toUpperCase();

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;

  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;

  return { hour, minute };
};

const parseTaskDateTime = (dateKey, time) => {
  const [year, month, day] = String(dateKey || "").split("-").map(Number);
  const parsedTime = parseClockTime(time);
  if (!year || !month || !day || !parsedTime) return null;

  return new Date(year, month - 1, day, parsedTime.hour, parsedTime.minute, 0, 0);
};

const writePushReceipt = async ({ uid, type, status, reason, token, title, body, data }) => {
  if (!uid) return;

  await db
    .collection("users")
    .doc(uid)
    .collection("pushReceipts")
    .add({
      type,
      status,
      reason,
      tokenSuffix: typeof token === "string" ? token.slice(-12) : null,
      title,
      body,
      data: data || {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    .catch(() => {});
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


exports.sendPushOnAccountabilityNudge = onDocumentCreated(
  "accountabilityNudges/{nudgeId}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const nudge = snapshot.data();
    if (!nudge?.toUid || !nudge?.fromUid) return;

    const recipient = await db.collection("users").doc(nudge.toUid).get();
    const recipientData = recipient.data() || {};
    const token = recipientData.expoPushToken;

    // I added this so friend nudges can become real push notifications in
    // preview/production builds. The app still shows in-app nudges if push is
    // unavailable, so accountability does not depend on a perfect device setup.
    const result = await sendExpoPush({
      token,
      title: "Accountability check-in",
      body:
        nudge.message ||
        `${nudge.fromName || nudge.fromUsername || "A friend"} sent you a discipline nudge.`,
      data: {
        type: "accountabilityNudge",
        nudgeId: snapshot.id,
        fromUid: nudge.fromUid,
      },
    }).catch((error) => ({ ok: false, reason: error?.message || "send-failed" }));

    await snapshot.ref.update({
      pushStatus: result.ok ? "sent" : "not-sent",
      pushReason: result.reason,
      pushAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await writePushReceipt({
      uid: nudge.toUid,
      type: "accountabilityNudge",
      status: result.ok ? "sent" : "not-sent",
      reason: result.reason,
      token,
      title: "Accountability check-in",
      body:
        nudge.message ||
        `${nudge.fromName || nudge.fromUsername || "A friend"} sent you a discipline nudge.`,
      data: {
        type: "accountabilityNudge",
        nudgeId: snapshot.id,
        fromUid: nudge.fromUid,
      },
    });
  }
);


exports.sendDueTaskPushReminders = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "America/New_York",
  },
  async () => {
    const now = new Date();
    const today = formatDateKey(now);
    const windowStart = now.getTime() - TASK_PUSH_GRACE_MINUTES * 60 * 1000;
    const windowEnd = now.getTime() + TASK_PUSH_LOOKAHEAD_MINUTES * 60 * 1000;

    const snapshot = await db
      .collectionGroup("tasks")
      .where("date", "==", today)
      .where("completed", "==", false)
      .get();

    let checked = 0;
    let sent = 0;
    let skipped = 0;

    for (const document of snapshot.docs) {
      const task = document.data();
      checked += 1;

      if ((task.status || "pending") === "skipped" || task.duePushSentAt) {
        skipped += 1;
        continue;
      }

      const dueAt = parseTaskDateTime(task.date, task.time);
      if (!dueAt || dueAt.getTime() < windowStart || dueAt.getTime() > windowEnd) {
        skipped += 1;
        continue;
      }

      const userRef = document.ref.parent.parent;
      if (!userRef) {
        skipped += 1;
        continue;
      }

      const user = await userRef.get();
      const uid = userRef.id;
      const userData = user.data() || {};
      const token = userData.expoPushToken;
      const title = task.priority === "High" ? "High Priority Task" : "Task Reminder";
      const body = task.priority === "High"
        ? `${task.title} matters now. Do the honest block.`
        : `${task.title} is due at ${task.time}.`;
      const data = {
        type: "taskDue",
        taskId: document.id,
        taskTitle: task.title,
        date: task.date,
        time: task.time,
      };

      const result = await sendExpoPush({ token, title, body, data }).catch((error) => ({
        ok: false,
        reason: error?.message || "send-failed",
      }));

      await document.ref.update({
        duePushAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
        duePushStatus: result.ok ? "sent" : "not-sent",
        duePushReason: result.reason,
        ...(result.ok ? { duePushSentAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
      });

      await writePushReceipt({
        uid,
        type: "taskDue",
        status: result.ok ? "sent" : "not-sent",
        reason: result.reason,
        token,
        title,
        body,
        data,
      });

      if (result.ok) sent += 1;
      else skipped += 1;
    }

    console.log(`sendDueTaskPushReminders checked=${checked} sent=${sent} skipped=${skipped}`);
  }
);
