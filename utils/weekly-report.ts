export type WeeklyReportTask = {
  id?: string;
  title: string;
  date: string;
  time?: string | null;
  priority?: "Low" | "Medium" | "High" | null;
  completed?: boolean | null;
  status?: "pending" | "completed" | "skipped" | null;
};

const dateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getWeekRange = (date = new Date()) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return { startKey: dateKey(start), endKey: dateKey(end) };
};

export const buildWeeklyReport = (
  tasks: WeeklyReportTask[],
  range = getWeekRange()
) => {
  const weekTasks = tasks.filter(
    (task) => task.date >= range.startKey && task.date <= range.endKey
  );
  const completed = weekTasks.filter((task) => task.completed).length;
  const skipped = weekTasks.filter((task) => task.status === "skipped").length;
  const highPriority = weekTasks.filter((task) => task.priority === "High");
  const highCompleted = highPriority.filter((task) => task.completed).length;
  const completionRate =
    weekTasks.length > 0 ? Math.round((completed / weekTasks.length) * 100) : 0;
  const cleanDays = Array.from(new Set(weekTasks.map((task) => task.date))).filter(
    (day) => {
      const dayTasks = weekTasks.filter((task) => task.date === day);
      return dayTasks.length > 0 && dayTasks.every((task) => task.completed);
    }
  ).length;

  const strongestDay = Array.from(new Set(weekTasks.map((task) => task.date)))
    .map((day) => {
      const dayTasks = weekTasks.filter((task) => task.date === day);
      const dayCompleted = dayTasks.filter((task) => task.completed).length;
      return {
        day,
        completed: dayCompleted,
        total: dayTasks.length,
        rate: dayTasks.length ? dayCompleted / dayTasks.length : 0,
      };
    })
    .sort((a, b) => b.rate - a.rate || b.completed - a.completed)[0];

  // I keep this report deterministic so it can be shared, screenshotted, or
  // turned into a PDF later without depending on an AI response.
  return {
    ...range,
    total: weekTasks.length,
    completed,
    skipped,
    highPriorityTotal: highPriority.length,
    highPriorityCompleted: highCompleted,
    completionRate,
    cleanDays,
    strongestDay,
    headline:
      completionRate >= 85
        ? "Elite consistency week"
        : completionRate >= 60
          ? "Solid discipline week"
          : "Rebuild week with useful data",
    coachingLine:
      skipped > 0
        ? "Skipped tasks are feedback. Shrink the plan before it shrinks your confidence."
        : "No skips recorded. Keep the plan honest and repeatable.",
  };
};

export const formatWeeklyReportForShare = (
  report: ReturnType<typeof buildWeeklyReport>
) =>
  [
    "Daily Discipline Weekly Report",
    `${report.startKey} to ${report.endKey}`,
    `${report.completed}/${report.total} tasks complete (${report.completionRate}%)`,
    `${report.highPriorityCompleted}/${report.highPriorityTotal} high-priority tasks cleared`,
    `${report.cleanDays} clean day${report.cleanDays === 1 ? "" : "s"}`,
    report.strongestDay
      ? `Strongest day: ${report.strongestDay.day} (${report.strongestDay.completed}/${report.strongestDay.total})`
      : "Strongest day: not enough data yet",
    report.coachingLine,
  ].join("\n");
