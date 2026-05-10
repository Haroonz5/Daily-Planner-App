import * as Calendar from "expo-calendar";
import { doc, updateDoc } from "firebase/firestore";
import { Linking, Platform } from "react-native";

import { db } from "@/constants/firebaseConfig";
import {
  formatDateKey,
  formatTimeFromDate,
  parseDateKey,
  parseTimeToMinutes,
} from "@/utils/task-helpers";

export type CalendarExportTask = {
  id: string;
  title: string;
  date: string;
  time: string;
  completed?: boolean;
  status?: "pending" | "completed" | "skipped";
  priority?: "Low" | "Medium" | "High";
  calendarEventId?: string | null;
  calendarId?: string | null;
};

type CalendarExportResult = {
  created: number;
  skipped: number;
  calendarTitle: string;
};

type CalendarPullResult = {
  checked: number;
  updated: number;
  missing: number;
};

const DAILY_DISCIPLINE_CALENDAR_TITLE = "Daily Discipline";

const addMinutes = (date: Date, minutes: number) =>
  new Date(date.getTime() + minutes * 60 * 1000);

const parseTaskDateTime = (dateKey: string, time: string) => {
  const minutes = parseTimeToMinutes(time);
  if (minutes === null) return null;

  const date = parseDateKey(dateKey);
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
};

const formatGoogleDate = (date: Date) =>
  date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

const isWritableCalendar = (calendar: Calendar.Calendar) =>
  calendar.allowsModifications &&
  (!calendar.entityType || calendar.entityType === Calendar.EntityTypes.EVENT);

const ensureCalendarPermission = async () => {
  const current = await Calendar.getCalendarPermissionsAsync();
  if (current.granted) return true;

  const requested = await Calendar.requestCalendarPermissionsAsync();
  return requested.granted;
};

const getCalendarSource = async () => {
  if (Platform.OS === "ios") {
    const defaultCalendar = await Calendar.getDefaultCalendarAsync();
    return {
      source: defaultCalendar.source,
      sourceId: defaultCalendar.sourceId,
    };
  }

  return {
    source: {
      isLocalAccount: true,
      name: DAILY_DISCIPLINE_CALENDAR_TITLE,
      type: Calendar.SourceType.LOCAL,
    },
    sourceId: undefined,
  };
};

const getWritableCalendarId = async () => {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const existingDailyCalendar = calendars.find(
    (calendar) =>
      calendar.title === DAILY_DISCIPLINE_CALENDAR_TITLE &&
      isWritableCalendar(calendar)
  );
  if (existingDailyCalendar) return existingDailyCalendar.id;

  const writableCalendar = calendars.find(isWritableCalendar);
  if (writableCalendar) return writableCalendar.id;

  const { source, sourceId } = await getCalendarSource();
  return Calendar.createCalendarAsync({
    title: DAILY_DISCIPLINE_CALENDAR_TITLE,
    color: "#2563eb",
    entityType: Calendar.EntityTypes.EVENT,
    source,
    sourceId,
    name: DAILY_DISCIPLINE_CALENDAR_TITLE,
    ownerAccount: DAILY_DISCIPLINE_CALENDAR_TITLE,
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
};

export const exportTasksToCalendar = async (
  tasks: CalendarExportTask[],
  daysAhead = 30,
  options?: { uid?: string }
): Promise<CalendarExportResult> => {
  const granted = await ensureCalendarPermission();
  if (!granted) {
    throw new Error("Calendar permission is off.");
  }

  const calendarId = await getWritableCalendarId();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastDate = addMinutes(today, daysAhead * 24 * 60);

  let created = 0;
  let skipped = 0;
  const exportedIds = new Set<string>();

  for (const task of tasks) {
    const startDate = parseTaskDateTime(task.date, task.time);
    if (
      !startDate ||
      startDate < today ||
      startDate > lastDate ||
      task.completed ||
      task.status === "completed" ||
      task.status === "skipped" ||
      task.calendarEventId ||
      exportedIds.has(`${task.id}-${task.date}-${task.time}`)
    ) {
      skipped += 1;
      continue;
    }

    exportedIds.add(`${task.id}-${task.date}-${task.time}`);

    // I export each active task as a normal phone calendar event so testers can
    // verify the app connects with the device calendar without changing the
    // Firestore task itself.
    const eventId = await Calendar.createEventAsync(calendarId, {
      title: task.title,
      notes: `Daily Discipline task${task.priority ? ` - ${task.priority} priority` : ""}`,
      startDate,
      endDate: addMinutes(startDate, 30),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      alarms: [{ relativeOffset: -10 }],
    });

    if (options?.uid) {
      await updateDoc(doc(db, "users", options.uid, "tasks", task.id), {
        calendarEventId: eventId,
        calendarId,
        calendarSyncedAt: new Date(),
      }).catch(() => {});
    }
    created += 1;
  }

  return {
    created,
    skipped,
    calendarTitle: DAILY_DISCIPLINE_CALENDAR_TITLE,
  };
};

export const syncCalendarChangesToTasks = async (
  uid: string,
  tasks: CalendarExportTask[]
): Promise<CalendarPullResult> => {
  const granted = await ensureCalendarPermission();
  if (!granted) {
    throw new Error("Calendar permission is off.");
  }

  let checked = 0;
  let updated = 0;
  let missing = 0;

  for (const task of tasks) {
    if (!task.calendarEventId) continue;

    checked += 1;
    const event = await Calendar.getEventAsync(task.calendarEventId).catch(
      () => null
    );

    if (!event?.startDate) {
      missing += 1;
      continue;
    }

    const startDate = new Date(event.startDate);
    const nextDate = formatDateKey(startDate);
    const nextTime = formatTimeFromDate(startDate);

    if (nextDate === task.date && nextTime === task.time) continue;

    // I added this pull-sync as a practical first calendar sync: if a tester
    // drags a Daily Discipline event in their phone calendar, Settings can pull
    // the changed date/time back onto the matching task.
    await updateDoc(doc(db, "users", uid, "tasks", task.id), {
      date: nextDate,
      time: nextTime,
      originalTime: task.time,
      calendarLastPulledAt: new Date(),
    });
    updated += 1;
  }

  return { checked, updated, missing };
};

export const openTaskInGoogleCalendar = async (task: CalendarExportTask) => {
  const startDate = parseTaskDateTime(task.date, task.time);
  if (!startDate) return false;

  const endDate = addMinutes(startDate, 30);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: task.title,
    dates: `${formatGoogleDate(startDate)}/${formatGoogleDate(endDate)}`,
    details: `Daily Discipline task${task.priority ? ` - ${task.priority} priority` : ""}`,
  });
  const url = `https://calendar.google.com/calendar/render?${params.toString()}`;

  // This keeps the older Week Planner button working while Settings gets the
  // new native export flow.
  const canOpen = await Linking.canOpenURL(url).catch(() => true);
  if (!canOpen) return false;

  await Linking.openURL(url);
  return true;
};
