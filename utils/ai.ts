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
  source: "openai" | "local" | "offline";
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
  source: "openai" | "local" | "offline";
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
      source: data.source === "openai" ? "openai" : "local",
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
      source: data.source === "openai" ? "openai" : "local",
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
      source: data.source === "openai" ? "openai" : "local",
    };
  } catch {
    return fallback();
  }
};
