import { formatDateKey } from "./task-helpers";

export type AiTaskPriority = "Low" | "Medium" | "High";

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
};

export type ParseNaturalTasksResult = {
  tasks: ParsedAiTask[];
  warnings: string[];
  source: "openai" | "local" | "offline";
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
  source: "openai" | "local" | "offline";
};

const getAiApiUrl = () => {
  const configuredUrl = process.env.EXPO_PUBLIC_AI_API_URL;
  return configuredUrl?.replace(/\/$/, "") || "http://127.0.0.1:8000";
};

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

const cleanLocalTitle = (segment: string) => {
  const cleaned = segment
    .replace(/\b(today|tomorrow|next week)\b/gi, "")
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
        notes: String(task.notes ?? ""),
      })),
      warnings: (data.warnings ?? []).map(String),
      source: data.source === "openai" ? "openai" : "local",
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
      source: data.source === "openai" ? "openai" : "local",
    };
  } catch {
    return fallback();
  }
};
