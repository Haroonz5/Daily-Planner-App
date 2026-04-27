import { formatDateKey } from "./task-helpers";

export type AiTaskPriority = "Low" | "Medium" | "High";

export type AiExistingTask = {
  title: string;
  date: string;
  time: string;
  priority?: AiTaskPriority;
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
