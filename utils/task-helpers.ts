export type TaskPriority = "Low" | "Medium" | "High";
export type TaskStatus = "pending" | "completed" | "skipped";
export type RecurrenceRule = "none" | "daily" | "weekdays" | "weekly" | "custom";
export type TimeBucket = "early" | "morning" | "afternoon" | "evening";

export const weekdayShortLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type TaskLike = {
  date: string;
  time: string;
  completed: boolean;
  status?: TaskStatus;
  priority?: TaskPriority;
  rescheduledCount?: number;
  originalTime?: string;
};

export type BehaviorCallout = {
  title: string;
  body: string;
};

export const recurrenceLabels: Record<RecurrenceRule, string> = {
  none: "One time",
  daily: "Daily",
  weekdays: "Weekdays",
  weekly: "Weekly",
  custom: "Custom Days",
};

export const normalizeRecurrenceDays = (days?: number[] | null) =>
  [...new Set((days ?? []).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
    .sort((a, b) => a - b);

export const formatRecurrenceLabel = (
  recurrence: RecurrenceRule,
  recurrenceDays?: number[] | null
) => {
  if (recurrence !== "custom") return recurrenceLabels[recurrence];

  const days = normalizeRecurrenceDays(recurrenceDays);
  if (days.length === 0) return recurrenceLabels.custom;

  return days.map((day) => weekdayShortLabels[day]).join(", ");
};

export const parseTimeToMinutes = (time: string) => {
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

export const formatTimeFromDate = (date: Date) =>
  date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

export const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const parseDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

export const getRelativeDateLabel = (dateKey: string) => {
  const today = formatDateKey(new Date());
  const tomorrow = formatDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000));

  if (dateKey === today) return "Today";
  if (dateKey === tomorrow) return "Tomorrow";

  return parseDateKey(dateKey).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
};

export const getTimeBucket = (minutes: number | null): TimeBucket => {
  if (minutes === null) return "morning";
  if (minutes < 9 * 60) return "early";
  if (minutes < 12 * 60) return "morning";
  if (minutes < 17 * 60) return "afternoon";
  return "evening";
};

export const sortTasksBySchedule = <T extends { time: string }>(tasks: T[]) =>
  [...tasks].sort((a, b) => {
    const timeA = parseTimeToMinutes(a.time) ?? 0;
    const timeB = parseTimeToMinutes(b.time) ?? 0;
    return timeA - timeB;
  });

export const buildRecurringDates = (
  startDateKey: string,
  recurrence: RecurrenceRule,
  recurrenceDays?: number[] | null
) => {
  if (recurrence === "none") return [startDateKey];

  const startDate = parseDateKey(startDateKey);
  const dates: string[] = [];
  const customDays = normalizeRecurrenceDays(recurrenceDays);
  if (recurrence === "custom" && customDays.length === 0) return [startDateKey];
  const maxOccurrences = recurrence === "weekly" ? 8 : 10;
  let cursor = new Date(startDate);

  while (dates.length < maxOccurrences) {
    const day = cursor.getDay();
    const isWeekday = day !== 0 && day !== 6;

    if (
      recurrence === "daily" ||
      (recurrence === "weekdays" && isWeekday) ||
      recurrence === "weekly" ||
      (recurrence === "custom" && customDays.includes(day))
    ) {
      dates.push(formatDateKey(cursor));
    }

    cursor.setDate(
      cursor.getDate() + (recurrence === "weekly" ? 7 : 1)
    );
  }

  return dates;
};

export const getBehaviorCallout = (
  allTasks: TaskLike[],
  currentDateKey: string
): BehaviorCallout | null => {
  const historyTasks = allTasks.filter((task) => task.date < currentDateKey);
  const todayTasks = allTasks.filter((task) => task.date === currentDateKey);

  if (todayTasks.length >= 8) {
    return {
      title: "Plan Pressure",
      body: `You have ${todayTasks.length} tasks scheduled today. Protect the essentials and keep the rest honest.`,
    };
  }

  if (historyTasks.length < 5) return null;

  const bucketStats: Record<TimeBucket, { total: number; friction: number; completed: number }> = {
    early: { total: 0, friction: 0, completed: 0 },
    morning: { total: 0, friction: 0, completed: 0 },
    afternoon: { total: 0, friction: 0, completed: 0 },
    evening: { total: 0, friction: 0, completed: 0 },
  };

  historyTasks.forEach((task) => {
    const bucket = getTimeBucket(
      parseTimeToMinutes(task.originalTime ?? task.time)
    );
    bucketStats[bucket].total += 1;
    if (task.completed) bucketStats[bucket].completed += 1;
    if (
      (task.status ?? "pending") === "skipped" ||
      (task.rescheduledCount ?? 0) > 0
    ) {
      bucketStats[bucket].friction += 1;
    }
  });

  const bestBucket = (Object.keys(bucketStats) as TimeBucket[]).reduce(
    (best, bucket) => {
      const bestRate =
        bucketStats[best].total > 0
          ? bucketStats[best].completed / bucketStats[best].total
          : -1;
      const bucketRate =
        bucketStats[bucket].total > 0
          ? bucketStats[bucket].completed / bucketStats[bucket].total
          : -1;
      return bucketRate > bestRate ? bucket : best;
    },
    "morning"
  );

  const highestFriction = (Object.keys(bucketStats) as TimeBucket[]).reduce(
    (worst, bucket) => {
      const worstRate =
        bucketStats[worst].total > 0
          ? bucketStats[worst].friction / bucketStats[worst].total
          : -1;
      const bucketRate =
        bucketStats[bucket].total > 0
          ? bucketStats[bucket].friction / bucketStats[bucket].total
          : -1;
      return bucketRate > worstRate ? bucket : worst;
    },
    "morning"
  );

  if (
    bucketStats[highestFriction].total >= 3 &&
    bucketStats[highestFriction].friction / bucketStats[highestFriction].total >= 0.5
  ) {
    return {
      title: "Pattern Watch",
      body: `You usually struggle more in the ${highestFriction}. Move important work toward the ${bestBucket} when you can.`,
    };
  }

  const rescheduledTasks = historyTasks.filter(
    (task) => (task.rescheduledCount ?? 0) > 0
  ).length;

  if (rescheduledTasks >= 4) {
    return {
      title: "Timing Drift",
      body: "You often move tasks after the day starts. Leave more breathing room between plans so the schedule can survive real life.",
    };
  }

  return {
    title: "Best Window",
    body: `Your follow-through looks strongest in the ${bestBucket}. Put meaningful work there before the day gets noisy.`,
  };
};
