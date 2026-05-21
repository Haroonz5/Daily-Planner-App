import type { TaskLike } from "@/utils/task-helpers";
import { getTimeBucket, parseDateKey, parseTimeToMinutes } from "@/utils/task-helpers";

const bucketLabels = {
  early: "early morning",
  morning: "morning",
  afternoon: "afternoon",
  evening: "evening",
} as const;

const weekdayLabels = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

const normalizeFamilyName = (title?: string) => {
  const cleaned = (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(go|to|the|a|an|do|task|work|on|my|for|at)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.split(" ").slice(0, 2).join(" ") || "general tasks";
};

export const buildAiMemorySummary = (tasks: TaskLike[]) => {
  const todayKey = new Date().toISOString().slice(0, 10);
  const history = tasks.filter((task) => task.date < todayKey);
  if (history.length < 4) return null;

  const bucketStats = {
    early: { total: 0, completed: 0, friction: 0 },
    morning: { total: 0, completed: 0, friction: 0 },
    afternoon: { total: 0, completed: 0, friction: 0 },
    evening: { total: 0, completed: 0, friction: 0 },
  };
  const weekdayStats = weekdayLabels.map(() => ({ total: 0, completed: 0, friction: 0 }));
  const familyStats = new Map<string, { total: number; completed: number; friction: number }>();
  const dayStats = new Map<string, { total: number; completed: number }>();

  history.forEach((task) => {
    const friction = task.status === "skipped" || (task.rescheduledCount ?? 0) > 0;
    const bucket = getTimeBucket(parseTimeToMinutes(task.originalTime ?? task.time));
    const weekday = parseDateKey(task.date).getDay();
    const family = normalizeFamilyName(task.title);
    const familyStat = familyStats.get(family) ?? { total: 0, completed: 0, friction: 0 };
    const dayStat = dayStats.get(task.date) ?? { total: 0, completed: 0 };

    bucketStats[bucket].total += 1;
    weekdayStats[weekday].total += 1;
    familyStat.total += 1;
    dayStat.total += 1;

    if (task.completed) {
      bucketStats[bucket].completed += 1;
      weekdayStats[weekday].completed += 1;
      familyStat.completed += 1;
      dayStat.completed += 1;
    }

    if (friction) {
      bucketStats[bucket].friction += 1;
      weekdayStats[weekday].friction += 1;
      familyStat.friction += 1;
    }

    familyStats.set(family, familyStat);
    dayStats.set(task.date, dayStat);
  });

  const rankedBuckets = (Object.keys(bucketStats) as (keyof typeof bucketStats)[])
    .filter((bucket) => bucketStats[bucket].total > 0)
    .sort((a, b) => {
      const scoreA =
        bucketStats[a].completed / bucketStats[a].total -
        bucketStats[a].friction / bucketStats[a].total;
      const scoreB =
        bucketStats[b].completed / bucketStats[b].total -
        bucketStats[b].friction / bucketStats[b].total;
      return scoreB - scoreA;
    });

  const bestBucket = rankedBuckets[0];
  const hardestBucket = [...rankedBuckets].reverse()[0];
  if (!bestBucket || !hardestBucket) return null;

  const rankedFamilies = [...familyStats.entries()]
    .filter(([, stats]) => stats.total >= 2)
    .sort(([, a], [, b]) => {
      const scoreA = a.completed / a.total - a.friction / a.total;
      const scoreB = b.completed / b.total - b.friction / b.total;
      return scoreB - scoreA;
    });
  const strongestFamily = rankedFamilies[0];
  const hardestFamily = [...rankedFamilies].reverse()[0];
  const hardestWeekdayIndex = weekdayStats.reduce((worst, stats, index) => {
    const worstRate = weekdayStats[worst].total
      ? weekdayStats[worst].friction / weekdayStats[worst].total
      : -1;
    const rate = stats.total ? stats.friction / stats.total : -1;
    return rate > worstRate ? index : worst;
  }, 0);
  const averageCompleted = [...dayStats.values()].reduce(
    (sum, day) => sum + day.completed,
    0
  ) / Math.max(dayStats.size, 1);
  const realisticDailyLimit = Math.max(2, Math.round(averageCompleted + 1));

  const memory = [
    `User tends to complete tasks best in the ${bucketLabels[bestBucket]}.`,
    `User has more friction in the ${bucketLabels[hardestBucket]}.`,
    `Keep most days near ${realisticDailyLimit} important tasks unless the user explicitly chooses a locked-in day.`,
  ];

  if (strongestFamily) {
    memory.push(`Task family that usually works: ${strongestFamily[0]}.`);
  }

  if (hardestFamily && hardestFamily[0] !== strongestFamily?.[0]) {
    memory.push(`Task family needing extra buffer or smaller steps: ${hardestFamily[0]}.`);
  }

  if (weekdayStats[hardestWeekdayIndex].total >= 2) {
    memory.push(`${weekdayLabels[hardestWeekdayIndex]} show more friction; avoid stacking hard tasks there.`);
  }

  memory.push(
    "Prefer realistic spacing, fewer high-priority tasks, and earlier recovery when possible."
  );

  // I keep this as short plain text because it gets appended to AI planning
  // rules. The model should remember patterns, not receive a whole analytics dump.
  return memory.join(" ");
};
