import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { collection, getDocs, query, where } from "firebase/firestore";

import { db } from "../constants/firebaseConfig";

export type NotificationTask = {
  id: string;
  title: string;
  time: string;
  date: string;
  completed?: boolean;
  status?: "pending" | "completed" | "skipped";
  priority?: "Low" | "Medium" | "High";
};

export type NotificationSettings = {
  taskRemindersEnabled: boolean;
  missedFollowUpEnabled: boolean;
  morningSummaryEnabled: boolean;
  eveningReminderEnabled: boolean;
  morningSummaryTime: string;
  eveningReminderTime: string;
};

export type ScheduledNotificationAudit = {
  total: number;
  taskReminderCount: number;
  missedFollowUpCount: number;
  morningSummaryCount: number;
  eveningReminderCount: number;
  duplicateCount: number;
  nextNotifications: {
    id: string;
    title: string;
    kind: string;
    taskId?: string;
  }[];
};

const TASK_NOTIFICATION_IDS_KEY = "taskNotificationIds";
const MORNING_SUMMARY_NOTIFICATION_KEY = "morningSummaryNotificationId";
const EVENING_REMINDER_NOTIFICATION_KEY = "eveningReminderNotificationId";
const NOTIFICATION_SETTINGS_KEY = "notificationSettings";
const MORNING_SUMMARY_NOTIFICATION_ID = "daily-discipline-morning-summary";
const EVENING_REMINDER_NOTIFICATION_ID = "daily-discipline-evening-reminder";

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  taskRemindersEnabled: true,
  missedFollowUpEnabled: true,
  morningSummaryEnabled: true,
  eveningReminderEnabled: true,
  morningSummaryTime: "7:00 AM",
  eveningReminderTime: "9:00 PM",
};

const NOTIFICATION_KINDS = {
  eveningReminder: "evening-planning-reminder",
  morningSummary: "morning-summary",
  taskDue: "task-due",
  taskMissed: "task-missed",
  test: "test",
} as const;

type TaskNotificationMap = Record<string, string[]>;

const getTaskDueNotificationId = (taskId: string) =>
  `daily-discipline-task-${taskId}-due`;

const getTaskMissedNotificationId = (taskId: string) =>
  `daily-discipline-task-${taskId}-missed`;

const getNotificationData = (request: Notifications.NotificationRequest) =>
  (request.content.data ?? {}) as {
    kind?: string;
    taskId?: string;
  };

const getNotificationAuditKey = (request: Notifications.NotificationRequest) => {
  const data = getNotificationData(request);
  return data.taskId
    ? `${data.kind ?? "unknown"}:${data.taskId}`
    : `${data.kind ?? "unknown"}:${request.content.title ?? request.identifier}`;
};

const parseTaskDateTime = (dateString: string, timeString: string) => {
  const [year, month, day] = dateString.split("-").map(Number);
  if (!year || !month || !day) return null;

  const parts = timeString.split(" ");
  if (parts.length !== 2) return null;

  const [timePart, period] = parts;
  const [hoursStr, minutesStr] = timePart.split(":");
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

  let normalizedHours = hours;
  if (period === "PM" && hours !== 12) normalizedHours += 12;
  if (period === "AM" && hours === 12) normalizedHours = 0;

  return new Date(year, month - 1, day, normalizedHours, minutes, 0, 0);
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

const parseClockTime = (time: string, fallback: string) => {
  const minutes = parseTimeToMinutes(time) ?? parseTimeToMinutes(fallback) ?? 0;
  return {
    hour: Math.floor(minutes / 60),
    minute: minutes % 60,
  };
};

const loadTaskNotificationMap = async (): Promise<TaskNotificationMap> => {
  const raw = await AsyncStorage.getItem(TASK_NOTIFICATION_IDS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as TaskNotificationMap;
  } catch {
    return {};
  }
};

const saveTaskNotificationMap = async (map: TaskNotificationMap) => {
  await AsyncStorage.setItem(TASK_NOTIFICATION_IDS_KEY, JSON.stringify(map));
};

export const getNotificationSettings = async (): Promise<NotificationSettings> => {
  const raw = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
  if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;

  try {
    const parsed = JSON.parse(raw) as Partial<NotificationSettings>;
    return {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...parsed,
    };
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
};

export const saveNotificationSettings = async (
  updates: Partial<NotificationSettings>
) => {
  const current = await getNotificationSettings();
  const next = {
    ...current,
    ...updates,
  };

  await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(next));
  return next;
};

const cancelMatchingScheduledNotifications = async ({
  storedId,
  stableId,
  title,
  kind,
}: {
  storedId?: string | null;
  stableId: string;
  title: string;
  kind: string;
}) => {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(
    () => []
  );
  const idsToCancel = new Set<string>();

  if (storedId) idsToCancel.add(storedId);
  idsToCancel.add(stableId);

  scheduled.forEach((request) => {
    const requestKind = (request.content.data as { kind?: string } | undefined)
      ?.kind;

    if (
      request.identifier === stableId ||
      request.identifier === storedId ||
      request.content.title === title ||
      requestKind === kind
    ) {
      idsToCancel.add(request.identifier);
    }
  });

  await Promise.all(
    [...idsToCancel].map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
    )
  );
};

export const ensureNotificationPermissions = async () => {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
};

export const ensureBaseReminders = async () => {
  const settings = await getNotificationSettings();
  const existingId = await AsyncStorage.getItem(EVENING_REMINDER_NOTIFICATION_KEY);
  await cancelMatchingScheduledNotifications({
    storedId: existingId,
    stableId: EVENING_REMINDER_NOTIFICATION_ID,
    title: "Plan tomorrow tonight",
    kind: NOTIFICATION_KINDS.eveningReminder,
  });

  if (!settings.eveningReminderEnabled) {
    await AsyncStorage.removeItem(EVENING_REMINDER_NOTIFICATION_KEY);
    return;
  }

  const granted = await ensureNotificationPermissions();
  if (!granted) return;

  const eveningTime = parseClockTime(
    settings.eveningReminderTime,
    DEFAULT_NOTIFICATION_SETTINGS.eveningReminderTime
  );

  const id = await Notifications.scheduleNotificationAsync({
    identifier: EVENING_REMINDER_NOTIFICATION_ID,
    content: {
      title: "Plan tomorrow tonight",
      body: "Don't leave tomorrow to chance. Set your tasks tonight so morning has direction.",
      data: { kind: NOTIFICATION_KINDS.eveningReminder },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: eveningTime.hour,
      minute: eveningTime.minute,
    },
  });

  await AsyncStorage.setItem(EVENING_REMINDER_NOTIFICATION_KEY, id);
};

export const cancelTaskNotifications = async (taskId: string) => {
  const notificationMap = await loadTaskNotificationMap();
  const ids = notificationMap[taskId] ?? [];
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(
    () => []
  );
  const idsToCancel = new Set([
    ...ids,
    getTaskDueNotificationId(taskId),
    getTaskMissedNotificationId(taskId),
  ]);

  scheduled.forEach((request) => {
    const data = getNotificationData(request);
    if (data.taskId === taskId) {
      idsToCancel.add(request.identifier);
    }
  });

  await Promise.all(
    [...idsToCancel].map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
    )
  );

  delete notificationMap[taskId];
  await saveTaskNotificationMap(notificationMap);
};

export const cancelManyTaskNotifications = async (taskIds: string[]) => {
  await Promise.all(taskIds.map((taskId) => cancelTaskNotifications(taskId)));
};

export const syncTaskNotifications = async (task: NotificationTask) => {
  await cancelTaskNotifications(task.id);

  const settings = await getNotificationSettings();
  if (!settings.taskRemindersEnabled) return;

  const granted = await ensureNotificationPermissions();
  if (!granted) return;

  if (task.completed || task.status === "completed" || task.status === "skipped") {
    return;
  }

  const dueDate = parseTaskDateTime(task.date, task.time);
  if (!dueDate) return;
  if (dueDate <= new Date()) return;

  const dueTitle =
    task.priority === "High" ? "High Priority Task" : "Task Reminder";
  const dueBody =
    task.priority === "High"
      ? `${task.title} matters today. Start when it hits.`
      : task.title;

  const dueId = await Notifications.scheduleNotificationAsync({
    identifier: getTaskDueNotificationId(task.id),
    content: {
      title: dueTitle,
      body: dueBody,
      data: { kind: NOTIFICATION_KINDS.taskDue, taskId: task.id },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: dueDate,
    },
  });

  const ids = [dueId];

  if (settings.missedFollowUpEnabled) {
    const missedDate = new Date(dueDate.getTime() + 15 * 60 * 1000);
    const missedId = await Notifications.scheduleNotificationAsync({
      identifier: getTaskMissedNotificationId(task.id),
      content: {
        title: "Still waiting on this one",
        body: `${task.title} was due at ${task.time}. Move now or reschedule honestly.`,
        data: { kind: NOTIFICATION_KINDS.taskMissed, taskId: task.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: missedDate,
      },
    });
    ids.push(missedId);
  }

  const notificationMap = await loadTaskNotificationMap();
  notificationMap[task.id] = ids;
  await saveTaskNotificationMap(notificationMap);
};

export const getScheduledNotificationAudit =
  async (): Promise<ScheduledNotificationAudit> => {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(
      () => []
    );
    const keyCounts = new Map<string, number>();

    scheduled.forEach((request) => {
      const key = getNotificationAuditKey(request);
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    });

    const duplicateCount = [...keyCounts.values()].reduce(
      (sum, count) => sum + Math.max(0, count - 1),
      0
    );

    const countKind = (kind: string) =>
      scheduled.filter((request) => getNotificationData(request).kind === kind)
        .length;

    return {
      total: scheduled.length,
      taskReminderCount: countKind(NOTIFICATION_KINDS.taskDue),
      missedFollowUpCount: countKind(NOTIFICATION_KINDS.taskMissed),
      morningSummaryCount: countKind(NOTIFICATION_KINDS.morningSummary),
      eveningReminderCount: countKind(NOTIFICATION_KINDS.eveningReminder),
      duplicateCount,
      nextNotifications: scheduled.slice(0, 5).map((request) => {
        const data = getNotificationData(request);
        return {
          id: request.identifier,
          title: request.content.title ?? "Scheduled reminder",
          kind: data.kind ?? "unknown",
          taskId: data.taskId,
        };
      }),
    };
  };

export const cleanupDuplicateScheduledNotifications = async () => {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(
    () => []
  );
  const seenKeys = new Set<string>();
  const duplicateIds: string[] = [];

  scheduled.forEach((request) => {
    const key = getNotificationAuditKey(request);
    if (seenKeys.has(key)) {
      duplicateIds.push(request.identifier);
      return;
    }

    seenKeys.add(key);
  });

  await Promise.all(
    duplicateIds.map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
    )
  );

  return duplicateIds.length;
};

export const syncMorningSummaryNotification = async (uid: string) => {
  const settings = await getNotificationSettings();
  const existingId = await AsyncStorage.getItem(MORNING_SUMMARY_NOTIFICATION_KEY);
  await cancelMatchingScheduledNotifications({
    storedId: existingId,
    stableId: MORNING_SUMMARY_NOTIFICATION_ID,
    title: "This is what past you said",
    kind: NOTIFICATION_KINDS.morningSummary,
  });

  if (!settings.morningSummaryEnabled) {
    await AsyncStorage.removeItem(MORNING_SUMMARY_NOTIFICATION_KEY);
    return;
  }

  const granted = await ensureNotificationPermissions();
  if (!granted) return;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const tomorrowDate = tomorrow.toISOString().split("T")[0];
  const tasksQuery = query(
    collection(db, "users", uid, "tasks"),
    where("date", "==", tomorrowDate)
  );

  const snapshot = await getDocs(tasksQuery);
  const tomorrowTasks = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as NotificationTask)
    .filter((task) => !task.completed && task.status !== "skipped")
    .sort((a, b) => {
      const timeA = parseTimeToMinutes(a.time) ?? 0;
      const timeB = parseTimeToMinutes(b.time) ?? 0;
      return timeA - timeB;
    });

  if (tomorrowTasks.length === 0) {
    await AsyncStorage.removeItem(MORNING_SUMMARY_NOTIFICATION_KEY);
    return;
  }

  const summaryDate = new Date(tomorrow);
  const morningTime = parseClockTime(
    settings.morningSummaryTime,
    DEFAULT_NOTIFICATION_SETTINGS.morningSummaryTime
  );
  summaryDate.setHours(morningTime.hour, morningTime.minute, 0, 0);

  if (summaryDate <= new Date()) {
    await AsyncStorage.removeItem(MORNING_SUMMARY_NOTIFICATION_KEY);
    return;
  }

  const preview = tomorrowTasks
    .slice(0, 3)
    .map((task) => `${task.time} ${task.title}`)
    .join(" • ");

  const extraCount = tomorrowTasks.length - 3;
  const body =
    extraCount > 0 ? `${preview} • +${extraCount} more` : preview;

  const id = await Notifications.scheduleNotificationAsync({
    identifier: MORNING_SUMMARY_NOTIFICATION_ID,
    content: {
      title: "This is what past you said",
      body,
      data: { kind: NOTIFICATION_KINDS.morningSummary },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: summaryDate,
    },
  });

  await AsyncStorage.setItem(MORNING_SUMMARY_NOTIFICATION_KEY, id);
};

export const refreshNotificationState = async (uid: string) => {
  await ensureBaseReminders();
  await syncMorningSummaryNotification(uid);
  await cleanupDuplicateScheduledNotifications();
};

export const scheduleQuickTestNotification = async () => {
  const granted = await ensureNotificationPermissions();
  if (!granted) return null;

  const date = new Date(Date.now() + 5000);

  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Daily Discipline Test",
      body: "If you saw this, your reminders are ready to work.",
      data: { kind: NOTIFICATION_KINDS.test },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
    },
  });
};
