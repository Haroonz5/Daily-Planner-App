import { Linking } from "react-native";

export type CalendarTask = {
  title: string;
  date: string;
  time: string;
  notes?: string | null;
};

const parseTaskDate = (dateString: string, timeString: string) => {
  const [year, month, day] = dateString.split("-").map(Number);
  const match = timeString.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (!year || !month || !day || !match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3].toUpperCase();

  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;

  return new Date(year, month - 1, day, hours, minutes, 0, 0);
};

const formatGoogleDate = (date: Date) =>
  date.toISOString().replace(/[-:]|\.\d{3}/g, "");

export const openTaskInGoogleCalendar = async (task: CalendarTask) => {
  const start = parseTaskDate(task.date, task.time);
  if (!start) return false;

  const end = new Date(start.getTime() + 45 * 60 * 1000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: task.title,
    dates: `${formatGoogleDate(start)}/${formatGoogleDate(end)}`,
    details:
      task.notes?.trim() ||
      "Planned from Daily Discipline. Keep it honest and finish the block.",
  });

  const url = `https://calendar.google.com/calendar/render?${params.toString()}`;
  const canOpen = await Linking.canOpenURL(url).catch(() => false);
  if (!canOpen) return false;

  await Linking.openURL(url);
  return true;
};
