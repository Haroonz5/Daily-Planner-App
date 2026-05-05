import { formatDateKey, type RecurrenceRule } from "./task-helpers";

export type AiTaskPriority = "Low" | "Medium" | "High";
// I added "gemini" here so the app can label real Gemini responses as AI
// instead of accidentally showing them as the backend's local planner.
export type AiSource = "openai" | "gemini" | "local" | "offline";

export type AiExistingTask = {
  title: string;
  date: string;
  time: string;
  priority?: AiTaskPriority;
  durationMinutes?: number | null;
  completed?: boolean;
  status?: "pending" | "completed" | "skipped";
};

export type ParsedAiTask = {
  title: string;
  date: string;
  time: string;
  priority: AiTaskPriority;
  durationMinutes?: number | null;
  notes?: string;
  recurrence?: RecurrenceRule;
  recurrenceDays?: number[] | null;
};

export type ParseNaturalTasksResult = {
  tasks: ParsedAiTask[];
  warnings: string[];
  source: AiSource;
};

export type RealityCheckSeverity = "clear" | "watch" | "overloaded";

export type RealityCheckResult = {
  severity: RealityCheckSeverity;
  summary: string;
  totalMinutes: number;
  taskCount: number;
  warnings: string[];
  suggestions: string[];
  suggestedTrimTitles: string[];
  source: AiSource;
};

export type AiRescheduleTask = AiExistingTask & {
  id: string;
  rescheduledCount?: number | null;
};

export type AiRescheduleSuggestion = {
  taskId: string;
  title: string;
  suggestedTime: string;
  reason: string;
};

export type AiRescheduleResult = {
  suggestions: AiRescheduleSuggestion[];
  summary: string;
  source: AiSource;
};

export type AiHistoryTask = AiExistingTask & {
  id?: string;
  rescheduledCount?: number | null;
  completedAt?: string | null;
  skippedAt?: string | null;
};

export type DailyFeedbackResult = {
  headline: string;
  message: string;
  wins: string[];
  adjustments: string[];
  source: AiSource;
};

export type PatternInsight = {
  title: string;
  body: string;
  action: string;
  confidence: "low" | "medium" | "high";
};

export type PatternFeedbackResult = {
  insights: PatternInsight[];
  summary: string;
  source: AiSource;
};

export type WeeklyReviewResult = {
  headline: string;
  summary: string;
  wins: string[];
  risks: string[];
  nextWeekFocus: string[];
  source: AiSource;
};

export type RoutineCoachTask = AiHistoryTask;

export type RoutineCoachResult = {
  headline: string;
  message: string;
  suggestions: string[];
  source: AiSource;
};

export type TaskBreakdownStep = {
  title: string;
  durationMinutes: number;
  priority: AiTaskPriority;
  notes: string;
};

export type TaskBreakdownResult = {
  steps: TaskBreakdownStep[];
  summary: string;
  source: AiSource;
};

const getAiApiUrl = () => {
  const configuredUrl = process.env.EXPO_PUBLIC_AI_API_URL;
  return configuredUrl?.replace(/\/$/, "") || "http://127.0.0.1:8000";
};

const normalizeAiSource = (source: unknown): Exclude<AiSource, "offline"> =>
  // This connects the backend's source field to the UI. Unknown sources stay safe
  // by falling back to "local" instead of crashing the task planner.
  source === "openai" || source === "gemini" ? source : "local";

const parseTimeToDate = (time: string) => {
  const match = time.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  const period = match[3]?.toUpperCase();

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours > 12 || minutes > 59) return null;

  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  if (!period && hours < 8) hours += 12;

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
};

const formatTaskTime = (time: string) => {
  const date = parseTimeToDate(time);
  if (!date) return null;

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getLocalDuration = (text: string) => {
  const match = text.match(
    /\bfor\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)\b/i
  );
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (Number.isNaN(value)) return null;
  return unit.startsWith("hour") || unit.startsWith("hr")
    ? Math.round(value * 60)
    : Math.round(value);
};

const recurrenceRules: RecurrenceRule[] = [
  "none",
  "daily",
  "weekdays",
  "weekly",
  "custom",
];

const normalizeRecurrence = (value: unknown): RecurrenceRule =>
  recurrenceRules.includes(value as RecurrenceRule)
    ? (value as RecurrenceRule)
    : "none";

const weekdayAliases: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thrs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const parseWeekdayToken = (token: string) =>
  weekdayAliases[token.toLowerCase().replace(/\./g, "")] ?? null;

const expandWeekdayRange = (startDay: number, endDay: number) => {
  const days: number[] = [];
  let cursor = startDay;

  while (true) {
    days.push(cursor);
    if (cursor === endDay) break;
    cursor = (cursor + 1) % 7;
  }

  return days;
};

const getLocalRecurrenceDetails = (
  text: string
): { recurrence: RecurrenceRule; recurrenceDays?: number[] | null } => {
  const lower = text.toLowerCase();
  const weekdayPattern =
    "(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:s|nesday)?|thrs|thu(?:r|rs|rsday|rday)?|fri(?:day)?|sat(?:urday)?)";
  const rangeMatch = lower.match(
    new RegExp(
      `\\b(?:only\\s+|every\\s+|on\\s+)?${weekdayPattern}\\s*(?:-|to|through|thru)\\s*${weekdayPattern}\\b`,
      "i"
    )
  );

  if (rangeMatch) {
    const startDay = parseWeekdayToken(rangeMatch[1]);
    const endDay = parseWeekdayToken(rangeMatch[2]);

    if (startDay !== null && endDay !== null) {
      const days = expandWeekdayRange(startDay, endDay);
      const weekdays = [1, 2, 3, 4, 5];

      return weekdays.every((day, index) => days[index] === day) &&
        days.length === weekdays.length
        ? { recurrence: "weekdays", recurrenceDays: null }
        : { recurrence: "custom", recurrenceDays: days };
    }
  }

  const exceptMatch = lower.match(
    new RegExp(
      `\\b(?:every\\s+day|everyday|daily|each\\s+day)\\s+(?:except|not|excluding|besides)\\s+${weekdayPattern}\\b`,
      "i"
    )
  );

  if (exceptMatch) {
    const excludedDay = parseWeekdayToken(exceptMatch[1]);
    if (excludedDay !== null) {
      return {
        recurrence: "custom",
        recurrenceDays: [0, 1, 2, 3, 4, 5, 6].filter(
          (day) => day !== excludedDay
        ),
      };
    }
  }

  if (/\b(every\s+weekday|weekdays|monday\s+to\s+friday|mon\s*-\s*fri)\b/.test(lower)) {
    return { recurrence: "weekdays", recurrenceDays: null };
  }

  if (/\b(every\s+day|everyday|daily|each\s+day)\b/.test(lower)) {
    return { recurrence: "daily", recurrenceDays: null };
  }

  if (/\b(every\s+week|weekly|each\s+week)\b/.test(lower)) {
    return { recurrence: "weekly", recurrenceDays: null };
  }

  const singleWeekdayMatch = lower.match(
    new RegExp(`\\b(?:only\\s+|every\\s+)${weekdayPattern}s?\\b`, "i")
  );
  if (singleWeekdayMatch) {
    const day = parseWeekdayToken(singleWeekdayMatch[1]);
    if (day !== null) return { recurrence: "custom", recurrenceDays: [day] };
  }

  return { recurrence: "none", recurrenceDays: null };
};

const estimateTaskMinutes = (task: {
  durationMinutes?: number | null;
  priority?: AiTaskPriority;
}) => {
  if (task.durationMinutes) return task.durationMinutes;
  if (task.priority === "High") return 90;
  if (task.priority === "Low") return 30;
  return 60;
};

const getTimeMinutes = (time: string) => {
  const date = parseTimeToDate(time);
  if (!date) return null;
  return date.getHours() * 60 + date.getMinutes();
};

const getBucketLabel = (time?: string) => {
  if (!time) return "morning";
  const minutes = getTimeMinutes(time);
  if (minutes === null) return "morning";
  if (minutes < 9 * 60) return "early morning";
  if (minutes < 12 * 60) return "morning";
  if (minutes < 17 * 60) return "afternoon";
  return "evening";
};

const roundUpToInterval = (value: number, interval: number) =>
  Math.ceil(value / interval) * interval;

const formatMinutesToTaskTime = (minutes: number) => {
  const date = new Date();
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const cleanLocalTitle = (segment: string) => {
  const cleaned = segment
    .replace(/\b(today|tomorrow|next week)\b/gi, "")
    .replace(
      /\b(only\s+)?(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:s|nesday)?|thrs|thu(?:r|rs|rsday|rday)?|fri(?:day)?|sat(?:urday)?)(\s*(?:-|to|through|thru)\s*(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:s|nesday)?|thrs|thu(?:r|rs|rsday|rday)?|fri(?:day)?|sat(?:urday)?))?\b/gi,
      ""
    )
    .replace(
      /\b(every\s+weekday|weekdays|monday\s+to\s+friday|mon\s*-\s*fri|every\s+day|everyday|daily|each\s+day|every\s+week|weekly|each\s+week)\b/gi,
      ""
    )
    .replace(
      /\bfor\s+\d+(?:\.\d+)?\s*(hours?|hrs?|minutes?|mins?)\b/gi,
      ""
    )
    .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[,.-]+|[,.-]+$/g, "");

  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "Task";
};

const getLocalDate = (segment: string, defaultDate: string) => {
  const lower = segment.toLowerCase();
  if (lower.includes("tomorrow")) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDateKey(tomorrow);
  }

  if (lower.includes("today")) return formatDateKey(new Date());

  if (lower.includes("next week")) {
    const date = new Date(`${defaultDate}T12:00:00`);
    date.setDate(date.getDate() + 7);
    return formatDateKey(date);
  }

  return defaultDate;
};

const localParseNaturalTasks = (
  text: string,
  defaultDate: string
): ParseNaturalTasksResult => {
  const segments = text
    .split(/,|;|\band then\b|\bthen\b/i)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const warnings: string[] = [];
  const tasks = segments.flatMap((segment): ParsedAiTask[] => {
    const timeMatch = segment.match(/\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i);
    const formattedTime = timeMatch ? formatTaskTime(timeMatch[1]) : null;

    if (!formattedTime) {
      warnings.push(`Could not find a clear time for: ${segment}`);
      return [];
    }

    const durationMinutes = getLocalDuration(segment);
    const { recurrence, recurrenceDays } = getLocalRecurrenceDetails(segment);
    return [
      {
        title: cleanLocalTitle(segment),
        date: getLocalDate(segment, defaultDate),
        time: formattedTime,
        priority: /urgent|important|high priority/i.test(segment)
          ? "High"
          : /easy|low priority|small/i.test(segment)
            ? "Low"
            : "Medium",
        durationMinutes,
        recurrence,
        recurrenceDays,
        notes: durationMinutes
          ? `Estimated duration: ${durationMinutes} minutes`
          : "",
      },
    ];
  });

  if (tasks.length === 0) {
    warnings.push("Try writing tasks like: Gym at 6 PM, study for 2 hours at 8 PM.");
  }

  return { tasks, warnings, source: "offline" };
};

export const parseNaturalTasks = async ({
  text,
  defaultDate,
  timezone,
  existingTasks,
}: {
  text: string;
  defaultDate: string;
  timezone: string;
  existingTasks: AiExistingTask[];
}): Promise<ParseNaturalTasksResult> => {
  const fallback = () => localParseNaturalTasks(text, defaultDate);

  try {
    const response = await fetch(`${getAiApiUrl()}/v1/parse-tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        default_date: defaultDate,
        timezone,
        now: new Date().toISOString(),
        existing_tasks: existingTasks,
      }),
    });

    if (!response.ok) return fallback();

    const data = await response.json();
    return {
      tasks: (data.tasks ?? []).map((task: any) => ({
        title: String(task.title ?? "Task"),
        date: String(task.date ?? defaultDate),
        time: String(task.time ?? "9:00 AM"),
        priority: (["Low", "Medium", "High"].includes(task.priority)
          ? task.priority
          : "Medium") as AiTaskPriority,
        durationMinutes: task.duration_minutes ?? task.durationMinutes ?? null,
        recurrence: normalizeRecurrence(task.recurrence),
        recurrenceDays: Array.isArray(task.recurrence_days)
          ? task.recurrence_days
              .map(Number)
              .filter((day: number) => Number.isInteger(day) && day >= 0 && day <= 6)
          : Array.isArray(task.recurrenceDays)
            ? task.recurrenceDays
                .map(Number)
                .filter((day: number) => Number.isInteger(day) && day >= 0 && day <= 6)
            : null,
        notes: String(task.notes ?? ""),
      })),
      warnings: (data.warnings ?? []).map(String),
      source: normalizeAiSource(data.source),
    };
  } catch {
    return fallback();
  }
};

const localRealityCheck = ({
  proposedTasks,
  existingTasks,
}: {
  proposedTasks: ParsedAiTask[];
  existingTasks: AiExistingTask[];
}): RealityCheckResult => {
  const activeExistingTasks = existingTasks.filter(
    (task) => !task.completed && task.status !== "skipped"
  );
  const activeTasks = [...activeExistingTasks, ...proposedTasks];

  if (activeTasks.length === 0) {
    return {
      severity: "clear",
      summary: "No pressure detected yet. This plan has room to breathe.",
      totalMinutes: 0,
      taskCount: 0,
      warnings: [],
      suggestions: ["Add one meaningful task before adding filler."],
      suggestedTrimTitles: [],
      source: "offline",
    };
  }

  const proposedDates = new Set(proposedTasks.map((task) => task.date));
  const dates = proposedDates.size
    ? [...proposedDates]
    : [...new Set(activeTasks.map((task) => task.date))];
  const busiestDate = dates.reduce((busiest, date) => {
    const busiestMinutes = activeTasks
      .filter((task) => task.date === busiest)
      .reduce((sum, task) => sum + estimateTaskMinutes(task), 0);
    const dateMinutes = activeTasks
      .filter((task) => task.date === date)
      .reduce((sum, task) => sum + estimateTaskMinutes(task), 0);
    return dateMinutes > busiestMinutes ? date : busiest;
  }, dates[0]);

  const dayTasks = activeTasks.filter((task) => task.date === busiestDate);
  const proposedDayTasks = proposedTasks.filter((task) => task.date === busiestDate);
  const totalMinutes = dayTasks.reduce(
    (sum, task) => sum + estimateTaskMinutes(task),
    0
  );
  const taskCount = dayTasks.length;
  const highPriorityCount = dayTasks.filter((task) => task.priority === "High").length;
  const warnings: string[] = [];
  const suggestions: string[] = [];

  const severity: RealityCheckSeverity =
    totalMinutes >= 9 * 60 || taskCount >= 10
      ? "overloaded"
      : totalMinutes >= 6 * 60 || taskCount >= 7 || highPriorityCount >= 4
        ? "watch"
        : "clear";

  if (totalMinutes >= 6 * 60) {
    warnings.push(
      `${busiestDate} has about ${Math.round((totalMinutes / 60) * 10) / 10} hours of planned work.`
    );
  }

  if (taskCount >= 7) {
    warnings.push(`${busiestDate} has ${taskCount} active tasks.`);
  }

  if (highPriorityCount >= 4) {
    warnings.push(`${busiestDate} has ${highPriorityCount} high-priority tasks.`);
  }

  const scheduled = dayTasks
    .map((task) => ({ task, minutes: getTimeMinutes(task.time) }))
    .filter((item): item is { task: ParsedAiTask | AiExistingTask; minutes: number } =>
      item.minutes !== null
    )
    .sort((a, b) => a.minutes - b.minutes);
  const crowded = scheduled.some(
    (item, index) => index > 0 && item.minutes - scheduled[index - 1].minutes <= 45
  );

  if (crowded) {
    warnings.push("Some tasks are less than 45 minutes apart.");
  }

  const suggestedTrimTitles: string[] = [];
  let trimMinutes = totalMinutes;
  const trimCandidates = [...proposedDayTasks].sort(
    (a, b) =>
      ({ Low: 0, Medium: 1, High: 2 })[a.priority] -
      ({ Low: 0, Medium: 1, High: 2 })[b.priority]
  );

  for (const task of trimCandidates) {
    if (severity === "clear" || trimMinutes <= 6 * 60) break;
    suggestedTrimTitles.push(task.title);
    trimMinutes -= estimateTaskMinutes(task);
  }

  if (severity === "overloaded") {
    suggestions.push("Move or remove at least one lower-priority task before committing.");
  } else if (severity === "watch") {
    suggestions.push("Protect the most important work and leave buffer around it.");
  } else {
    suggestions.push("This plan looks realistic enough to try.");
  }

  if (crowded) {
    suggestions.push("Space close tasks farther apart or combine them into one block.");
  }

  if (suggestedTrimTitles.length > 0) {
    suggestions.push(`Best trim candidates: ${suggestedTrimTitles.slice(0, 3).join(", ")}.`);
  }

  return {
    severity,
    summary:
      severity === "overloaded"
        ? "This plan is likely too heavy to execute cleanly."
        : severity === "watch"
          ? "This plan can work, but it is close to the edge."
          : "This plan looks realistic enough to try.",
    totalMinutes,
    taskCount,
    warnings,
    suggestions,
    suggestedTrimTitles: suggestedTrimTitles.slice(0, 3),
    source: "offline",
  };
};

export const runRealityCheck = async ({
  proposedTasks,
  existingTasks,
  timezone,
}: {
  proposedTasks: ParsedAiTask[];
  existingTasks: AiExistingTask[];
  timezone: string;
}): Promise<RealityCheckResult> => {
  const fallback = () => localRealityCheck({ proposedTasks, existingTasks });

  try {
    const response = await fetch(`${getAiApiUrl()}/v1/reality-check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        proposed_tasks: proposedTasks.map((task) => ({
          title: task.title,
          date: task.date,
          time: task.time,
          priority: task.priority,
          duration_minutes: task.durationMinutes ?? null,
          completed: false,
          status: "pending",
        })),
        existing_tasks: existingTasks.map((task) => ({
          title: task.title,
          date: task.date,
          time: task.time,
          priority: task.priority ?? "Medium",
          duration_minutes: task.durationMinutes ?? null,
          completed: task.completed ?? false,
          status: task.status ?? "pending",
        })),
        timezone,
        now: new Date().toISOString(),
      }),
    });

    if (!response.ok) return fallback();

    const data = await response.json();
    return {
      severity: (["clear", "watch", "overloaded"].includes(data.severity)
        ? data.severity
        : "watch") as RealityCheckSeverity,
      summary: String(data.summary ?? "Reality check complete."),
      totalMinutes: Number(data.total_minutes ?? data.totalMinutes ?? 0),
      taskCount: Number(data.task_count ?? data.taskCount ?? 0),
      warnings: (data.warnings ?? []).map(String),
      suggestions: (data.suggestions ?? []).map(String),
      suggestedTrimTitles: (
        data.suggested_trim_titles ??
        data.suggestedTrimTitles ??
        []
      ).map(String),
      source: normalizeAiSource(data.source),
    };
  } catch {
    return fallback();
  }
};

const localAiReschedule = ({
  missedTasks,
  existingTasks,
}: {
  missedTasks: AiRescheduleTask[];
  existingTasks: AiRescheduleTask[];
}): AiRescheduleResult => {
  if (missedTasks.length === 0) {
    return {
      suggestions: [],
      summary: "No missed tasks need rescheduling right now.",
      source: "offline",
    };
  }

  const today = formatDateKey(new Date());
  const targetDate = missedTasks[0]?.date ?? today;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const earliestMinute =
    targetDate === today ? roundUpToInterval(currentMinutes + 30, 15) : 8 * 60;
  const missedIds = new Set(missedTasks.map((task) => task.id));
  const occupiedMinutes = existingTasks
    .filter(
      (task) =>
        task.date === targetDate &&
        !missedIds.has(task.id) &&
        !task.completed &&
        task.status !== "skipped"
    )
    .map((task) => getTimeMinutes(task.time))
    .filter((value): value is number => value !== null);
  const assignedMinutes: number[] = [];
  const preferredSlots = [
    13 * 60,
    14 * 60 + 30,
    16 * 60,
    18 * 60,
    19 * 60 + 30,
    21 * 60,
  ];

  const isAvailable = (minute: number, gap: number) => {
    if (minute < earliestMinute || minute > 23 * 60) return false;
    return [...occupiedMinutes, ...assignedMinutes].every(
      (existing) => Math.abs(existing - minute) >= gap
    );
  };

  const pickSlot = (task: AiRescheduleTask) => {
    const gap = Math.min(Math.max(estimateTaskMinutes(task), 45), 90);

    for (const slot of preferredSlots) {
      if (isAvailable(slot, gap)) return slot;
    }

    for (let minute = earliestMinute; minute <= 23 * 60; minute += 30) {
      if (isAvailable(minute, gap)) return minute;
    }

    for (let minute = earliestMinute; minute <= 23 * 60; minute += 15) {
      if (isAvailable(minute, 30)) return minute;
    }

    return Math.min(Math.max(earliestMinute, 21 * 60), 23 * 60);
  };

  const priorityRank: Record<AiTaskPriority, number> = {
    High: 0,
    Medium: 1,
    Low: 2,
  };
  const sortedMissedTasks = [...missedTasks].sort((a, b) => {
    const rankA = priorityRank[a.priority ?? "Medium"];
    const rankB = priorityRank[b.priority ?? "Medium"];
    if (rankA !== rankB) return rankA - rankB;
    return (getTimeMinutes(a.time) ?? 0) - (getTimeMinutes(b.time) ?? 0);
  });

  const suggestions = sortedMissedTasks.map((task): AiRescheduleSuggestion => {
    const minute = pickSlot(task);
    assignedMinutes.push(minute);

    return {
      taskId: task.id,
      title: task.title,
      suggestedTime: formatMinutesToTaskTime(minute),
      reason:
        (task.rescheduledCount ?? 0) >= 2
          ? "This has slipped before, so it gets a focused later slot."
          : "Moved to a realistic open slot with breathing room.",
    };
  });

  return {
    suggestions,
    summary: `I found cleaner slots for ${suggestions.length} missed ${
      suggestions.length === 1 ? "task" : "tasks"
    }.`,
    source: "offline",
  };
};

export const runAiReschedule = async ({
  missedTasks,
  existingTasks,
  timezone,
}: {
  missedTasks: AiRescheduleTask[];
  existingTasks: AiRescheduleTask[];
  timezone: string;
}): Promise<AiRescheduleResult> => {
  const fallback = () => localAiReschedule({ missedTasks, existingTasks });

  try {
    const response = await fetch(`${getAiApiUrl()}/v1/reschedule`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        missed_tasks: missedTasks.map((task) => ({
          id: task.id,
          title: task.title,
          date: task.date,
          time: task.time,
          priority: task.priority ?? "Medium",
          duration_minutes: task.durationMinutes ?? null,
          completed: task.completed ?? false,
          status: task.status ?? "pending",
          rescheduled_count: task.rescheduledCount ?? 0,
        })),
        existing_tasks: existingTasks.map((task) => ({
          id: task.id,
          title: task.title,
          date: task.date,
          time: task.time,
          priority: task.priority ?? "Medium",
          duration_minutes: task.durationMinutes ?? null,
          completed: task.completed ?? false,
          status: task.status ?? "pending",
          rescheduled_count: task.rescheduledCount ?? 0,
        })),
        timezone,
        now: new Date().toISOString(),
      }),
    });

    if (!response.ok) return fallback();

    const data = await response.json();
    return {
      suggestions: (data.suggestions ?? []).map((suggestion: any) => ({
        taskId: String(suggestion.task_id ?? suggestion.taskId ?? ""),
        title: String(suggestion.title ?? "Task"),
        suggestedTime: String(
          suggestion.suggested_time ?? suggestion.suggestedTime ?? "9:00 PM"
        ),
        reason: String(suggestion.reason ?? "Moved to a better open slot."),
      })),
      summary: String(data.summary ?? "I found cleaner reschedule slots."),
      source: normalizeAiSource(data.source),
    };
  } catch {
    return fallback();
  }
};

const localDailyFeedback = ({
  date,
  tasks,
}: {
  date: string;
  tasks: AiHistoryTask[];
}): DailyFeedbackResult => {
  const dayTasks = tasks.filter((task) => task.date === date);
  const total = dayTasks.length;
  const completedTasks = dayTasks.filter((task) => task.completed);
  const skippedTasks = dayTasks.filter((task) => task.status === "skipped");
  const pendingTasks = dayTasks.filter(
    (task) => !task.completed && task.status !== "skipped"
  );
  const rescheduledTasks = dayTasks.filter(
    (task) => (task.rescheduledCount ?? 0) > 0
  );

  if (total === 0) {
    return {
      headline: "Quiet day",
      message:
        "Nothing was scheduled today, so the best move is to set one clear priority for tomorrow.",
      wins: [],
      adjustments: [
        "Plan tomorrow before the day starts so discipline has a target.",
      ],
      source: "offline",
    };
  }

  const completed = completedTasks.length;
  const percent = Math.round((completed / total) * 100);
  const wins: string[] = [];
  const adjustments: string[] = [];
  const highCompleted = completedTasks.filter(
    (task) => task.priority === "High"
  ).length;

  if (completed > 0) wins.push(`You completed ${completed} of ${total} tasks.`);
  if (highCompleted > 0) {
    wins.push(
      `${highCompleted} high-priority task${highCompleted === 1 ? "" : "s"} got handled.`
    );
  }
  if (skippedTasks.length > 0) {
    adjustments.push(
      `${skippedTasks.length} task${skippedTasks.length === 1 ? "" : "s"} got skipped. Make those smaller or move them earlier.`
    );
  }
  if (pendingTasks.length > 0) {
    adjustments.push(
      `${pendingTasks.length} task${pendingTasks.length === 1 ? "" : "s"} stayed open. Reschedule only what still matters.`
    );
  }
  if (rescheduledTasks.length >= 2) {
    adjustments.push("Multiple tasks moved today. Add more buffer tomorrow.");
  }

  const plannedMinutes = dayTasks.reduce(
    (sum, task) => sum + estimateTaskMinutes(task),
    0
  );
  if (plannedMinutes >= 8 * 60) {
    adjustments.push(
      "Today carried a heavy workload. Keep tomorrow closer to 3-5 serious blocks."
    );
  }

  const headline =
    percent === 100
      ? "Clean sweep"
      : percent >= 70
        ? "Strong day"
        : percent >= 40
          ? "Mixed execution"
          : completed > 0
            ? "Small win banked"
            : "Reset needed";
  const message =
    percent === 100
      ? "You finished the whole plan. Keep tomorrow honest so the streak has room to continue."
      : percent >= 70
        ? "You got most of the important work done. Tighten the leftover friction tomorrow."
        : percent >= 40
          ? "There was real progress, but the plan needs fewer moving parts or better timing."
          : completed > 0
            ? "You did not blank the day. Tomorrow needs a lighter, more focused plan."
            : "Today did not convert into action. Pick one important task tomorrow and protect it.";

  return {
    headline,
    message,
    wins: wins.length ? wins.slice(0, 3) : ["You still learned what did not work."],
    adjustments: adjustments.length
      ? adjustments.slice(0, 3)
      : ["Repeat this structure tomorrow, but do not add filler tasks."],
    source: "offline",
  };
};

export const getDailyFeedback = async ({
  date,
  tasks,
  timezone,
}: {
  date: string;
  tasks: AiHistoryTask[];
  timezone: string;
}): Promise<DailyFeedbackResult> => {
  const fallback = () => localDailyFeedback({ date, tasks });

  try {
    const response = await fetch(`${getAiApiUrl()}/v1/daily-feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        date,
        timezone,
        now: new Date().toISOString(),
        tasks: tasks.map((task) => ({
          id: task.id ?? null,
          title: task.title,
          date: task.date,
          time: task.time ?? null,
          priority: task.priority ?? "Medium",
          completed: task.completed ?? false,
          status: task.status ?? "pending",
          rescheduled_count: task.rescheduledCount ?? 0,
          completed_at: task.completedAt ?? null,
          skipped_at: task.skippedAt ?? null,
        })),
      }),
    });

    if (!response.ok) return fallback();

    const data = await response.json();
    return {
      headline: String(data.headline ?? "Daily feedback"),
      message: String(data.message ?? "Review your day and adjust tomorrow."),
      wins: (data.wins ?? []).map(String),
      adjustments: (data.adjustments ?? []).map(String),
      source: normalizeAiSource(data.source),
    };
  } catch {
    return fallback();
  }
};

const localPatternFeedback = ({
  tasks,
}: {
  tasks: AiHistoryTask[];
}): PatternFeedbackResult => {
  if (tasks.length < 5) {
    return {
      insights: [
        {
          title: "Keep collecting signal",
          body: "A few more completed and skipped tasks will make your pattern feedback sharper.",
          action: "Use the app for a couple more days, then check this card again.",
          confidence: "low",
        },
      ],
      summary: "Not enough history for deep patterns yet.",
      source: "offline",
    };
  }

  const bucketTotals = new Map<string, number>();
  const bucketCompleted = new Map<string, number>();
  const bucketFriction = new Map<string, number>();
  const skipCounts = new Map<string, number>();
  const insights: PatternInsight[] = [];

  tasks.forEach((task) => {
    const bucket = getBucketLabel(task.time);
    bucketTotals.set(bucket, (bucketTotals.get(bucket) ?? 0) + 1);
    if (task.completed) {
      bucketCompleted.set(bucket, (bucketCompleted.get(bucket) ?? 0) + 1);
    }
    if (task.status === "skipped" || (task.rescheduledCount ?? 0) > 0) {
      bucketFriction.set(bucket, (bucketFriction.get(bucket) ?? 0) + 1);
    }
    if (task.status === "skipped") {
      skipCounts.set(task.title, (skipCounts.get(task.title) ?? 0) + 1);
    }
  });

  const bucketScores = [...bucketTotals.entries()]
    .filter(([, total]) => total >= 2)
    .map(([bucket, total]) => ({
      bucket,
      total,
      completionRate: (bucketCompleted.get(bucket) ?? 0) / total,
      frictionRate: (bucketFriction.get(bucket) ?? 0) / total,
    }));

  const bestBucket = bucketScores.reduce(
    (best, item) => (item.completionRate > best.completionRate ? item : best),
    bucketScores[0]
  );
  const worstBucket = bucketScores.reduce(
    (worst, item) => (item.frictionRate > worst.frictionRate ? item : worst),
    bucketScores[0]
  );

  if (bestBucket && bestBucket.total >= 3 && bestBucket.completionRate >= 0.6) {
    insights.push({
      title: `${bestBucket.bucket} works for you`,
      body: `You complete about ${Math.round(bestBucket.completionRate * 100)}% of tasks scheduled in the ${bestBucket.bucket}.`,
      action: `Put tomorrow's most important task in the ${bestBucket.bucket}.`,
      confidence: bestBucket.total >= 5 ? "high" : "medium",
    });
  }

  if (worstBucket && worstBucket.total >= 3 && worstBucket.frictionRate >= 0.45) {
    insights.push({
      title: `${worstBucket.bucket} creates friction`,
      body: `Tasks in the ${worstBucket.bucket} are skipped or rescheduled about ${Math.round(worstBucket.frictionRate * 100)}% of the time.`,
      action: "Move hard tasks out of that window or make them smaller.",
      confidence: worstBucket.total >= 5 ? "high" : "medium",
    });
  }

  const mostSkipped = [...skipCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (mostSkipped && mostSkipped[1] >= 2) {
    insights.push({
      title: `${mostSkipped[0]} keeps slipping`,
      body: `You skipped this task ${mostSkipped[1]} times in your history.`,
      action: "Rewrite it as a smaller first step or schedule it earlier.",
      confidence: mostSkipped[1] >= 3 ? "high" : "medium",
    });
  }

  if (insights.length === 0) {
    const completionRate =
      tasks.filter((task) => task.completed).length / Math.max(tasks.length, 1);
    insights.push({
      title: "Stable baseline forming",
      body: `Your current completion rate is about ${Math.round(completionRate * 100)}%.`,
      action: "Keep the plan simple and let stronger patterns emerge.",
      confidence: "medium",
    });
  }

  return {
    insights: insights.slice(0, 3),
    summary: "I found a few patterns in your task history.",
    source: "offline",
  };
};

const serializeHistoryTasks = (tasks: AiHistoryTask[]) =>
  tasks.map((task) => ({
    id: task.id ?? null,
    title: task.title,
    date: task.date,
    time: task.time ?? null,
    priority: task.priority ?? "Medium",
    completed: task.completed ?? false,
    status: task.status ?? "pending",
    rescheduled_count: task.rescheduledCount ?? 0,
    completed_at: task.completedAt ?? null,
    skipped_at: task.skippedAt ?? null,
  }));

export const getPatternFeedback = async ({
  tasks,
  timezone,
}: {
  tasks: AiHistoryTask[];
  timezone: string;
}): Promise<PatternFeedbackResult> => {
  const fallback = () => localPatternFeedback({ tasks });

  try {
    const response = await fetch(`${getAiApiUrl()}/v1/pattern-feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timezone,
        now: new Date().toISOString(),
        tasks: serializeHistoryTasks(tasks),
      }),
    });

    if (!response.ok) return fallback();

    const data = await response.json();
    return {
      insights: (data.insights ?? []).map((insight: any) => ({
        title: String(insight.title ?? "Pattern found"),
        body: String(insight.body ?? ""),
        action: String(insight.action ?? ""),
        confidence: (["low", "medium", "high"].includes(insight.confidence)
          ? insight.confidence
          : "medium") as PatternInsight["confidence"],
      })),
      summary: String(data.summary ?? "Pattern feedback ready."),
      source: normalizeAiSource(data.source),
    };
  } catch {
    return fallback();
  }
};

const localWeeklyReview = ({
  weekStart,
  weekEnd,
  tasks,
}: {
  weekStart: string;
  weekEnd: string;
  tasks: AiHistoryTask[];
}): WeeklyReviewResult => {
  const weekTasks = tasks.filter(
    (task) => task.date >= weekStart && task.date <= weekEnd
  );
  const total = weekTasks.length;
  const completed = weekTasks.filter((task) => task.completed).length;
  const skipped = weekTasks.filter((task) => task.status === "skipped").length;
  const rescheduled = weekTasks.filter(
    (task) => (task.rescheduledCount ?? 0) > 0
  ).length;
  const completionRate = total ? Math.round((completed / total) * 100) : 0;

  if (total === 0) {
    return {
      headline: "No weekly signal yet",
      summary:
        "This week has no scheduled tasks, so there is nothing useful to review yet.",
      wins: [],
      risks: ["A blank week makes it hard to build momentum."],
      nextWeekFocus: ["Schedule 3 anchor tasks before the week starts."],
      source: "offline",
    };
  }

  const wins: string[] = [];
  const risks: string[] = [];
  const nextWeekFocus: string[] = [];

  if (completed > 0) wins.push(`You completed ${completed} tasks this week.`);
  if (completionRate >= 70) {
    wins.push("Your weekly completion rate is strong enough to build on.");
  }
  if (skipped > 0) risks.push(`${skipped} tasks got skipped.`);
  if (rescheduled > 0) risks.push(`${rescheduled} tasks moved after planning.`);

  const completedBuckets = new Map<string, number>();
  weekTasks.forEach((task) => {
    if (!task.completed) return;
    const bucket = getBucketLabel(task.time);
    completedBuckets.set(bucket, (completedBuckets.get(bucket) ?? 0) + 1);
  });
  const bestBucket = [...completedBuckets.entries()].sort((a, b) => b[1] - a[1])[0];

  if (bestBucket) {
    wins.push(`Your strongest completion window was the ${bestBucket[0]}.`);
    nextWeekFocus.push(`Put one high-priority task in the ${bestBucket[0]}.`);
  }
  if (skipped >= 2) {
    nextWeekFocus.push("Cut or shrink the task type you skipped most often.");
  }
  if (rescheduled >= 2) {
    nextWeekFocus.push("Add more buffer between important tasks.");
  }
  if (completionRate < 50) {
    nextWeekFocus.push("Plan fewer tasks and protect one daily anchor.");
  }

  return {
    headline:
      completionRate >= 80
        ? "Strong week"
        : completionRate >= 50
          ? "Useful week"
          : "Reset week",
    summary:
      completionRate >= 80
        ? "Your execution is trending well. Protect the same structure next week."
        : completionRate >= 50
          ? "You made real progress, and the friction points are clear enough to adjust."
          : "The plan did not convert cleanly. Next week needs fewer tasks and tighter timing.",
    wins: wins.slice(0, 3),
    risks: risks.slice(0, 3),
    nextWeekFocus: nextWeekFocus.length
      ? nextWeekFocus.slice(0, 3)
      : ["Repeat what worked, but keep the plan lean."],
    source: "offline",
  };
};

export const getWeeklyReview = async ({
  weekStart,
  weekEnd,
  tasks,
  timezone,
}: {
  weekStart: string;
  weekEnd: string;
  tasks: AiHistoryTask[];
  timezone: string;
}): Promise<WeeklyReviewResult> => {
  const fallback = () => localWeeklyReview({ weekStart, weekEnd, tasks });

  try {
    const response = await fetch(`${getAiApiUrl()}/v1/weekly-review`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        week_start: weekStart,
        week_end: weekEnd,
        timezone,
        now: new Date().toISOString(),
        tasks: serializeHistoryTasks(tasks),
      }),
    });

    if (!response.ok) return fallback();

    const data = await response.json();
    return {
      headline: String(data.headline ?? "Weekly review"),
      summary: String(data.summary ?? "Review ready."),
      wins: (data.wins ?? []).map(String),
      risks: (data.risks ?? []).map(String),
      nextWeekFocus: (data.next_week_focus ?? data.nextWeekFocus ?? []).map(
        String
      ),
      source: normalizeAiSource(data.source),
    };
  } catch {
    return fallback();
  }
};

const localRoutineCoach = ({
  routineTitle,
  tasks,
}: {
  routineTitle: string;
  tasks: RoutineCoachTask[];
}): RoutineCoachResult => {
  const total = tasks.length;
  const completed = tasks.filter((task) => task.completed).length;
  const skipped = tasks.filter(
    (task) => (task.status ?? "pending") === "skipped"
  ).length;
  const rescheduled = tasks.filter(
    (task) => (task.rescheduledCount ?? 0) > 0
  ).length;
  const completionRate = total ? Math.round((completed / total) * 100) : 0;
  const suggestions: string[] = [];

  if (!total) {
    return {
      headline: "Routine is ready",
      message: "Use this routine a few times before changing the schedule.",
      suggestions: ["Review it after three attempts so the app has a real signal."],
      source: "offline",
    };
  }

  if (completionRate >= 80) {
    suggestions.push("Keep the current time stable and avoid making it harder yet.");
  } else if (completionRate >= 50) {
    suggestions.push("Try a smaller version or move it away from crowded hours.");
  } else {
    suggestions.push("Shrink the routine for one week so it becomes easier to restart.");
  }

  if (skipped > 0) {
    suggestions.push("The skipped days are the signal. Make those days lighter.");
  }
  if (rescheduled > 0) {
    suggestions.push("Repeated reschedules usually mean the time needs to move.");
  }

  return {
    headline:
      completionRate >= 80
        ? "Routine is holding strong"
        : completionRate >= 50
          ? "Routine needs a small adjustment"
          : "Routine has too much friction",
    message: `${routineTitle} is at ${completionRate}% consistency across ${total} logged attempt${total === 1 ? "" : "s"}.`,
    suggestions: suggestions.slice(0, 3),
    source: "offline",
  };
};

export const getRoutineCoach = async ({
  routineTitle,
  recurrenceLabel,
  time,
  tasks,
  timezone,
}: {
  routineTitle: string;
  recurrenceLabel: string;
  time: string;
  tasks: RoutineCoachTask[];
  timezone: string;
}): Promise<RoutineCoachResult> => {
  const fallback = () => localRoutineCoach({ routineTitle, tasks });

  try {
    const response = await fetch(`${getAiApiUrl()}/v1/routine-coach`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        routine_title: routineTitle,
        recurrence_label: recurrenceLabel,
        time,
        timezone,
        now: new Date().toISOString(),
        tasks: serializeHistoryTasks(tasks),
      }),
    });

    if (!response.ok) return fallback();

    const data = await response.json();
    return {
      headline: String(data.headline ?? "Routine coach"),
      message: String(data.message ?? "Routine feedback ready."),
      suggestions: (data.suggestions ?? []).map(String),
      source: normalizeAiSource(data.source),
    };
  } catch {
    return fallback();
  }
};

const localTaskBreakdown = ({
  title,
  notes,
  priority,
}: {
  title: string;
  notes: string;
  priority: AiTaskPriority;
}): TaskBreakdownResult => {
  const lower = `${title} ${notes}`.toLowerCase();

  const makeStep = (
    stepTitle: string,
    durationMinutes: number,
    stepPriority: AiTaskPriority = priority,
    stepNotes = ""
  ): TaskBreakdownStep => ({
    title: stepTitle,
    durationMinutes,
    priority: stepPriority,
    notes: stepNotes,
  });

  const steps = /study|exam|test|quiz|class/.test(lower)
    ? [
        makeStep(`Review notes for ${title}`, 25, priority, "Mark the weak spots."),
        makeStep(
          `Practice active recall for ${title}`,
          35,
          priority,
          "Use questions, flashcards, or blank-page recall."
        ),
        makeStep(
          `Summarize weak spots from ${title}`,
          20,
          "Medium",
          "Write what to review next."
        ),
      ]
    : /code|build|project|app|write/.test(lower)
      ? [
          makeStep(
            `Define the finish line for ${title}`,
            15,
            priority,
            "Write what done looks like."
          ),
          makeStep(
            `Work the first focused block of ${title}`,
            45,
            priority,
            "Make the smallest useful version work."
          ),
          makeStep(
            `Test and clean up ${title}`,
            25,
            "Medium",
            "Check the result and remove rough edges."
          ),
        ]
      : /clean|room|laundry|organize/.test(lower)
        ? [
            makeStep(
              `Clear the obvious mess for ${title}`,
              15,
              priority,
              "Start with visible clutter."
            ),
            makeStep(
              `Handle the main reset for ${title}`,
              30,
              priority,
              "Do the core cleaning block."
            ),
            makeStep(
              `Finish and reset supplies for ${title}`,
              10,
              "Low",
              "Put tools away."
            ),
          ]
        : [
            makeStep(
              `Define the next action for ${title}`,
              10,
              priority,
              "Turn the vague task into a first move."
            ),
            makeStep(
              `Do the focused work for ${title}`,
              40,
              priority,
              "Protect one uninterrupted block."
            ),
            makeStep(
              `Review and close ${title}`,
              15,
              "Medium",
              "Capture what remains."
            ),
          ];

  return {
    steps,
    summary: `I split ${title} into ${steps.length} doable steps.`,
    source: "offline",
  };
};

export const breakDownTask = async ({
  title,
  notes,
  date,
  time,
  priority,
  timezone,
  existingTasks,
}: {
  title: string;
  notes: string;
  date: string;
  time: string;
  priority: AiTaskPriority;
  timezone: string;
  existingTasks: AiExistingTask[];
}): Promise<TaskBreakdownResult> => {
  const fallback = () => localTaskBreakdown({ title, notes, priority });

  try {
    const response = await fetch(`${getAiApiUrl()}/v1/breakdown-task`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        notes,
        date,
        time,
        priority,
        timezone,
        now: new Date().toISOString(),
        existing_tasks: existingTasks,
      }),
    });

    if (!response.ok) return fallback();

    const data = await response.json();
    return {
      steps: (data.steps ?? []).map((step: any) => ({
        title: String(step.title ?? title),
        durationMinutes: Number(
          step.duration_minutes ?? step.durationMinutes ?? 30
        ),
        priority: (["Low", "Medium", "High"].includes(step.priority)
          ? step.priority
          : priority) as AiTaskPriority,
        notes: String(step.notes ?? ""),
      })),
      summary: String(data.summary ?? "Task breakdown ready."),
      source: normalizeAiSource(data.source),
    };
  } catch {
    return fallback();
  }
};
