import * as Calendar from "expo-calendar";
import { Linking, Platform } from "react-native";

import { parseDateKey, parseTimeToMinutes } from "@/utils/task-helpers";

export type CalendarExportTask = {
  id: string;
  title: string;
  date: string;
  time: string;
  completed?: boolean;
  status?: "pending" | "completed" | "skipped";
  priority?: "Low" | "Medium" | "High";
};

type CalendarExportResult = {
  created: number;
  skipped: number;
  calendarTitle: string;
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
  daysAhead = 30
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
      exportedIds.has(`${task.id}-${task.date}-${task.time}`)
    ) {
      skipped += 1;
      continue;
    }

    exportedIds.add(`${task.id}-${task.date}-${task.time}`);

    // I export each active task as a normal phone calendar event so testers can
    // verify the app connects with the device calendar without changing the
    // Firestore task itself.
    await Calendar.createEventAsync(calendarId, {
      title: task.title,
      notes: `Daily Discipline task${task.priority ? ` - ${task.priority} priority` : ""}`,
      startDate,
      endDate: addMinutes(startDate, 30),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      alarms: [{ relativeOffset: -10 }],
    });
    created += 1;
  }

  return {
    created,
    skipped,
    calendarTitle: DAILY_DISCIPLINE_CALENDAR_TITLE,
  };
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
