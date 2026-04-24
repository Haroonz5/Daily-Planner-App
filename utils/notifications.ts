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

const TASK_NOTIFICATION_IDS_KEY = "taskNotificationIds";
const MORNING_SUMMARY_NOTIFICATION_KEY = "morningSummaryNotificationId";
const EVENING_REMINDER_NOTIFICATION_KEY = "eveningReminderNotificationId";

type TaskNotificationMap = Record<string, string[]>;

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

export const ensureNotificationPermissions = async () => {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
};

export const ensureBaseReminders = async () => {
  const granted = await ensureNotificationPermissions();
  if (!granted) return;

  const existingId = await AsyncStorage.getItem(EVENING_REMINDER_NOTIFICATION_KEY);
  if (existingId) {
    await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {});
  }

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Plan tomorrow tonight",
      body: "Don't leave tomorrow to chance. Set your tasks tonight so morning has direction.",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 21,
      minute: 0,
    },
  });

  await AsyncStorage.setItem(EVENING_REMINDER_NOTIFICATION_KEY, id);
};

export const cancelTaskNotifications = async (taskId: string) => {
  const notificationMap = await loadTaskNotificationMap();
  const ids = notificationMap[taskId] ?? [];

  await Promise.all(
    ids.map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
    )
  );

  delete notificationMap[taskId];
  await saveTaskNotificationMap(notificationMap);
};

export const syncTaskNotifications = async (task: NotificationTask) => {
  await cancelTaskNotifications(task.id);

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
    content: {
      title: dueTitle,
      body: dueBody,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: dueDate,
    },
  });

  const missedDate = new Date(dueDate.getTime() + 15 * 60 * 1000);
  const missedId = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Still waiting on this one",
      body: `${task.title} was due at ${task.time}. Move now or reschedule honestly.`,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: missedDate,
    },
  });

  const notificationMap = await loadTaskNotificationMap();
  notificationMap[task.id] = [dueId, missedId];
  await saveTaskNotificationMap(notificationMap);
};

export const syncMorningSummaryNotification = async (uid: string) => {
  const granted = await ensureNotificationPermissions();
  if (!granted) return;

  const existingId = await AsyncStorage.getItem(MORNING_SUMMARY_NOTIFICATION_KEY);
  if (existingId) {
    await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {});
  }

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
  summaryDate.setHours(7, 0, 0, 0);

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
    content: {
      title: "This is what past you said",
      body,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: summaryDate,
    },
  });

  await AsyncStorage.setItem(MORNING_SUMMARY_NOTIFICATION_KEY, id);
};
