import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "@/constants/appTheme";
import { AmbientBackground } from "@/components/ambient-background";
import { PetSprite } from "@/components/pet-sprite";
import {
  getActivePet,
  getDisciplineLabel,
  getLevelData,
  getPetProgress,
  getTaskXp,
  parseTimeToMinutes,
  toDateSafe,
  type Priority,
} from "@/constants/rewards";
import { Colors } from "@/constants/theme";
import { useUserProfile } from "@/hooks/use-user-profile";
import {
  getWeeklyReview,
  type AiHistoryTask,
  type WeeklyReviewResult,
} from "../../utils/ai";
import { auth, db } from "../../constants/firebaseConfig";

type TaskStatus = "pending" | "completed" | "skipped";
type TimeBucket = "early" | "morning" | "afternoon" | "evening";

type Task = {
  id: string;
  title: string;
  time: string;
  date: string;
  completed: boolean;
  priority?: Priority;
  notes?: string;
  status?: TaskStatus;
  completedAt?: any;
  skippedAt?: any;
  lastActionAt?: any;
  rescheduledCount?: number;
  originalTime?: string;
};

const priorityColors: Record<Priority, string> = {
  Low: "#8dcf9f",
  Medium: "#f2b97f",
  High: "#e58ca8",
};

const bucketLabels: Record<TimeBucket, string> = {
  early: "Early Morning",
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

const getBucketFromMinutes = (minutes: number | null): TimeBucket => {
  if (minutes === null) return "morning";
  if (minutes < 9 * 60) return "early";
  if (minutes < 12 * 60) return "morning";
  if (minutes < 17 * 60) return "afternoon";
  return "evening";
};

const scheduledDateTime = (date: string, time: string) => {
  const [year, month, day] = date.split("-").map(Number);
  const minutes = parseTimeToMinutes(time);
  if (!year || !month || !day || minutes === null) return null;

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return new Date(year, month - 1, day, hours, mins, 0, 0);
};

const serializeDateValue = (value: any) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  return null;
};

const toAiHistoryTask = (task: Task): AiHistoryTask => ({
  id: task.id,
  title: task.title,
  date: task.date,
  time: task.time,
  priority: task.priority ?? "Medium",
  completed: task.completed,
  status: task.status ?? "pending",
  rescheduledCount: task.rescheduledCount ?? 0,
  completedAt: serializeDateValue(task.completedAt),
  skippedAt: serializeDateValue(task.skippedAt),
});

export default function StatsScreen() {
  const { themeName } = useAppTheme();
  const { profile } = useUserProfile();
  const colors = Colors[themeName];
  const [tasks, setTasks] = useState<Task[]>([]);
  const [weeklyReview, setWeeklyReview] = useState<WeeklyReviewResult | null>(
    null
  );
  const [weeklyReviewBusy, setWeeklyReviewBusy] = useState(false);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const unsubscribe = onSnapshot(
      collection(db, "users", uid, "tasks"),
      (snap) => {
        const fetched = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Task[];

        setTasks(fetched);
      },
      () => {
        setTasks([]);
      }
    );

    return unsubscribe;
  }, []);

  const stats = useMemo(() => {
    const todayDate = new Date().toISOString().split("T")[0];

    const getLast7Days = () => {
      const days: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().split("T")[0]);
      }
      return days;
    };

    const last7Days = getLast7Days();

    const todayTasks = tasks.filter((task) => task.date === todayDate);
    const todayCompleted = todayTasks.filter((task) => task.completed).length;
    const todaySkipped = todayTasks.filter(
      (task) => (task.status ?? "pending") === "skipped"
    ).length;
    const todayPercent =
      todayTasks.length > 0
        ? Math.round((todayCompleted / todayTasks.length) * 100)
        : 0;

    const weeklyStats = last7Days.map((date) => {
      const dayTasks = tasks.filter((task) => task.date === date);
      const completed = dayTasks.filter((task) => task.completed).length;
      const skipped = dayTasks.filter(
        (task) => (task.status ?? "pending") === "skipped"
      ).length;
      const percent =
        dayTasks.length > 0
          ? Math.round((completed / dayTasks.length) * 100)
          : 0;

      return {
        date,
        label: new Date(date).toLocaleDateString("en-US", { weekday: "short" }),
        total: dayTasks.length,
        completed,
        skipped,
        percent,
        xp: dayTasks.reduce((sum, task) => sum + getTaskXp(task), 0),
      };
    });

    let streak = 0;
    for (let i = weeklyStats.length - 1; i >= 0; i--) {
      const day = weeklyStats[i];
      if (day.total === 0) break;
      if (day.completed === day.total) streak += 1;
      else break;
    }

    const priorityCounts: Record<Priority, number> = {
      Low: tasks.filter((task) => (task.priority ?? "Medium") === "Low").length,
      Medium: tasks.filter((task) => (task.priority ?? "Medium") === "Medium").length,
      High: tasks.filter((task) => (task.priority ?? "Medium") === "High").length,
    };

    const mostSkippedTask = (() => {
      const counts = new Map<string, number>();

      tasks.forEach((task) => {
        if ((task.status ?? "pending") === "skipped") {
          counts.set(task.title, (counts.get(task.title) ?? 0) + 1);
        }
      });

      let title = "None yet";
      let count = 0;

      counts.forEach((value, key) => {
        if (value > count) {
          title = key;
          count = value;
        }
      });

      return { title, count };
    })();

    const productiveWindowCounts: Record<TimeBucket, number> = {
      early: 0,
      morning: 0,
      afternoon: 0,
      evening: 0,
    };

    tasks.forEach((task) => {
      if (!task.completed) return;
      const completedAt = toDateSafe(task.completedAt);
      if (!completedAt) return;
      const bucket = getBucketFromMinutes(
        completedAt.getHours() * 60 + completedAt.getMinutes()
      );
      productiveWindowCounts[bucket] += 1;
    });

    const mostProductiveWindow = (Object.keys(productiveWindowCounts) as TimeBucket[]).reduce(
      (best, bucket) =>
        productiveWindowCounts[bucket] > productiveWindowCounts[best] ? bucket : best,
      "morning"
    );

    const frictionCounts: Record<TimeBucket, number> = {
      early: 0,
      morning: 0,
      afternoon: 0,
      evening: 0,
    };

    tasks.forEach((task) => {
      const sourceTime = task.originalTime ?? task.time;
      const bucket = getBucketFromMinutes(parseTimeToMinutes(sourceTime));
      if ((task.status ?? "pending") === "skipped" || (task.rescheduledCount ?? 0) > 0) {
        frictionCounts[bucket] += 1;
      }
    });

    const windowPerformance = (Object.keys(bucketLabels) as TimeBucket[]).map(
      (bucket) => {
        const bucketTasks = tasks.filter(
          (task) =>
            getBucketFromMinutes(parseTimeToMinutes(task.originalTime ?? task.time)) ===
            bucket
        );
        const completed = bucketTasks.filter((task) => task.completed).length;
        const friction = bucketTasks.filter(
          (task) =>
            (task.status ?? "pending") === "skipped" ||
            (task.rescheduledCount ?? 0) > 0
        ).length;
        const completionRate = bucketTasks.length
          ? Math.round((completed / bucketTasks.length) * 100)
          : 0;

        return {
          bucket,
          label: bucketLabels[bucket],
          total: bucketTasks.length,
          completed,
          friction,
          completionRate,
        };
      }
    );

    const riskWindow = (Object.keys(frictionCounts) as TimeBucket[]).reduce(
      (worst, bucket) => (frictionCounts[bucket] > frictionCounts[worst] ? bucket : worst),
      "morning"
    );

    const delays = tasks
      .filter((task) => task.completed)
      .map((task) => {
        const completedAt = toDateSafe(task.completedAt);
        const scheduledAt = scheduledDateTime(task.date, task.originalTime ?? task.time);
        if (!completedAt || !scheduledAt) return null;
        return Math.round((completedAt.getTime() - scheduledAt.getTime()) / 60000);
      })
      .filter((value): value is number => value !== null);

    const averageDelay =
      delays.length > 0
        ? Math.round(
            delays.reduce((sum, value) => sum + Math.max(value, 0), 0) / delays.length
          )
        : 0;

    const onTimeRate =
      delays.length > 0
        ? Math.round(
            (delays.filter((delay) => delay <= 15).length / delays.length) * 100
          )
        : 0;

    const totalTasks = tasks.length;
    const totalCompleted = tasks.filter((task) => task.completed).length;
    const totalSkipped = tasks.filter(
      (task) => (task.status ?? "pending") === "skipped"
    ).length;
    const totalRescheduled = tasks.reduce(
      (sum, task) => sum + (task.rescheduledCount ?? 0),
      0
    );

    const totalXp = tasks.reduce((sum, task) => sum + getTaskXp(task), 0);
    const todayXp = todayTasks.reduce((sum, task) => sum + getTaskXp(task), 0);
    const weeklyXp = weeklyStats.reduce((sum, day) => sum + day.xp, 0);

    const levelData = getLevelData(totalXp);
    const petProgress = getPetProgress(totalXp);
    const activePet = getActivePet(totalXp, profile.activePetKey);

    const completionRate = totalTasks > 0 ? (totalCompleted / totalTasks) * 100 : 0;
    const skipRate = totalTasks > 0 ? (totalSkipped / totalTasks) * 100 : 0;
    const rescheduleRate =
      totalTasks > 0
        ? (tasks.filter((task) => (task.rescheduledCount ?? 0) > 0).length / totalTasks) *
          100
        : 0;

    const completionComponent = completionRate * 0.5;
    const onTimeComponent = onTimeRate * 0.3;
    const skipComponent = (100 - skipRate) * 0.15;
    const rescheduleComponent = (100 - rescheduleRate) * 0.05;

    const disciplineScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          completionComponent +
            onTimeComponent +
            skipComponent +
            rescheduleComponent
        )
      )
    );

    const disciplineLabel = getDisciplineLabel(disciplineScore);
    const disciplineBreakdown = [
      {
        label: "Completion",
        score: Math.round(completionRate),
        points: Math.round(completionComponent),
        maxPoints: 50,
        note: `${totalCompleted}/${totalTasks || 0} all-time tasks completed`,
      },
      {
        label: "On-time execution",
        score: onTimeRate,
        points: Math.round(onTimeComponent),
        maxPoints: 30,
        note: delays.length
          ? `${onTimeRate}% finished within 15 minutes of plan`
          : "Complete scheduled tasks to train this score",
      },
      {
        label: "Skip control",
        score: Math.round(100 - skipRate),
        points: Math.round(skipComponent),
        maxPoints: 15,
        note: `${totalSkipped} skipped task${totalSkipped === 1 ? "" : "s"} recorded`,
      },
      {
        label: "Schedule stability",
        score: Math.round(100 - rescheduleRate),
        points: Math.round(rescheduleComponent),
        maxPoints: 5,
        note: `${totalRescheduled} total reschedule${totalRescheduled === 1 ? "" : "s"}`,
      },
    ];

    const bestDay = weeklyStats.length
      ? weeklyStats.reduce((best, day) => (day.percent > best.percent ? day : best), weeklyStats[0])
      : null;

    const toughestDay = weeklyStats.length
      ? weeklyStats.reduce((worst, day) => (day.percent < worst.percent ? day : worst), weeklyStats[0])
      : null;

    let recommendation = "Your consistency data is starting to take shape.";

    if (mostSkippedTask.count >= 2) {
      recommendation = `"${mostSkippedTask.title}" keeps getting skipped. Simplify it or move it out of your weakest window.`;
    } else if (riskWindow !== mostProductiveWindow) {
      recommendation = `You seem strongest in the ${bucketLabels[mostProductiveWindow].toLowerCase()} but struggle more in the ${bucketLabels[riskWindow].toLowerCase()}. Move important tasks accordingly.`;
    } else if (averageDelay > 30) {
      recommendation = `You finish about ${averageDelay} minutes late on average. Try giving yourself more space between planned tasks.`;
    }

    return {
      todayTasks,
      todayCompleted,
      todaySkipped,
      todayPercent,
      weekStart: last7Days[0],
      weekEnd: last7Days[last7Days.length - 1],
      streak,
      weeklyStats,
      priorityCounts,
      mostSkippedTask,
      mostProductiveWindow,
      riskWindow,
      windowPerformance,
      averageDelay,
      onTimeRate,
      totalTasks,
      totalCompleted,
      totalSkipped,
      totalRescheduled,
      bestDay,
      toughestDay,
      recommendation,
      totalXp,
      todayXp,
      weeklyXp,
      levelData,
      activePet,
      petProgress,
      disciplineScore,
      disciplineLabel,
      disciplineBreakdown,
    };
  }, [profile.activePetKey, tasks]);

  useEffect(() => {
    if (tasks.length === 0) {
      setWeeklyReview(null);
      setWeeklyReviewBusy(false);
      return;
    }

    let active = true;
    setWeeklyReviewBusy(true);

    void getWeeklyReview({
      weekStart: stats.weekStart,
      weekEnd: stats.weekEnd,
      tasks: tasks.map(toAiHistoryTask),
      timezone,
    })
      .then((result) => {
        if (active) setWeeklyReview(result);
      })
      .finally(() => {
        if (active) setWeeklyReviewBusy(false);
      });

    return () => {
      active = false;
    };
  }, [stats.weekEnd, stats.weekStart, tasks, timezone]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientBackground colors={colors} variant="calm" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={[styles.headerKicker, { color: colors.tint }]}>
              Analytics
            </Text>
            <Text style={[styles.title, { color: colors.text }]}>Your Stats</Text>
            <Text style={[styles.subtitle, { color: colors.subtle }]}>
              A cleaner read on consistency, timing, XP, and what to adjust next.
            </Text>
          </View>

          <View
            style={[
              styles.headerBadge,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.headerBadgeValue, { color: colors.text }]}>
              {stats.levelData.level}
            </Text>
            <Text style={[styles.headerBadgeLabel, { color: colors.subtle }]}>
              Level
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.dashboardHero,
            { backgroundColor: colors.tint, shadowColor: colors.tint },
          ]}
        >
          <View
            style={[
              styles.dashboardHeroOrb,
              { backgroundColor: colors.warning },
            ]}
          />
          <Text style={styles.dashboardKicker}>Progress Dashboard</Text>
          <View style={styles.dashboardHeroRow}>
            <View>
              <Text style={styles.dashboardScore}>{stats.disciplineScore}</Text>
              <Text style={styles.dashboardLabel}>{stats.disciplineLabel}</Text>
            </View>
            <View style={styles.dashboardPill}>
              <Text style={styles.dashboardPillValue}>+{stats.weeklyXp}</Text>
              <Text style={styles.dashboardPillLabel}>week XP</Text>
            </View>
          </View>
          <Text style={styles.dashboardBody}>
            Best window: {bucketLabels[stats.mostProductiveWindow]} • Watch: {bucketLabels[stats.riskWindow]}
          </Text>

          <View style={styles.dashboardMetricRow}>
            <View style={styles.dashboardMetric}>
              <Text style={styles.dashboardMetricValue}>{stats.todayPercent}%</Text>
              <Text style={styles.dashboardMetricLabel}>today</Text>
            </View>
            <View style={styles.dashboardMetric}>
              <Text style={styles.dashboardMetricValue}>{stats.streak}</Text>
              <Text style={styles.dashboardMetricLabel}>streak</Text>
            </View>
            <View style={styles.dashboardMetric}>
              <Text style={styles.dashboardMetricValue}>{stats.onTimeRate}%</Text>
              <Text style={styles.dashboardMetricLabel}>on time</Text>
            </View>
          </View>
        </View>

        <View
          style={[
            styles.scoreBreakdownCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowColor: colors.tint,
            },
          ]}
        >
          <View style={styles.scoreBreakdownHeader}>
            <View>
              <Text style={[styles.scoreBreakdownEyebrow, { color: colors.tint }]}>
                Discipline Score Breakdown
              </Text>
              <Text style={[styles.scoreBreakdownTitle, { color: colors.text }]}>
                Why your score is {stats.disciplineScore}
              </Text>
            </View>
            <Text style={[styles.scoreBreakdownTotal, { color: colors.text }]}>
              {stats.disciplineScore}/100
            </Text>
          </View>

          {stats.disciplineBreakdown.map((item) => (
            <View key={item.label} style={styles.scoreBreakdownRow}>
              <View style={styles.scoreBreakdownCopy}>
                <Text style={[styles.scoreBreakdownLabel, { color: colors.text }]}>
                  {item.label}
                </Text>
                <Text style={[styles.scoreBreakdownNote, { color: colors.subtle }]}>
                  {item.note}
                </Text>
              </View>
              <View style={styles.scoreBreakdownMeter}>
                <View
                  style={[
                    styles.scoreBreakdownTrack,
                    { backgroundColor: colors.border },
                  ]}
                >
                  <View
                    style={[
                      styles.scoreBreakdownFill,
                      {
                        width: `${Math.max(0, Math.min(100, item.score))}%`,
                        backgroundColor: colors.tint,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.scoreBreakdownPoints, { color: colors.subtle }]}>
                  {item.points}/{item.maxPoints}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.coachGrid}>
          {[
            {
              label: "Do more of",
              title: bucketLabels[stats.mostProductiveWindow],
              body: "This is where your completed tasks cluster strongest.",
            },
            {
              label: "Protect against",
              title: bucketLabels[stats.riskWindow],
              body: "This window has more skips or reschedules. Plan lighter here.",
            },
          ].map((card) => (
            <View
              key={card.label}
              style={[
                styles.coachCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  shadowColor: colors.tint,
                },
              ]}
            >
              <Text style={[styles.coachLabel, { color: colors.tint }]}>
                {card.label}
              </Text>
              <Text style={[styles.coachTitle, { color: colors.text }]}>
                {card.title}
              </Text>
              <Text style={[styles.coachBody, { color: colors.subtle }]}>
                {card.body}
              </Text>
            </View>
          ))}
        </View>

      <View
        style={[
          styles.weeklyReviewCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            shadowColor: colors.tint,
          },
        ]}
      >
        <View style={styles.weeklyReviewHeader}>
          <View>
            <Text style={[styles.weeklyReviewEyebrow, { color: colors.tint }]}>
              AI Weekly Review
            </Text>
            <Text style={[styles.weeklyReviewTitle, { color: colors.text }]}>
              {weeklyReviewBusy
                ? "Building your review..."
                : weeklyReview?.headline ?? "Weekly review waiting"}
            </Text>
          </View>
          <View
            style={[
              styles.weeklyReviewPill,
              { backgroundColor: colors.surface },
            ]}
          >
            <Text style={[styles.weeklyReviewPillText, { color: colors.subtle }]}>
              {weeklyReviewBusy
                ? "Live"
                : weeklyReview?.source === "openai"
                  ? "AI"
                  : weeklyReview?.source === "offline"
                    ? "Offline"
                  : "Local"}
            </Text>
          </View>
        </View>

        <Text style={[styles.weeklyReviewSummary, { color: colors.subtle }]}>
          {weeklyReviewBusy
            ? "Checking wins, skipped work, reschedules, and strongest windows."
            : weeklyReview?.summary ??
              "Complete a few tasks this week and this will turn into a coach-style recap."}
        </Text>

        {!!weeklyReview && (
          <View style={styles.weeklyReviewGrid}>
            <View
              style={[
                styles.weeklyReviewColumn,
                { backgroundColor: colors.surface },
              ]}
            >
              <Text style={[styles.weeklyReviewColumnTitle, { color: colors.text }]}>
                Wins
              </Text>
              {(weeklyReview.wins.length
                ? weeklyReview.wins
                : ["No wins logged yet."]
              ).slice(0, 2).map((item) => (
                <Text
                  key={`win-${item}`}
                  style={[styles.weeklyReviewItem, { color: colors.subtle }]}
                >
                  {item}
                </Text>
              ))}
            </View>

            <View
              style={[
                styles.weeklyReviewColumn,
                { backgroundColor: colors.surface },
              ]}
            >
              <Text style={[styles.weeklyReviewColumnTitle, { color: colors.text }]}>
                Next Focus
              </Text>
              {(weeklyReview.nextWeekFocus.length
                ? weeklyReview.nextWeekFocus
                : ["Keep the plan lean."]
              ).slice(0, 2).map((item) => (
                <Text
                  key={`focus-${item}`}
                  style={[styles.weeklyReviewItem, { color: colors.subtle }]}
                >
                  {item}
                </Text>
              ))}
            </View>
          </View>
        )}

        {!!weeklyReview && (
          <View
            style={[
              styles.coachPlanCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.coachPlanTitle, { color: colors.text }]}>
              Coach Plan For Next Week
            </Text>
            {(weeklyReview.nextWeekFocus.length
              ? weeklyReview.nextWeekFocus
              : ["Keep the plan lighter and protect one high-value task per day."]
            )
              .slice(0, 3)
              .map((item, index) => (
                <Text
                  key={`coach-plan-${item}`}
                  style={[styles.coachPlanItem, { color: colors.subtle }]}
                >
                  {index + 1}. {item}
                </Text>
              ))}

            {weeklyReview.risks.length > 0 && (
              <Text style={[styles.coachPlanRisk, { color: colors.warning }]}>
                Watch: {weeklyReview.risks.slice(0, 2).join(" • ")}
              </Text>
            )}
          </View>
        )}
      </View>

      <View
        style={[
          styles.petCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            shadowColor: colors.tint,
          },
        ]}
      >
        <View style={styles.petHero}>
          <PetSprite
            petKey={stats.activePet.key}
            size={72}
            animated
            mood={stats.disciplineScore >= 75 ? "happy" : "idle"}
            style={styles.petSprite}
          />
          <View style={styles.petCopy}>
            <Text style={[styles.petName, { color: colors.text }]}>
              {stats.activePet.name}
            </Text>
            <Text style={[styles.petDescription, { color: colors.subtle }]}>
              {stats.activePet.description}
            </Text>
            <Text style={[styles.petProgressText, { color: colors.subtle }]}>
              {stats.petProgress.nextPet
                ? `Collection progress: ${stats.petProgress.remainingXp} XP until ${stats.petProgress.nextPet.name}`
                : "Collection complete. Final companion unlocked"}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.progressBarContainer,
            { backgroundColor: colors.border, marginTop: 16 },
          ]}
        >
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${stats.petProgress.progressPercent}%`,
                backgroundColor: colors.tint,
              },
            ]}
          />
        </View>
      </View>

      <View style={styles.topRow}>
        <View
          style={[
            styles.topCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowColor: colors.tint,
            },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.subtle }]}>
            Discipline Score
          </Text>
          <Text style={[styles.scoreNumber, { color: colors.text }]}>
            {stats.disciplineScore}
          </Text>
          <Text style={[styles.scoreLabel, { color: colors.subtle }]}>
            {stats.disciplineLabel}
          </Text>
        </View>

        <View
          style={[
            styles.topCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowColor: colors.tint,
            },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.subtle }]}>Level</Text>
          <Text style={[styles.scoreNumber, { color: colors.text }]}>
            {stats.levelData.level}
          </Text>
          <Text style={[styles.scoreLabel, { color: colors.subtle }]}>
            {stats.totalXp} total XP
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            shadowColor: colors.tint,
          },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>
          XP Progress
        </Text>
        <Text style={[styles.bigNumber, { color: colors.text }]}>
          {stats.levelData.currentLevelProgress}/100
        </Text>
        <Text style={[styles.cardSubtitle, { color: colors.subtle }]}>
          {stats.weeklyXp} XP this week • {stats.todayXp} XP today
        </Text>
        <View
          style={[
            styles.progressBarContainer,
            { backgroundColor: colors.border },
          ]}
        >
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${stats.levelData.progressPercent}%`,
                backgroundColor: colors.tint,
              },
            ]}
          />
        </View>
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            shadowColor: colors.tint,
          },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>
          Today&apos;s Progress
        </Text>
        <Text style={[styles.bigNumber, { color: colors.text }]}>
          {stats.todayPercent}%
        </Text>
        <Text style={[styles.cardSubtitle, { color: colors.subtle }]}>
          {stats.todayCompleted} completed, {stats.todaySkipped} skipped, {stats.todayTasks.length} total
        </Text>
        <View
          style={[
            styles.progressBarContainer,
            { backgroundColor: colors.border },
          ]}
        >
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${stats.todayPercent}%`,
                backgroundColor: colors.tint,
              },
            ]}
          />
        </View>
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            shadowColor: colors.tint,
          },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>
          Current Streak 🔥
        </Text>
        <Text style={[styles.bigNumber, { color: colors.text }]}>
          {stats.streak}
        </Text>
        <Text style={[styles.cardSubtitle, { color: colors.subtle }]}>
          {stats.streak === 0
            ? "Complete every task in a day to start a streak."
            : `${stats.streak} perfect day${stats.streak > 1 ? "s" : ""} in a row.`}
        </Text>
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            shadowColor: colors.tint,
          },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>
          Smart Weekly Report
        </Text>
        <Text style={[styles.insightText, { color: colors.text }]}>
          Best day: {stats.bestDay?.label ?? "N/A"} ({stats.bestDay?.percent ?? 0}%)
        </Text>
        <Text style={[styles.insightText, { color: colors.text }]}>
          Toughest day: {stats.toughestDay?.label ?? "N/A"} ({stats.toughestDay?.percent ?? 0}%)
        </Text>
        <Text style={[styles.insightText, { color: colors.text }]}>
          Most productive time: {bucketLabels[stats.mostProductiveWindow]}
        </Text>
        <Text style={[styles.insightText, { color: colors.text }]}>
          Highest-friction window: {bucketLabels[stats.riskWindow]}
        </Text>
        <Text style={[styles.insightText, { color: colors.text }]}>
          Most skipped task: {stats.mostSkippedTask.title}
          {stats.mostSkippedTask.count > 0 ? ` (${stats.mostSkippedTask.count}x)` : ""}
        </Text>
        <Text style={[styles.recommendationText, { color: colors.subtle }]}>
          {stats.recommendation}
        </Text>
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            shadowColor: colors.tint,
          },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>
          Time Window Quality
        </Text>
        {stats.windowPerformance.map((window) => (
          <View key={window.bucket} style={styles.windowRow}>
            <View style={styles.windowCopy}>
              <Text style={[styles.windowLabel, { color: colors.text }]}>
                {window.label}
              </Text>
              <Text style={[styles.windowMeta, { color: colors.subtle }]}>
                {window.completed}/{window.total} done • {window.friction} friction
              </Text>
            </View>
            <View
              style={[
                styles.windowTrack,
                { backgroundColor: colors.border },
              ]}
            >
              <View
                style={[
                  styles.windowFill,
                  {
                    width: `${window.completionRate}%`,
                    backgroundColor: colors.tint,
                  },
                ]}
              />
            </View>
            <Text style={[styles.windowPercent, { color: colors.subtle }]}>
              {window.completionRate}%
            </Text>
          </View>
        ))}
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            shadowColor: colors.tint,
          },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>
          This Week
        </Text>
        <View style={styles.barChart}>
          {stats.weeklyStats.map((day) => (
            <View key={day.date} style={styles.barColumn}>
              <Text style={[styles.barPercent, { color: colors.subtle }]}>
                {day.total > 0 ? `${day.percent}%` : ""}
              </Text>
              <View
                style={[styles.barTrack, { backgroundColor: colors.border }]}
              >
                <View
                  style={[
                    styles.barFill,
                    {
                      height: `${day.percent}%`,
                      backgroundColor: colors.tint,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.barLabel, { color: colors.subtle }]}>
                {day.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            shadowColor: colors.tint,
          },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>
          Plan vs Reality
        </Text>
        <View style={styles.planRealityRow}>
          <View
            style={[styles.planRealityStat, { backgroundColor: colors.surface }]}
          >
            <Text style={[styles.planRealityNumber, { color: colors.text }]}>
              {stats.onTimeRate}%
            </Text>
            <Text style={[styles.planRealityLabel, { color: colors.subtle }]}>
              On Time
            </Text>
          </View>
          <View
            style={[styles.planRealityStat, { backgroundColor: colors.surface }]}
          >
            <Text style={[styles.planRealityNumber, { color: colors.text }]}>
              {stats.averageDelay}m
            </Text>
            <Text style={[styles.planRealityLabel, { color: colors.subtle }]}>
              Avg Delay
            </Text>
          </View>
          <View
            style={[styles.planRealityStat, { backgroundColor: colors.surface }]}
          >
            <Text style={[styles.planRealityNumber, { color: colors.text }]}>
              {stats.totalRescheduled}
            </Text>
            <Text style={[styles.planRealityLabel, { color: colors.subtle }]}>
              Rescheduled
            </Text>
          </View>
        </View>
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            shadowColor: colors.tint,
          },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>
          Task Mix
        </Text>
        <View style={styles.priorityStatsRow}>
          {(["Low", "Medium", "High"] as Priority[]).map((priority) => (
            <View
              key={priority}
              style={[styles.priorityStat, { backgroundColor: colors.surface }]}
            >
              <View
                style={[
                  styles.priorityStatDot,
                  { backgroundColor: priorityColors[priority] },
                ]}
              />
              <Text style={[styles.priorityStatCount, { color: colors.text }]}>
                {stats.priorityCounts[priority]}
              </Text>
              <Text style={[styles.priorityStatLabel, { color: colors.subtle }]}>
                {priority}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            shadowColor: colors.tint,
          },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>
          All Time
        </Text>
        <View style={styles.allTimeRow}>
          <View style={styles.allTimeStat}>
            <Text style={[styles.allTimeNumber, { color: colors.text }]}>
              {stats.totalTasks}
            </Text>
            <Text style={[styles.allTimeLabel, { color: colors.subtle }]}>Total</Text>
          </View>
          <View
            style={[styles.allTimeDivider, { backgroundColor: colors.border }]}
          />
          <View style={styles.allTimeStat}>
            <Text style={[styles.allTimeNumber, { color: colors.text }]}>
              {stats.totalCompleted}
            </Text>
            <Text style={[styles.allTimeLabel, { color: colors.subtle }]}>
              Completed
            </Text>
          </View>
          <View
            style={[styles.allTimeDivider, { backgroundColor: colors.border }]}
          />
          <View style={styles.allTimeStat}>
            <Text style={[styles.allTimeNumber, { color: colors.text }]}>
              {stats.totalSkipped}
            </Text>
            <Text style={[styles.allTimeLabel, { color: colors.subtle }]}>
              Skipped
            </Text>
          </View>
          <View
            style={[styles.allTimeDivider, { backgroundColor: colors.border }]}
          />
          <View style={styles.allTimeStat}>
            <Text style={[styles.allTimeNumber, { color: colors.text }]}>
              {stats.totalXp}
            </Text>
            <Text style={[styles.allTimeLabel, { color: colors.subtle }]}>XP</Text>
          </View>
        </View>
      </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    paddingBottom: 130,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 22,
  },
  headerCopy: {
    flex: 1,
    paddingRight: 16,
  },
  headerKicker: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 5,
    textTransform: "uppercase",
  },
  title: { fontSize: 34, fontWeight: "900", letterSpacing: -0.7 },
  subtitle: { fontSize: 14, marginTop: 7, lineHeight: 20 },
  headerBadge: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 12,
    alignItems: "center",
    minWidth: 74,
  },
  headerBadgeValue: {
    fontSize: 26,
    fontWeight: "900",
    lineHeight: 29,
  },
  headerBadgeLabel: {
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
    textTransform: "uppercase",
  },
  dashboardHero: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 30,
    padding: 22,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    elevation: 8,
  },
  dashboardHeroOrb: {
    position: "absolute",
    width: 170,
    height: 170,
    borderRadius: 85,
    right: -62,
    top: -72,
    opacity: 0.3,
  },
  dashboardKicker: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  dashboardHeroRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dashboardScore: {
    color: "#fff",
    fontSize: 56,
    fontWeight: "900",
    lineHeight: 62,
  },
  dashboardLabel: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 14,
    fontWeight: "800",
  },
  dashboardPill: {
    minWidth: 96,
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  dashboardPillValue: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
  },
  dashboardPillLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 3,
    textTransform: "uppercase",
  },
  dashboardBody: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 14,
  },
  dashboardMetricRow: {
    flexDirection: "row",
    marginTop: 18,
    borderRadius: 22,
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  dashboardMetric: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
  },
  dashboardMetricValue: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
  },
  dashboardMetricLabel: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
    marginTop: 3,
    textTransform: "uppercase",
  },
  scoreBreakdownCard: {
    borderRadius: 24,
    padding: 18,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 4,
  },
  scoreBreakdownHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  scoreBreakdownEyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.9,
    marginBottom: 5,
    textTransform: "uppercase",
  },
  scoreBreakdownTitle: {
    fontSize: 20,
    fontWeight: "900",
  },
  scoreBreakdownTotal: {
    fontSize: 15,
    fontWeight: "900",
  },
  scoreBreakdownRow: {
    marginTop: 13,
  },
  scoreBreakdownCopy: {
    marginBottom: 8,
  },
  scoreBreakdownLabel: {
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 3,
  },
  scoreBreakdownNote: {
    fontSize: 12,
    lineHeight: 17,
  },
  scoreBreakdownMeter: {
    flexDirection: "row",
    alignItems: "center",
  },
  scoreBreakdownTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
    marginRight: 10,
  },
  scoreBreakdownFill: {
    height: 8,
    borderRadius: 999,
  },
  scoreBreakdownPoints: {
    width: 46,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "right",
  },
  coachGrid: {
    flexDirection: "row",
    marginHorizontal: 12,
    marginBottom: 16,
  },
  coachCard: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginHorizontal: 4,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  coachLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.7,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  coachTitle: {
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 6,
  },
  coachBody: {
    fontSize: 12,
    lineHeight: 18,
  },
  petCard: {
    borderRadius: 22,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  petHero: {
    flexDirection: "row",
    alignItems: "center",
  },
  petEmoji: {
    fontSize: 54,
    marginRight: 16,
  },
  petSprite: {
    marginRight: 16,
  },
  petCopy: {
    flex: 1,
  },
  petName: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
  },
  petDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 6,
  },
  petProgressText: {
    fontSize: 13,
    fontWeight: "600",
  },
  weeklyReviewCard: {
    borderRadius: 24,
    padding: 18,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 4,
  },
  weeklyReviewHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  weeklyReviewEyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.9,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  weeklyReviewTitle: {
    fontSize: 20,
    fontWeight: "900",
    maxWidth: 250,
  },
  weeklyReviewPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  weeklyReviewPillText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  weeklyReviewSummary: {
    fontSize: 14,
    lineHeight: 21,
  },
  weeklyReviewGrid: {
    flexDirection: "row",
    marginTop: 14,
  },
  weeklyReviewColumn: {
    flex: 1,
    borderRadius: 16,
    padding: 12,
    marginHorizontal: 4,
  },
  weeklyReviewColumnTitle: {
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 8,
  },
  weeklyReviewItem: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 6,
  },
  coachPlanCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginTop: 14,
  },
  coachPlanTitle: {
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 8,
  },
  coachPlanItem: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 5,
  },
  coachPlanRisk: {
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 6,
  },
  topRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 16,
  },
  topCard: {
    flex: 1,
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 4,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  scoreNumber: {
    fontSize: 42,
    fontWeight: "700",
  },
  scoreLabel: {
    fontSize: 14,
    marginTop: 6,
  },
  card: {
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  bigNumber: { fontSize: 52, fontWeight: "700" },
  cardSubtitle: { fontSize: 14, marginTop: 4, marginBottom: 12 },
  progressBarContainer: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: { height: 8, borderRadius: 4 },
  barChart: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    height: 120,
    marginTop: 8,
  },
  barColumn: { alignItems: "center", flex: 1 },
  barPercent: { fontSize: 10, marginBottom: 4 },
  barTrack: {
    width: 24,
    height: 80,
    borderRadius: 12,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  barFill: { width: "100%", borderRadius: 12 },
  barLabel: { fontSize: 11, marginTop: 6 },
  insightText: {
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 6,
  },
  recommendationText: {
    fontSize: 14,
    lineHeight: 22,
    marginTop: 10,
  },
  windowRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
  },
  windowCopy: {
    flex: 1,
    paddingRight: 10,
  },
  windowLabel: {
    fontSize: 14,
    fontWeight: "900",
  },
  windowMeta: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  windowTrack: {
    width: 86,
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
    marginRight: 10,
  },
  windowFill: {
    height: 8,
    borderRadius: 999,
  },
  windowPercent: {
    width: 38,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "right",
  },
  planRealityRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  planRealityStat: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 18,
    marginHorizontal: 4,
    alignItems: "center",
  },
  planRealityNumber: {
    fontSize: 24,
    fontWeight: "700",
  },
  planRealityLabel: {
    fontSize: 12,
    marginTop: 6,
  },
  priorityStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  priorityStat: {
    flex: 1,
    alignItems: "center",
    borderRadius: 16,
    paddingVertical: 16,
    marginHorizontal: 4,
  },
  priorityStatDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: 10,
  },
  priorityStatCount: {
    fontSize: 26,
    fontWeight: "700",
  },
  priorityStatLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  allTimeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  allTimeStat: { flex: 1, alignItems: "center" },
  allTimeDivider: { width: 1, height: 40 },
  allTimeNumber: { fontSize: 24, fontWeight: "700" },
  allTimeLabel: { fontSize: 12, marginTop: 4 },
});
