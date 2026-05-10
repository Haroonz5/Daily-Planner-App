import type { TaskLike } from "@/utils/task-helpers";
import { getTimeBucket, parseTimeToMinutes } from "@/utils/task-helpers";

const bucketLabels = {
  early: "early morning",
  morning: "morning",
  afternoon: "afternoon",
  evening: "evening",
} as const;

export const buildAiMemorySummary = (tasks: TaskLike[]) => {
  const history = tasks.filter((task) => task.date < new Date().toISOString().slice(0, 10));
  if (history.length < 6) return null;

  const bucketStats = {
    early: { total: 0, completed: 0, friction: 0 },
    morning: { total: 0, completed: 0, friction: 0 },
    afternoon: { total: 0, completed: 0, friction: 0 },
    evening: { total: 0, completed: 0, friction: 0 },
  };

  history.forEach((task) => {
    const bucket = getTimeBucket(parseTimeToMinutes(task.originalTime ?? task.time));
    bucketStats[bucket].total += 1;
    if (task.completed) bucketStats[bucket].completed += 1;
    if (task.status === "skipped" || (task.rescheduledCount ?? 0) > 0) {
      bucketStats[bucket].friction += 1;
    }
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

  // I keep this as short plain text because it gets appended to AI planning
  // rules. The model should remember patterns, not receive a whole analytics dump.
  return [
    `User tends to complete tasks best in the ${bucketLabels[bestBucket]}.`,
    `User has more friction in the ${bucketLabels[hardestBucket]}.`,
    "Prefer realistic spacing, fewer high-priority tasks, and earlier recovery when possible.",
  ].join(" ");
};
