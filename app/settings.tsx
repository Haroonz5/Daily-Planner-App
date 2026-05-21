import Constants from "expo-constants";
import { useRouter } from "expo-router";
import {
  deleteUser,
  multiFactor,
  sendPasswordResetEmail,
  signOut,
  TotpMultiFactorGenerator,
  verifyBeforeUpdateEmail,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { doneKeyboardProps, keyboardScrollViewProps } from "@/utils/keyboard";

import { AppDropdown } from "@/components/app-dropdown";
import { KeyboardDoneAccessory } from "@/components/keyboard-done-accessory";
import { themeOptions, useAppTheme } from "@/constants/appTheme";
import { PetSprite } from "@/components/pet-sprite";
import {
  getActivePet,
  getPetDisplayName,
  getPetNickname,
  getLevelData,
  getPetProgress,
  getTaskXp,
  PET_TIERS,
  type Priority,
} from "@/constants/rewards";
import { Colors, ThemeLabels } from "@/constants/theme";
import { useUserProfile } from "@/hooks/use-user-profile";
import { logProductionAnalyticsEvent } from "@/utils/analytics";
import { getEmailValidationError } from "@/utils/email-validation";
import {
  formatDateKey,
  formatRecurrenceLabel,
  getNextRecurringDate,
  getRelativeDateLabel,
  parseTimeToMinutes,
  type RecurrenceRule,
} from "@/utils/task-helpers";
import {
  checkAiBackendHealth,
  getRoutineCoach,
  type AiBackendHealth,
  type RoutineCoachResult,
} from "@/utils/ai";
import {
  playRoutineFeedback,
  playSaveFeedback,
  playSelectionFeedback,
  playWarningFeedback,
} from "@/utils/feedback";
import {
  formatUsername,
  getUsernameError,
  normalizeUsername,
} from "@/utils/usernames";
import {
  exportTasksToCalendar,
  syncCalendarChangesToTasks,
} from "@/utils/calendar";
import {
  flushOfflineTaskQueue,
  getOfflineTaskQueue,
} from "@/utils/offline-task-queue";
import {
  cancelManyTaskNotifications,
  getScheduledNotificationAudit,
  getNotificationSettings,
  refreshNotificationState,
  saveNotificationSettings,
  scheduleQuickTestNotification,
  type NotificationSettings,
  type ScheduledNotificationAudit,
  syncMorningSummaryNotification,
  syncTaskNotifications,
} from "../utils/notifications";
import { ensureRollingRoutineTasks } from "../utils/routines";
import { auth, db } from "../constants/firebaseConfig";

type TaskStatus = "pending" | "completed" | "skipped";
type StatusTone = "idle" | "success" | "warning";

type Task = {
  id: string;
  title: string;
  time: string;
  date: string;
  completed: boolean;
  priority?: Priority;
  status?: TaskStatus;
  rescheduledCount?: number;
  originalTime?: string;
  completedAt?: any;
  recurrence?: RecurrenceRule;
  recurrenceGroupId?: string | null;
  recurrenceDays?: number[] | null;
  calendarEventId?: string | null;
  calendarId?: string | null;
};

type SettingsScreenProps = {
  showBackButton?: boolean;
};

type TesterFeedbackItem = {
  id: string;
  type?: (typeof feedbackTypes)[number];
  message?: string;
  appVersion?: string | null;
  theme?: string | null;
  createdAt?: any;
};

type DiagnosticItem = {
  id: string;
  source?: string;
  name?: string | null;
  message?: string;
  appVersion?: string | null;
  createdAt?: any;
};

type RoutineGroup = {
  id: string;
  title: string;
  recurrence: RecurrenceRule;
  recurrenceDays?: number[] | null;
  time: string;
  nextDate: string;
  nextTaskId?: string;
  activeCount: number;
  completedCount: number;
  skippedCount: number;
  totalCount: number;
  healthScore: number;
  healthLabel: string;
  currentStreak: number;
  bestStreak: number;
  recentCompletionRate: number;
  upcomingDates: string[];
  tasks: Task[];
};

const notificationTimeOptions = ["6:30 AM", "7:00 AM", "8:00 AM", "9:00 AM"];
const eveningTimeOptions = ["8:00 PM", "9:00 PM", "10:00 PM"];
const feedbackTypes = ["Bug", "Confusing", "Idea", "Praise"] as const;

const addDaysToDateKey = (dateKey: string, days: number) => {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
};

const toDateFromValue = (value: any) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate() as Date;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatTimestampLabel = (value: any) => {
  const date = toDateFromValue(value);
  if (!date) return "recently";

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default function SettingsScreen({
  showBackButton = true,
}: SettingsScreenProps) {
  const router = useRouter();
  const { themeName, setThemeName } = useAppTheme();
  const { profile, saveProfile } = useUserProfile();
  const colors = Colors[themeName];
  const themeDropdownOptions = useMemo(
    () =>
      themeOptions.map((theme) => {
        const preview = Colors[theme];

        return {
          label: ThemeLabels[theme],
          value: theme,
          description:
            preview.navigationTone === "dark" ? "Dark palette" : "Light palette",
          swatches: [preview.background, preview.card, preview.tint],
        };
      }),
    []
  );
  const feedbackTypeOptions = useMemo(
    () => feedbackTypes.map((type) => ({ label: type, value: type })),
    []
  );
  const morningTimeDropdownOptions = useMemo(
    () => notificationTimeOptions.map((time) => ({ label: time, value: time })),
    []
  );
  const eveningTimeDropdownOptions = useMemo(
    () => eveningTimeOptions.map((time) => ({ label: time, value: time })),
    []
  );

  const [tasks, setTasks] = useState<Task[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [planningRules, setPlanningRules] = useState("");
  const [weeklyFocusGoal, setWeeklyFocusGoal] = useState("");
  const [petNickname, setPetNickname] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [aiHealth, setAiHealth] = useState<AiBackendHealth | null>(null);
  const [aiHealthBusy, setAiHealthBusy] = useState(false);
  const [remindersBusy, setRemindersBusy] = useState(false);
  const [notificationSettings, setNotificationSettings] =
    useState<NotificationSettings>({
      taskRemindersEnabled: true,
      missedFollowUpEnabled: true,
      morningSummaryEnabled: true,
      eveningReminderEnabled: true,
      morningSummaryTime: "7:00 AM",
      eveningReminderTime: "9:00 PM",
    });
  const [notificationAudit, setNotificationAudit] =
    useState<ScheduledNotificationAudit | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState<StatusTone>("idle");
  const [feedbackType, setFeedbackType] =
    useState<(typeof feedbackTypes)[number]>("Bug");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [recentFeedback, setRecentFeedback] = useState<TesterFeedbackItem[]>([]);
  const [appErrors, setAppErrors] = useState<DiagnosticItem[]>([]);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(true);
  const [dataExportSummary, setDataExportSummary] = useState("");
  const [dangerBusy, setDangerBusy] = useState(false);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [calendarPullBusy, setCalendarPullBusy] = useState(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [offlineSyncBusy, setOfflineSyncBusy] = useState(false);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [totpSecret, setTotpSecret] = useState<Awaited<
    ReturnType<typeof TotpMultiFactorGenerator.generateSecret>
  > | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [, refreshMfaFactors] = useState(0);
  const [routineCoachById, setRoutineCoachById] = useState<
    Record<string, RoutineCoachResult>
  >({});
  const [routineCoachBusyId, setRoutineCoachBusyId] = useState<string | null>(null);
  const [routineManagerBusy, setRoutineManagerBusy] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<RoutineGroup | null>(null);
  const [editRoutineTitle, setEditRoutineTitle] = useState("");
  const [editRoutineTime, setEditRoutineTime] = useState("");
  const today = formatDateKey(new Date());
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const currentUser = auth.currentUser;
  const enrolledFactors = currentUser
    ? multiFactor(currentUser).enrolledFactors
    : [];
  const totpFactors = enrolledFactors.filter(
    (factor) => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID
  );
  const totpQrUrl = totpSecret?.generateQrCodeUrl(
    currentUser?.email ?? currentUser?.uid ?? "Daily Discipline",
    "Daily Discipline"
  );

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

  useEffect(() => {
    setDisplayName(profile.displayName ?? "");
  }, [profile.displayName]);

  useEffect(() => {
    setUsername(profile.username ?? "");
  }, [profile.username]);

  useEffect(() => {
    setPlanningRules(profile.planningRules ?? "");
  }, [profile.planningRules]);

  useEffect(() => {
    setWeeklyFocusGoal(profile.weeklyFocusGoal ?? "");
  }, [profile.weeklyFocusGoal]);

  const refreshAiHealth = async () => {
    setAiHealthBusy(true);

    try {
      const health = await checkAiBackendHealth();
      setAiHealth(health);
    } finally {
      setAiHealthBusy(false);
    }
  };

  useEffect(() => {
    void refreshAiHealth();
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user?.email) return;

    void setDoc(
      doc(db, "publicProfiles", user.uid),
      {
        uid: user.uid,
        email: deleteField(),
        username: profile.username ?? null,
        displayName: profile.displayName ?? null,
        updatedAt: new Date(),
      },
      { merge: true }
    ).catch(() => {});

    if (profile.username) {
      void setDoc(
        doc(db, "publicUsernames", profile.username),
        {
          uid: user.uid,
          email: deleteField(),
          username: profile.username,
          updatedAt: new Date(),
        },
        { merge: true }
      ).catch(() => {});
    }
  }, [profile.displayName, profile.username]);

  useEffect(() => {
    let active = true;

    void getNotificationSettings().then((settings) => {
      if (active) setNotificationSettings(settings);
    });
    void getScheduledNotificationAudit().then((audit) => {
      if (active) setNotificationAudit(audit);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    void getOfflineTaskQueue().then((queue) => {
      if (active) setOfflineQueueCount(queue.length);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setDiagnosticsLoading(false);
      return;
    }

    setDiagnosticsLoading(true);
    let loadedStreams = 0;
    const markLoaded = () => {
      loadedStreams += 1;
      if (loadedStreams >= 2) setDiagnosticsLoading(false);
    };

    const feedbackQuery = query(
      collection(db, "users", uid, "feedback"),
      orderBy("createdAt", "desc"),
      limit(5)
    );
    const errorsQuery = query(
      collection(db, "users", uid, "appErrors"),
      orderBy("createdAt", "desc"),
      limit(5)
    );

    // I keep a tiny local dashboard in Settings so tester feedback and crash-like
    // reports are visible during builds without needing a separate admin app.
    const unsubscribeFeedback = onSnapshot(
      feedbackQuery,
      (snapshot) => {
        setRecentFeedback(
          snapshot.docs.map((document) => ({
            id: document.id,
            ...document.data(),
          })) as TesterFeedbackItem[]
        );
        markLoaded();
      },
      () => {
        setRecentFeedback([]);
        markLoaded();
      }
    );

    const unsubscribeErrors = onSnapshot(
      errorsQuery,
      (snapshot) => {
        setAppErrors(
          snapshot.docs.map((document) => ({
            id: document.id,
            ...document.data(),
          })) as DiagnosticItem[]
        );
        markLoaded();
      },
      () => {
        setAppErrors([]);
        markLoaded();
      }
    );

    return () => {
      unsubscribeFeedback();
      unsubscribeErrors();
    };
  }, []);

  const rewardData = useMemo(() => {
    const totalXp = tasks.reduce((sum, task) => sum + getTaskXp(task), 0);
    const completedTasks = tasks.filter((task) => task.completed).length;
    const activePet = getActivePet(totalXp, profile.activePetKey);
    const petProgress = getPetProgress(totalXp);
    const levelData = getLevelData(totalXp);

    return {
      totalXp,
      completedTasks,
      activePet,
      petProgress,
      levelData,
    };
  }, [profile.activePetKey, tasks]);

  const savedActivePetNickname = getPetNickname(
    rewardData.activePet.key,
    profile.petNicknames,
    profile.petNickname
  );
  const activePetDisplayName = getPetDisplayName(
    rewardData.activePet,
    profile.petNicknames,
    profile.petNickname
  );

  useEffect(() => {
    setPetNickname(savedActivePetNickname);
  }, [savedActivePetNickname]);

  const routineGroups = useMemo<RoutineGroup[]>(() => {
    const grouped = new Map<string, Task[]>();

    tasks.forEach((task) => {
      if (!task.recurrenceGroupId || !task.recurrence || task.recurrence === "none") {
        return;
      }

      grouped.set(task.recurrenceGroupId, [
        ...(grouped.get(task.recurrenceGroupId) ?? []),
        task,
      ]);
    });

    return [...grouped.entries()]
      .map(([id, groupTasks]) => {
        const sortedTasks = [...groupTasks].sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return (parseTimeToMinutes(a.time) ?? 0) - (parseTimeToMinutes(b.time) ?? 0);
        });
        const activeTasks = sortedTasks.filter(
          (task) =>
            task.date >= today &&
            !task.completed &&
            (task.status ?? "pending") !== "skipped"
        );
        const nextTask =
          activeTasks[0] ??
          sortedTasks.find((task) => task.date >= today) ??
          sortedTasks[sortedTasks.length - 1];

        const completedCount = sortedTasks.filter((task) => task.completed).length;
        const skippedCount = sortedTasks.filter(
          (task) => (task.status ?? "pending") === "skipped"
        ).length;
        const attemptedCount = Math.max(completedCount + skippedCount, 1);
        const healthScore = Math.round((completedCount / attemptedCount) * 100);
        const healthLabel =
          healthScore >= 80
            ? "Strong"
            : healthScore >= 55
              ? "Needs tuning"
              : "High friction";
        const attemptedTasks = sortedTasks.filter(
          (task) =>
            task.date <= today ||
            task.completed ||
            (task.status ?? "pending") === "skipped"
        );
        const recentTasks = attemptedTasks.slice(-7);
        const recentCompleted = recentTasks.filter((task) => task.completed).length;
        const recentCompletionRate = recentTasks.length
          ? Math.round((recentCompleted / recentTasks.length) * 100)
          : 0;
        const upcomingDates = [nextTask?.date]
          .filter(Boolean)
          .reduce<string[]>((dates, firstDate) => {
            if (!firstDate) return dates;

            let cursor = firstDate;
            const nextDates = [firstDate];

            for (let i = 0; i < 2; i += 1) {
              const nextDate = getNextRecurringDate({
                fromDateKey: cursor,
                recurrence: nextTask?.recurrence ?? "none",
                recurrenceDays: nextTask?.recurrenceDays,
                weeklyAnchorDateKey: nextTask?.date,
              });

              if (!nextDate) break;
              nextDates.push(nextDate);
              cursor = nextDate;
            }

            return nextDates;
          }, []);
        let currentStreak = 0;
        for (const task of [...attemptedTasks].reverse()) {
          if (task.completed) {
            currentStreak += 1;
            continue;
          }
          break;
        }
        let bestStreak = 0;
        let runningStreak = 0;
        attemptedTasks.forEach((task) => {
          if (task.completed) {
            runningStreak += 1;
            bestStreak = Math.max(bestStreak, runningStreak);
            return;
          }
          runningStreak = 0;
        });

        return {
          id,
          title: nextTask?.title ?? "Recurring routine",
          recurrence: nextTask?.recurrence ?? "daily",
          recurrenceDays: nextTask?.recurrenceDays ?? null,
          time: nextTask?.time ?? "Any time",
          nextDate: nextTask?.date ?? today,
          nextTaskId: activeTasks[0]?.id,
          activeCount: activeTasks.length,
          completedCount,
          skippedCount,
          totalCount: sortedTasks.length,
          healthScore,
          healthLabel,
          currentStreak,
          bestStreak,
          recentCompletionRate,
          upcomingDates,
          tasks: sortedTasks,
        };
      })
      .filter((routine) => routine.activeCount > 0)
      .sort((a, b) => {
        if (a.nextDate !== b.nextDate) return a.nextDate.localeCompare(b.nextDate);
        return (parseTimeToMinutes(a.time) ?? 0) - (parseTimeToMinutes(b.time) ?? 0);
      });
  }, [tasks, today]);

  const routineInsights = useMemo(
    () =>
      routineGroups
        .filter(
          (routine) =>
            routine.healthScore < 80 ||
            routine.skippedCount > routine.completedCount ||
            routine.recentCompletionRate < 60
        )
        .slice(0, 3)
        .map((routine) => ({
          id: routine.id,
          title: routine.title,
          message:
            routine.skippedCount > routine.completedCount
              ? `${routine.title} has more skips than completions. Try a lighter version or a different time.`
              : routine.recentCompletionRate < 60
                ? `${routine.title} is below 60% recently. Move it away from high-friction hours.`
                : `${routine.title} is close, but could use a small tune-up before it becomes automatic.`,
        })),
    [routineGroups]
  );

  const routineManagerSummary = useMemo(() => {
    const needsAttention = routineGroups.filter(
      (routine) => routine.healthScore < 70 || routine.recentCompletionRate < 60
    ).length;
    const nextSevenDays = new Set(
      routineGroups.flatMap((routine) => routine.upcomingDates)
    ).size;

    return {
      active: routineGroups.length,
      needsAttention,
      nextSevenDays,
    };
  }, [routineGroups]);

  const releaseChecklistItems = useMemo(
    () => [
      {
        label: "Username reserved",
        done: Boolean(profile.username),
        detail: profile.username
          ? `${formatUsername(profile.username)} is ready for friend testing.`
          : "Set a username so testers can add you without sharing emails.",
      },
      {
        label: "AI or gateway reachable",
        done: Boolean(aiHealth?.ok),
        detail: aiHealth?.ok
          ? `${aiHealth.provider === "gateway" ? "Gateway" : "AI backend"} responded in ${aiHealth.responseMs}ms.`
          : "Deploy the backend/gateway or use local fallback for Expo Go.",
      },
      {
        label: "Gateway auth visible",
        done: aiHealth?.provider === "gateway" ? aiHealth.authMode === "firebase" : Boolean(aiHealth?.ok),
        detail:
          aiHealth?.provider === "gateway"
            ? `Auth ${aiHealth.authMode ?? "unknown"}, App Check ${aiHealth.appCheckMode ?? "off"}.`
            : "Point tester builds at the Go gateway for production-style security.",
      },
      {
        label: "Reminder health clean",
        done: Boolean(notificationAudit && notificationAudit.duplicateCount === 0),
        detail: notificationAudit
          ? `${notificationAudit.total} scheduled, ${notificationAudit.duplicateCount} duplicate.`
          : "Refresh reminder health before sending a build.",
      },
      {
        label: "Offline queue empty",
        done: offlineQueueCount === 0,
        detail:
          offlineQueueCount === 0
            ? "No AI-planned tasks are stuck locally."
            : `${offlineQueueCount} task${offlineQueueCount === 1 ? "" : "s"} still waiting to sync.`,
      },
      {
        label: "Diagnostics quiet",
        done: appErrors.length === 0,
        detail:
          appErrors.length === 0
            ? "No recent app errors for this tester account."
            : `${appErrors.length} recent error report${appErrors.length === 1 ? "" : "s"} need review.`,
      },
    ],
    [aiHealth, appErrors.length, notificationAudit, offlineQueueCount, profile.username]
  );

  const releaseReadyCount = releaseChecklistItems.filter((item) => item.done).length;

  const profileDirty =
    displayName !== (profile.displayName ?? "") ||
    normalizeUsername(username) !== (profile.username ?? "") ||
    planningRules !== (profile.planningRules ?? "") ||
    weeklyFocusGoal !== (profile.weeklyFocusGoal ?? "") ||
    petNickname !== savedActivePetNickname;

  const statusColor =
    statusTone === "success"
      ? colors.success
      : statusTone === "warning"
        ? colors.warning
        : colors.subtle;

  const appName = Constants.expoConfig?.name ?? "Daily Discipline";
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

  const refreshAudit = async () => {
    const audit = await getScheduledNotificationAudit();
    setNotificationAudit(audit);
    return audit;
  };

  const showSecurityError = (fallback: string, error: unknown) => {
    const code =
      typeof error === "object" && error && "code" in error
        ? String((error as { code?: string }).code)
        : "";

    setStatusTone("warning");
    if (code.includes("requires-recent-login")) {
      setStatusMessage(
        "Security changes need a fresh login. Log out, sign back in, then try again."
      );
      return;
    }
    if (code.includes("operation-not-allowed")) {
      setStatusMessage(
        "Firebase has not enabled this security method yet. Enable email changes or TOTP MFA in the Firebase console."
      );
      return;
    }
    if (code.includes("email-already-in-use")) {
      setStatusMessage("That email is already attached to another account.");
      return;
    }

    setStatusMessage(fallback);
  };

  const handleRequestEmailChange = async () => {
    const user = auth.currentUser;
    const nextEmail = newEmail.trim().toLowerCase();
    if (!user || !nextEmail || securityBusy) return;

    const emailError = getEmailValidationError(nextEmail);
    if (emailError) {
      setStatusTone("warning");
      setStatusMessage(emailError);
      return;
    }

    setSecurityBusy(true);

    try {
      // I use Firebase's verification-first email update so someone cannot
      // change the account address until they prove they own the new inbox.
      await verifyBeforeUpdateEmail(user, nextEmail);
      await playSaveFeedback(profile);
      setNewEmail("");
      setStatusTone("success");
      setStatusMessage(
        `Email-change link sent to ${nextEmail}. Open it to finish the update.`
      );
    } catch (error) {
      await playWarningFeedback(profile);
      showSecurityError("Email change could not be started.", error);
    } finally {
      setSecurityBusy(false);
    }
  };

  const handlePasswordReset = async () => {
    const email = auth.currentUser?.email;
    if (!email || securityBusy) return;

    setSecurityBusy(true);

    try {
      await sendPasswordResetEmail(auth, email);
      await playSaveFeedback(profile);
      setStatusTone("success");
      setStatusMessage(`Password reset email sent to ${email}.`);
    } catch (error) {
      await playWarningFeedback(profile);
      showSecurityError("Password reset email could not be sent.", error);
    } finally {
      setSecurityBusy(false);
    }
  };

  const startTotpEnrollment = async () => {
    const user = auth.currentUser;
    if (!user || securityBusy) return;

    setSecurityBusy(true);

    try {
      const session = await multiFactor(user).getSession();
      const secret = await TotpMultiFactorGenerator.generateSecret(session);
      setTotpSecret(secret);
      setTotpCode("");
      await playSelectionFeedback(profile);
      setStatusTone("success");
      setStatusMessage(
        "Authenticator setup started. Copy the secret key into your authenticator app, then enter the 6-digit code."
      );
    } catch (error) {
      await playWarningFeedback(profile);
      showSecurityError("Two-factor setup could not start.", error);
    } finally {
      setSecurityBusy(false);
    }
  };

  const confirmTotpEnrollment = async () => {
    const user = auth.currentUser;
    const code = totpCode.replace(/\s/g, "");
    if (!user || !totpSecret || securityBusy) return;

    if (code.length < 6) {
      setStatusTone("warning");
      setStatusMessage("Enter the 6-digit authenticator code first.");
      return;
    }

    setSecurityBusy(true);

    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(
        totpSecret,
        code
      );
      await multiFactor(user).enroll(assertion, "Authenticator app");
      await user.reload();
      setTotpSecret(null);
      setTotpCode("");
      refreshMfaFactors((value) => value + 1);
      await playSaveFeedback(profile);
      setStatusTone("success");
      setStatusMessage("Two-factor authentication is now enabled.");
    } catch (error) {
      await playWarningFeedback(profile);
      showSecurityError("Authenticator code was not accepted.", error);
    } finally {
      setSecurityBusy(false);
    }
  };

  const removeTotpFactor = async (factorUid: string) => {
    const user = auth.currentUser;
    if (!user || securityBusy) return;

    setSecurityBusy(true);

    try {
      await multiFactor(user).unenroll(factorUid);
      await user.reload();
      refreshMfaFactors((value) => value + 1);
      await playWarningFeedback(profile);
      setStatusTone("success");
      setStatusMessage("Authenticator app removed from this account.");
    } catch (error) {
      await playWarningFeedback(profile);
      showSecurityError("Authenticator app could not be removed.", error);
    } finally {
      setSecurityBusy(false);
    }
  };

  const handleExportCalendar = async () => {
    if (calendarBusy) return;
    const uid = auth.currentUser?.uid;

    setCalendarBusy(true);

    try {
      const result = await exportTasksToCalendar(tasks, 30, { uid });
      await logProductionAnalyticsEvent("calendar_sync", {
        mode: "push",
        created: result.created,
        updated: result.updated,
        deleted: result.deleted,
      });
      await playSaveFeedback(profile);
      setStatusTone("success");
      setStatusMessage(
        `${result.created} created, ${result.updated} updated, and ${result.deleted} completed/skipped event${result.deleted === 1 ? "" : "s"} cleaned from ${result.calendarTitle}. ${result.skipped} old or duplicate task${result.skipped === 1 ? " was" : "s were"} ignored.`
      );
    } catch (error) {
      await playWarningFeedback(profile);
      setStatusTone("warning");
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Calendar export could not finish on this device."
      );
    } finally {
      setCalendarBusy(false);
    }
  };

  const handlePullCalendarChanges = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || calendarPullBusy) return;

    setCalendarPullBusy(true);

    try {
      const result = await syncCalendarChangesToTasks(uid, tasks);
      await logProductionAnalyticsEvent("calendar_sync", {
        mode: "pull",
        checked: result.checked,
        updated: result.updated,
        missing: result.missing,
      });
      await playSelectionFeedback(profile);
      setStatusTone("success");
      setStatusMessage(
        `Calendar pull checked ${result.checked} exported task${result.checked === 1 ? "" : "s"} and updated ${result.updated}. ${result.missing} missing event${result.missing === 1 ? "" : "s"} ignored.`
      );
    } catch (error) {
      await playWarningFeedback(profile);
      setStatusTone("warning");
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Calendar pull-sync could not finish on this device."
      );
    } finally {
      setCalendarPullBusy(false);
    }
  };

  const handleFlushOfflineQueue = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || offlineSyncBusy) return;

    setOfflineSyncBusy(true);

    try {
      const result = await flushOfflineTaskQueue(uid);
      setOfflineQueueCount(result.remaining);
      await playSaveFeedback(profile);
      setStatusTone(result.flushed > 0 ? "success" : "idle");
      setStatusMessage(
        result.flushed > 0
          ? `${result.flushed} offline task${result.flushed === 1 ? "" : "s"} synced.`
          : "No offline tasks were waiting to sync."
      );
    } finally {
      setOfflineSyncBusy(false);
    }
  };

  const openSecurityDashboard = async () => {
    let dashboardUrl = "http://127.0.0.1:8020/admin";

    if (aiHealth?.url) {
      try {
        const parsed = new URL(aiHealth.url);
        parsed.port = "8020";
        dashboardUrl = `${parsed.origin}/admin`;
      } catch {
        dashboardUrl = "http://127.0.0.1:8020/admin";
      }
    }

    // I link to the Go gateway dashboard from Settings so the security layer is
    // visible during demos instead of hidden in terminal logs.
    await Linking.openURL(dashboardUrl).catch(() => {
      setStatusTone("warning");
      setStatusMessage("Could not open the security dashboard on this device.");
    });
  };

  const deleteCollectionDocs = async (
    uid: string,
    collectionName:
      | "tasks"
      | "focusSessions"
      | "feedback"
      | "appErrors"
      | "friends"
      | "widgetSummary"
  ) => {
    const snapshot = await getDocs(collection(db, "users", uid, collectionName));
    if (snapshot.empty) return [];

    const batch = writeBatch(db);
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();

    return snapshot.docs.map((document) => document.id);
  };

  const resetUserData = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || dangerBusy) return;

    setDangerBusy(true);

    try {
      const taskIds = await deleteCollectionDocs(uid, "tasks");
      await cancelManyTaskNotifications(taskIds);
      await deleteCollectionDocs(uid, "focusSessions");
      await deleteCollectionDocs(uid, "feedback");
      await deleteCollectionDocs(uid, "appErrors");
      await deleteCollectionDocs(uid, "friends");
      await deleteCollectionDocs(uid, "widgetSummary");
      await deleteCollectionDocs(uid, "appErrors");
      await saveProfile({
        activePetKey: null,
        petNickname: null,
        petNicknames: null,
        focusDurationMinutes: 25,
      });
      await refreshNotificationState(uid);
      await refreshAudit();

      setStatusTone("success");
      setStatusMessage("Test data reset. Your account and theme stayed intact.");
    } finally {
      setDangerBusy(false);
    }
  };

  const loadDemoDay = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || dangerBusy) return;

    setDangerBusy(true);

    try {
      const demoTasks: Task[] = [
        {
          id: `demo-${today}-plan`,
          title: "Plan the day honestly",
          date: today,
          time: "8:00 AM",
          priority: "High",
          completed: false,
          status: "pending",
        },
        {
          id: `demo-${today}-focus`,
          title: "Deep work sprint",
          date: today,
          time: "10:30 AM",
          priority: "High",
          completed: false,
          status: "pending",
        },
        {
          id: `demo-${today}-walk`,
          title: "Ten minute reset walk",
          date: today,
          time: "3:00 PM",
          priority: "Medium",
          completed: false,
          status: "pending",
        },
        {
          id: `demo-${addDaysToDateKey(today, 1)}-review`,
          title: "Review tomorrow's top three",
          date: addDaysToDateKey(today, 1),
          time: "7:30 PM",
          priority: "Medium",
          completed: false,
          status: "pending",
        },
      ];

      const batch = writeBatch(db);
      demoTasks.forEach((task) => {
        batch.set(doc(db, "users", uid, "tasks", task.id), {
          title: task.title,
          date: task.date,
          time: task.time,
          priority: task.priority,
          completed: false,
          status: "pending",
          notes: "Demo task added from Settings so testers can try the app quickly.",
          aiCreated: false,
          createdAt: new Date(),
        });
      });
      await batch.commit();
      await Promise.all(demoTasks.map((task) => syncTaskNotifications(task)));
      await syncMorningSummaryNotification(uid);
      await playSaveFeedback(profile);
      setStatusTone("success");
      setStatusMessage("Demo day loaded. Today now has sample tasks for tester walkthroughs.");
    } finally {
      setDangerBusy(false);
    }
  };

  const shareDataExport = async () => {
    const user = auth.currentUser;
    if (!user || dangerBusy) return;

    setDangerBusy(true);

    try {
      const uid = user.uid;
      const [taskSnap, focusSnap, feedbackSnap, errorSnap] = await Promise.all([
        getDocs(collection(db, "users", uid, "tasks")),
        getDocs(collection(db, "users", uid, "focusSessions")),
        getDocs(collection(db, "users", uid, "feedback")),
        getDocs(collection(db, "users", uid, "appErrors")),
      ]);
      const toDocs = (snapshot: Awaited<ReturnType<typeof getDocs>>) =>
        snapshot.docs.map((document) => ({
          id: document.id,
          ...(document.data() as Record<string, unknown>),
        }));
      const payload = {
        exportedAt: new Date().toISOString(),
        appVersion,
        account: {
          uid,
          email: user.email,
          username: profile.username ?? null,
          displayName: profile.displayName ?? null,
        },
        counts: {
          tasks: taskSnap.size,
          focusSessions: focusSnap.size,
          feedback: feedbackSnap.size,
          appErrors: errorSnap.size,
        },
        data: {
          tasks: toDocs(taskSnap),
          focusSessions: toDocs(focusSnap),
          feedback: toDocs(feedbackSnap),
          appErrors: toDocs(errorSnap),
        },
      };

      const message = JSON.stringify(payload, null, 2);
      setDataExportSummary(
        `${payload.counts.tasks} tasks, ${payload.counts.focusSessions} focus sessions, ${payload.counts.feedback} feedback notes, ${payload.counts.appErrors} diagnostics exported.`
      );
      await Share.share({
        title: "Daily Discipline Data Export",
        message,
      });
      setStatusTone("success");
      setStatusMessage("Data export prepared for sharing or saving.");
    } catch {
      setStatusTone("warning");
      setStatusMessage("Data export could not be prepared on this device.");
    } finally {
      setDangerBusy(false);
    }
  };

  const confirmResetData = () => {
    Alert.alert(
      "Reset app data?",
      "This deletes tasks, focus sessions, feedback, and reward progress. Your login stays active.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset Data",
          style: "destructive",
          onPress: () => {
            void resetUserData();
          },
        },
      ]
    );
  };

  const deleteAccount = async () => {
    const user = auth.currentUser;
    if (!user || dangerBusy) return;

    setDangerBusy(true);

    try {
      const uid = user.uid;
      const taskIds = await deleteCollectionDocs(uid, "tasks");
      await cancelManyTaskNotifications(taskIds);
      await deleteCollectionDocs(uid, "focusSessions");
      await deleteCollectionDocs(uid, "feedback");
      const profileBatch = writeBatch(db);
      profileBatch.delete(doc(db, "users", uid));
      profileBatch.delete(doc(db, "publicProfiles", uid));
      profileBatch.delete(doc(db, "publicProgress", uid));
      if (profile.username) {
        profileBatch.delete(doc(db, "publicUsernames", profile.username));
      }
      await profileBatch.commit();
      await deleteUser(user);
    } catch {
      setStatusTone("warning");
      setStatusMessage(
        "Account delete needs a fresh login. Log out, log back in, then try again."
      );
    } finally {
      setDangerBusy(false);
    }
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      "Delete account?",
      "This permanently deletes this tester account and its app data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: () => {
            void deleteAccount();
          },
        },
      ]
    );
  };

  const handleSaveProfile = async () => {
    const user = auth.currentUser;
    if (!user?.email) return;

    const nextUsername = normalizeUsername(username);
    const previousUsername = profile.username ?? "";
    const usernameError = getUsernameError(nextUsername);

    if (usernameError) {
      setStatusTone("warning");
      setStatusMessage(usernameError);
      return;
    }

    setProfileSaving(true);

    try {
      const nextPetNickname = petNickname.trim() || null;
      const nextPetNicknames = {
        ...(profile.petNicknames ?? {}),
        [rewardData.activePet.key]: nextPetNickname,
      };
      const usernameChanged = nextUsername !== previousUsername;

      if (usernameChanged) {
        const usernameSnapshot = await getDoc(
          doc(db, "publicUsernames", nextUsername)
        );
        const usernameOwner = usernameSnapshot.data()?.uid;

        if (usernameSnapshot.exists() && usernameOwner !== user.uid) {
          setStatusTone("warning");
          setStatusMessage("That username is already taken.");
          return;
        }
      }

      // I save profile and username reservation together so the public friend
      // lookup cannot point at a username the private profile did not keep.
      const batch = writeBatch(db);
      batch.set(
        doc(db, "users", user.uid),
        {
          displayName: displayName.trim() || null,
          username: nextUsername,
          planningRules: planningRules.trim() || null,
          weeklyFocusGoal: weeklyFocusGoal.trim() || null,
          petNickname: nextPetNickname,
          petNicknames: nextPetNicknames,
        },
        { merge: true }
      );
      batch.set(
        doc(db, "publicProfiles", user.uid),
        {
          uid: user.uid,
          email: deleteField(),
          username: nextUsername,
          displayName: displayName.trim() || null,
          updatedAt: new Date(),
        },
        { merge: true }
      );

      if (usernameChanged) {
        batch.set(doc(db, "publicUsernames", nextUsername), {
          uid: user.uid,
          username: nextUsername,
          updatedAt: new Date(),
        });
      }

      if (previousUsername && usernameChanged) {
        batch.delete(doc(db, "publicUsernames", previousUsername));
      }

      await batch.commit();
      await playSaveFeedback(profile);
      setStatusTone("success");
      setStatusMessage(
        `Profile updated. Friends will see you as ${formatUsername(nextUsername)}.`
      );
    } finally {
      setProfileSaving(false);
    }
  };

  const handleRefreshReminders = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setRemindersBusy(true);

    try {
      await refreshNotificationState(uid);
      const audit = await refreshAudit();
      setStatusTone("success");
      setStatusMessage(
        audit.duplicateCount > 0
          ? "Reminder schedule refreshed. Duplicate cleanup will finish on the next refresh if any remain."
          : "Reminder schedule refreshed and duplicate check is clean."
      );
    } finally {
      setRemindersBusy(false);
    }
  };

  const updateNotificationSettings = async (
    updates: Partial<NotificationSettings>
  ) => {
    const uid = auth.currentUser?.uid;
    setRemindersBusy(true);

    try {
      const nextSettings = await saveNotificationSettings(updates);
      setNotificationSettings(nextSettings);

      if (uid) {
        await refreshNotificationState(uid);
      }

      await refreshAudit();
      setStatusTone("success");
      setStatusMessage("Notification preferences saved and synced.");
    } finally {
      setRemindersBusy(false);
    }
  };

  const handleTestReminder = async () => {
    setRemindersBusy(true);

    try {
      const notificationId = await scheduleQuickTestNotification();
      if (notificationId) {
        await playSelectionFeedback(profile);
        setStatusTone("success");
        setStatusMessage(
          "Test reminder scheduled for about 5 seconds from now."
        );
      } else {
        await playWarningFeedback(profile);
        setStatusTone("warning");
        setStatusMessage(
          "Notification permission is still off, so the test could not be sent."
        );
      }
      await refreshAudit();
    } finally {
      setRemindersBusy(false);
    }
  };

  const submitFeedback = async () => {
    const uid = auth.currentUser?.uid;
    const message = feedbackText.trim();

    if (!uid || !message || feedbackBusy) {
      setStatusTone("warning");
      setStatusMessage("Write a quick note before sending feedback.");
      return;
    }

    setFeedbackBusy(true);

    try {
      await addDoc(collection(db, "users", uid, "feedback"), {
        type: feedbackType,
        message,
        email: auth.currentUser?.email ?? null,
        appVersion,
        theme: themeName,
        createdAt: new Date(),
      });

      setFeedbackText("");
      await playSaveFeedback(profile);
      setStatusTone("success");
      setStatusMessage("Feedback sent. This will help polish the tester build.");
    } finally {
      setFeedbackBusy(false);
    }
  };

  const repairRollingRoutines = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || routineManagerBusy) return;

    setRoutineManagerBusy(true);

    try {
      // I added this button so the routine manager can repair rolling tasks on
      // demand instead of making the user wait for the home screen to refill.
      const generated = await ensureRollingRoutineTasks({ uid, tasks });
      await syncMorningSummaryNotification(uid);
      await refreshAudit();
      await playRoutineFeedback(profile);
      setStatusTone("success");
      setStatusMessage(
        generated > 0
          ? `${generated} routine task${generated === 1 ? "" : "s"} refilled.`
          : "Routines are already caught up."
      );
    } finally {
      setRoutineManagerBusy(false);
    }
  };

  const endRoutine = async (routine: RoutineGroup) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const targets = routine.tasks.filter(
      (task) =>
        task.date >= today &&
        !task.completed &&
        (task.status ?? "pending") !== "skipped"
    );

    if (targets.length === 0) {
      setStatusTone("warning");
      setStatusMessage("That routine has no open future tasks to remove.");
      return;
    }

    const batch = writeBatch(db);

    routine.tasks.forEach((task) => {
      const taskRef = doc(db, "users", uid, "tasks", task.id);

      if (
        task.date >= today &&
        !task.completed &&
        (task.status ?? "pending") !== "skipped"
      ) {
        batch.delete(taskRef);
        return;
      }

      batch.update(taskRef, {
        recurrence: "none",
        recurrenceGroupId: null,
        recurrenceDays: null,
        rollingRoutine: false,
        routineCanceledAt: new Date(),
      });
    });

    await cancelManyTaskNotifications(targets.map((task) => task.id));
    await batch.commit();
    await syncMorningSummaryNotification(uid);
    await refreshAudit();

    await playWarningFeedback(profile);
    setStatusTone("success");
    setStatusMessage(
      `${routine.title} routine canceled. Future generated tasks were removed, and completed history stayed intact.`
    );
  };

  const confirmEndRoutine = (routine: RoutineGroup) => {
    const routineLabel = `${routine.title} ${formatRecurrenceLabel(
      routine.recurrence,
      routine.recurrenceDays
    ).toLowerCase()}`;

    Alert.alert(
      `Cancel ${routine.title}?`,
      `This deletes the ongoing "${routineLabel}" routine by removing ${routine.activeCount} open or future task${
        routine.activeCount === 1 ? "" : "s"
      }. Completed history stays in your stats.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: `Delete ${routine.title} Routine`,
          style: "destructive",
          onPress: () => {
            void endRoutine(routine);
          },
        },
      ]
    );
  };

  const skipNextRoutineOccurrence = async (routine: RoutineGroup) => {
    const uid = auth.currentUser?.uid;
    const nextTask = routine.tasks.find((task) => task.id === routine.nextTaskId);
    if (!uid || !nextTask) return;

    const batch = writeBatch(db);
    batch.update(doc(db, "users", uid, "tasks", nextTask.id), {
      completed: false,
      status: "skipped",
      skippedAt: new Date(),
      skippedOccurrence: true,
      seriesContinues: true,
      lastActionAt: new Date(),
    });

    await batch.commit();
    await cancelManyTaskNotifications([nextTask.id]);

    // I added this so skipping one routine occurrence still connects back to
    // the rolling-routine refill system and creates the next valid occurrence.
    await ensureRollingRoutineTasks({
      uid,
      tasks: tasks.map((task) =>
        task.id === nextTask.id
          ? { ...task, completed: false, status: "skipped" }
          : task
      ),
    });
    await syncMorningSummaryNotification(uid);
    await refreshAudit();

    await playRoutineFeedback(profile);
    setStatusTone("success");
    setStatusMessage(`${routine.title} skipped once. The routine will keep going.`);
  };

  const pauseRoutineForWeek = async (routine: RoutineGroup) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const targets = routine.tasks.filter(
      (task) =>
        task.date >= today &&
        !task.completed &&
        (task.status ?? "pending") !== "skipped"
    );

    if (!targets.length) {
      setStatusTone("warning");
      setStatusMessage("That routine has no active task to pause.");
      return;
    }

    const batch = writeBatch(db);
    const shiftedTasks = targets.map((task) => ({
      ...task,
      date: addDaysToDateKey(task.date, 7),
    }));

    shiftedTasks.forEach((task) => {
      batch.update(doc(db, "users", uid, "tasks", task.id), {
        date: task.date,
        routinePausedUntil: task.date,
        lastActionAt: new Date(),
      });
    });

    await batch.commit();
    await Promise.all(
      shiftedTasks.map((task) =>
        syncTaskNotifications({
          id: task.id,
          title: task.title,
          time: task.time,
          date: task.date,
          priority: task.priority,
          completed: false,
          status: "pending",
        })
      )
    ).catch(() => {});
    await syncMorningSummaryNotification(uid);
    await refreshAudit();

    await playRoutineFeedback(profile);
    setStatusTone("success");
    setStatusMessage(`${routine.title} paused for one week.`);
  };

  const openRoutineEditor = (routine: RoutineGroup) => {
    setEditingRoutine(routine);
    setEditRoutineTitle(routine.title);
    setEditRoutineTime(routine.time);
  };

  const saveRoutineEdits = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !editingRoutine) return;

    const nextTitle = editRoutineTitle.trim();
    const nextTime = editRoutineTime.trim().toUpperCase();

    if (!nextTitle || parseTimeToMinutes(nextTime) === null) {
      setStatusTone("warning");
      setStatusMessage("Add a title and a time like 6:00 PM before saving.");
      return;
    }

    const batch = writeBatch(db);
    editingRoutine.tasks.forEach((task) => {
      batch.update(doc(db, "users", uid, "tasks", task.id), {
        title: nextTitle,
        time: nextTime,
        originalTime: nextTime,
        lastActionAt: new Date(),
      });
    });

    await batch.commit();
    await Promise.all(
      editingRoutine.tasks
        .filter(
          (task) =>
            task.date >= today &&
            !task.completed &&
            (task.status ?? "pending") !== "skipped"
        )
        .map((task) =>
          syncTaskNotifications({
            id: task.id,
            title: nextTitle,
            time: nextTime,
            date: task.date,
            priority: task.priority,
            completed: false,
            status: "pending",
          })
        )
    ).catch(() => {});
    await syncMorningSummaryNotification(uid);
    await refreshAudit();

    setEditingRoutine(null);
    await playSaveFeedback(profile);
    setStatusTone("success");
    setStatusMessage(`${nextTitle} routine updated.`);
  };

  const loadRoutineCoach = async (routine: RoutineGroup) => {
    setRoutineCoachBusyId(routine.id);

    try {
      const recurrenceLabel = formatRecurrenceLabel(
        routine.recurrence,
        routine.recurrenceDays
      );
      const result = await getRoutineCoach({
        routineTitle: routine.title,
        recurrenceLabel,
        time: routine.time,
        timezone,
        tasks: routine.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          date: task.date,
          time: task.time,
          priority: task.priority ?? "Medium",
          completed: task.completed,
          status: task.status ?? "pending",
          rescheduledCount: task.rescheduledCount ?? 0,
        })),
      });

      setRoutineCoachById((current) => ({
        ...current,
        [routine.id]: result,
      }));
      await playSelectionFeedback(profile);
    } finally {
      setRoutineCoachBusyId(null);
    }
  };

  return (
    <ScrollView
      {...keyboardScrollViewProps}
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        {showBackButton && (
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.backText, { color: colors.tint }]}>Back</Text>
          </TouchableOpacity>
        )}
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={[styles.headerKicker, { color: colors.tint }]}>
              Control Center
            </Text>
            <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
            <Text style={[styles.subtitle, { color: colors.subtle }]}>
              Manage profile, routines, reminders, tester feedback, and account
              controls.
            </Text>
          </View>

          <View
            style={[
              styles.headerBadge,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.headerBadgeValue, { color: colors.text }]}>
              {routineGroups.length}
            </Text>
            <Text style={[styles.headerBadgeLabel, { color: colors.subtle }]}>
              Routines
            </Text>
          </View>
        </View>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, shadowColor: colors.tint },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>
          Tester Launch Checklist
        </Text>
        <Text style={[styles.noteText, { color: colors.text }]}>
          Use this before sending a build to friends so account, AI, routines,
          and accountability all get checked together.
        </Text>
        <View
          style={[
            styles.releaseScorePanel,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.releaseScoreText, { color: colors.text }]}>
            {releaseReadyCount}/{releaseChecklistItems.length} ready for testers
          </Text>
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.round((releaseReadyCount / releaseChecklistItems.length) * 100)}%`,
                  backgroundColor:
                    releaseReadyCount === releaseChecklistItems.length
                      ? colors.success
                      : colors.tint,
                },
              ]}
            />
          </View>
        </View>

        {releaseChecklistItems.map((item) => (
          <View key={item.label} style={styles.checklistRow}>
            <Text
              style={[
                styles.checklistDot,
                { color: item.done ? colors.success : colors.warning },
              ]}
            >
              {item.done ? "✓" : "•"}
            </Text>
            <View style={styles.checklistCopy}>
              <Text style={[styles.checklistText, { color: colors.text }]}>
                {item.label}
              </Text>
              <Text style={[styles.checklistDetail, { color: colors.subtle }]}>
                {item.detail}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, shadowColor: colors.tint },
        ]}
      >
        <View style={styles.aiHealthHeader}>
          <View style={styles.aiHealthCopy}>
            <Text style={[styles.cardTitle, { color: colors.subtle }]}>
              AI Backend Status
            </Text>
            <Text style={[styles.noteText, { color: colors.text }]}>
              Use this to confirm whether the app is talking to Gemini/OpenAI,
              the backend fallback, or the phone&apos;s offline planner.
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.inlineRefreshButton,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={refreshAiHealth}
            disabled={aiHealthBusy}
            accessibilityLabel="Refresh AI backend status"
          >
            <Text style={[styles.inlineRefreshText, { color: colors.text }]}>
              {aiHealthBusy ? "Checking" : "Refresh"}
            </Text>
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.aiHealthPanel,
            {
              backgroundColor: colors.background,
              borderColor: aiHealth?.ok ? colors.success : colors.warning,
            },
          ]}
        >
          <View style={styles.aiHealthTopRow}>
            <Text style={[styles.aiHealthTitle, { color: colors.text }]}>
              {aiHealth?.ok
                ? aiHealth.provider === "gateway"
                  ? "Security gateway ready"
                  : aiHealth.modelConfigured
                    ? "Model-powered AI ready"
                    : "Backend fallback ready"
                : "Backend not reachable"}
            </Text>
            <Text
              style={[
                styles.aiHealthBadge,
                {
                  color: aiHealth?.ok
                    ? aiHealth.modelConfigured
                      ? colors.success
                      : colors.warning
                    : colors.danger,
                },
              ]}
            >
              {aiHealth?.ok
                ? aiHealth.provider === "gateway"
                  ? "Gateway"
                  : aiHealth.modelConfigured
                    ? "Live"
                    : "Local"
                : "Offline"}
            </Text>
          </View>
          <Text style={[styles.aiHealthBody, { color: colors.subtle }]}>
            {aiHealth?.ok
              ? aiHealth.provider === "gateway"
                ? `Gateway auth ${aiHealth.authMode ?? "unknown"} • App Check ${aiHealth.appCheckMode ?? "off"} • audit ${aiHealth.auditDb ? "DB" : "stdout"}`
                : aiHealth.modelConfigured
                  ? `${aiHealth.remoteSources[0]?.toUpperCase() ?? "AI"} via ${aiHealth.activeModel ?? "configured model"} • ${aiHealth.responseMs}ms`
                  : `Backend is online at ${aiHealth.url}, but no model key is configured.`
              : `Could not reach ${aiHealth?.url ?? "the backend"}. The app will still use its built-in planner.`}
          </Text>
          <Text style={[styles.aiHealthMeta, { color: colors.subtle }]}>
            Timeout target: {aiHealth?.timeoutSeconds ?? 5}s. Slow model calls
            fall back so task creation does not freeze.
          </Text>
        </View>

        <View style={styles.inlineActionRow}>
          <TouchableOpacity
            style={[
              styles.inlineActionButton,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={openSecurityDashboard}
            accessibilityRole="button"
            accessibilityLabel="Open security gateway admin dashboard"
          >
            <Text style={[styles.inlineActionText, { color: colors.text }]}>
              Open Ops Dashboard
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, shadowColor: colors.tint },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>
          Interview Systems
        </Text>
        <Text style={[styles.noteText, { color: colors.text }]}>
          Demo the production story: seeded data, AI memory, security analytics,
          and a weekly report card recruiters can understand quickly.
        </Text>
        <View style={styles.inlineActionRow}>
          {[
            { label: "Demo Mode", route: "/demo-mode" },
            { label: "Tester Dashboard", route: "/admin-tester-dashboard" },
            { label: "Admin Analytics", route: "/admin-analytics" },
            { label: "Crash Viewer", route: "/crash-viewer" },
            { label: "Privacy", route: "/privacy" },
            { label: "AI Memory", route: "/ai-memory-timeline" },
            { label: "Weekly Report", route: "/weekly-report" },
            { label: "Widget Preview", route: "/widget-preview" },
          ].map((item) => (
            <TouchableOpacity
              key={item.route}
              style={[
                styles.inlineActionButton,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              onPress={() => router.push(item.route as never)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.label}`}
            >
              <Text style={[styles.inlineActionText, { color: colors.text }]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, shadowColor: colors.tint },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>
          Calendar Sync, Widgets & Lock Screen
        </Text>
        <Text style={[styles.noteText, { color: colors.text }]}>
          The app now writes richer widget summary data, supports Complete,
          Snooze, and Skip actions from task notifications, and can export the
          next month of active tasks to your phone calendar. Existing exported events now update instead of duplicating, and completed/skipped tasks can be cleaned from the calendar.
        </Text>

        <View
          style={[
            styles.emptySettingsCard,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.emptySettingsTitle, { color: colors.text }]}>
            Native feature readiness
          </Text>
          <Text style={[styles.emptySettingsText, { color: colors.subtle }]}>
            Full iPhone home-screen widgets need a development or production
            build. This screen now includes a widget preview, local cache, and
            Firestore summary so the native layer has a clean payload to read.
          </Text>
          <View style={styles.inlineActionRow}>
            <TouchableOpacity
              style={[styles.inlineActionButton, { backgroundColor: colors.tint }]}
              onPress={() => router.push("/week" as never)}
              accessibilityRole="button"
              accessibilityLabel="Open week planner"
            >
              <Text style={styles.inlineActionText}>Open Week Planner</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.inlineActionButton,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              onPress={() => router.push("/widget-preview" as never)}
              accessibilityRole="button"
              accessibilityLabel="Open widget preview"
            >
              <Text style={[styles.inlineActionText, { color: colors.text }]}>
                Widget Preview
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.inlineActionButton,
                { backgroundColor: calendarBusy ? colors.border : colors.tint },
              ]}
              onPress={handleExportCalendar}
              disabled={calendarBusy}
              accessibilityRole="button"
              accessibilityLabel="Export next thirty days of active tasks to calendar"
            >
              <Text style={styles.inlineActionText}>
                {calendarBusy ? "Syncing..." : "Sync 30 Days"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.inlineActionButton,
                {
                  backgroundColor: calendarPullBusy
                    ? colors.border
                    : colors.surface,
                  borderColor: colors.border,
                },
              ]}
              onPress={handlePullCalendarChanges}
              disabled={calendarPullBusy}
              accessibilityRole="button"
              accessibilityLabel="Pull changed calendar event times back into tasks"
            >
              <Text style={[styles.inlineActionText, { color: colors.text }]}>
                {calendarPullBusy ? "Syncing..." : "Pull Changes"}
              </Text>
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.offlineQueuePanel,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.securityHeaderCopy}>
              <Text style={[styles.emptySettingsTitle, { color: colors.text }]}>
                Offline Queue
              </Text>
              <Text style={[styles.emptySettingsText, { color: colors.subtle }]}>
                {offlineQueueCount} task{offlineQueueCount === 1 ? "" : "s"} waiting.
                The app auto-syncs these after login, but you can retry now.
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.inlineActionButton,
                { backgroundColor: offlineSyncBusy ? colors.border : colors.tint },
              ]}
              onPress={handleFlushOfflineQueue}
              disabled={offlineSyncBusy}
              accessibilityRole="button"
              accessibilityLabel="Sync queued offline tasks now"
            >
              <Text style={styles.inlineActionText}>
                {offlineSyncBusy ? "Syncing..." : "Sync Queue"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, shadowColor: colors.tint },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>
          Accountability Friends
        </Text>
        <Text style={[styles.noteText, { color: colors.text }]}>
          Add friends by username or email so you can see each other&apos;s daily
          progress and send quick check-ins.
        </Text>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.tint }]}
          onPress={() => router.push("/friends" as never)}
        >
          <Text style={styles.primaryButtonText}>Open Friends</Text>
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, shadowColor: colors.tint },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>
          Account Security
        </Text>
        <Text style={[styles.noteText, { color: colors.text }]}>
          Update your login email, send a password reset, and protect the
          account with an authenticator app.
        </Text>

        <View
          style={[
            styles.securityPanel,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.securityLabel, { color: colors.subtle }]}>
            Current Email
          </Text>
          <Text style={[styles.securityValue, { color: colors.text }]}>
            {currentUser?.email ?? "Signed in"}
          </Text>

          <Text style={[styles.inputLabel, { color: colors.subtle }]}>
            New Email
          </Text>
          <TextInput
            {...doneKeyboardProps}
            style={[
              styles.input,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            placeholder="new@email.com"
            placeholderTextColor={colors.subtle}
            value={newEmail}
            onChangeText={setNewEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[
                styles.secondaryButton,
                { backgroundColor: colors.surface },
              ]}
              onPress={handleRequestEmailChange}
              disabled={securityBusy || !newEmail.trim()}
              accessibilityRole="button"
              accessibilityLabel="Send email change verification link"
            >
              <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
                Email Link
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.secondaryButton,
                { backgroundColor: colors.surface },
              ]}
              onPress={handlePasswordReset}
              disabled={securityBusy}
              accessibilityRole="button"
              accessibilityLabel="Send password reset email"
            >
              <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
                Reset Password
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View
          style={[
            styles.securityPanel,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          <View style={styles.securityHeaderRow}>
            <View style={styles.securityHeaderCopy}>
              <Text style={[styles.emptySettingsTitle, { color: colors.text }]}>
                Two-Factor Authentication
              </Text>
              <Text style={[styles.emptySettingsText, { color: colors.subtle }]}>
                {totpFactors.length > 0
                  ? `${totpFactors.length} authenticator app${totpFactors.length === 1 ? "" : "s"} connected.`
                  : "Add an authenticator app so signing in needs a 6-digit code."}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.inlineActionButton, { backgroundColor: colors.tint }]}
              onPress={startTotpEnrollment}
              disabled={securityBusy}
              accessibilityRole="button"
              accessibilityLabel="Start authenticator app setup"
            >
              <Text style={styles.inlineActionText}>
                {totpSecret ? "Restart" : "Set Up"}
              </Text>
            </TouchableOpacity>
          </View>

          {totpSecret ? (
            <View
              style={[
                styles.secretBox,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.securityLabel, { color: colors.subtle }]}>
                Authenticator Setup Key
              </Text>
              <Text
                selectable
                style={[styles.secretText, { color: colors.text }]}
              >
                {totpSecret.secretKey}
              </Text>
              {totpQrUrl ? (
                <Text
                  selectable
                  style={[styles.secretHint, { color: colors.subtle }]}
                >
                  QR URI: {totpQrUrl}
                </Text>
              ) : null}
              <TextInput
                {...doneKeyboardProps}
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    color: colors.text,
                    marginTop: 12,
                  },
                ]}
                placeholder="6-digit code"
                placeholderTextColor={colors.subtle}
                value={totpCode}
                onChangeText={setTotpCode}
                keyboardType="number-pad"
                maxLength={8}
                inputAccessoryViewID="settings-totp-code-keyboard"
              />
              <KeyboardDoneAccessory
                nativeID="settings-totp-code-keyboard"
                colors={colors}
              />
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.tint }]}
                onPress={confirmTotpEnrollment}
                disabled={securityBusy}
                accessibilityRole="button"
                accessibilityLabel="Confirm two-factor authenticator code"
              >
                <Text style={styles.primaryButtonText}>
                  {securityBusy ? "Checking..." : "Confirm 2FA"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {totpFactors.map((factor) => (
            <View
              key={factor.uid}
              style={[
                styles.factorRow,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.securityHeaderCopy}>
                <Text style={[styles.securityValue, { color: colors.text }]}>
                  {factor.displayName ?? "Authenticator app"}
                </Text>
                <Text style={[styles.securityLabel, { color: colors.subtle }]}>
                  Added to this Firebase account
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.inlineActionButton,
                  { backgroundColor: colors.warning },
                ]}
                onPress={() => removeTotpFactor(factor.uid)}
                disabled={securityBusy}
                accessibilityRole="button"
                accessibilityLabel="Remove authenticator app from account"
              >
                <Text style={styles.inlineActionText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, shadowColor: colors.tint },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>Profile</Text>
        <Text style={[styles.profileText, { color: colors.text }]}>
          {formatUsername(profile.username) || auth.currentUser?.email || "Signed in"}
        </Text>
        <Text style={[styles.profileHint, { color: colors.subtle }]}>
          Active companion: {activePetDisplayName}
        </Text>

        <Text style={[styles.inputLabel, { color: colors.subtle }]}>
          Your Name
        </Text>
        <TextInput
          {...doneKeyboardProps}
          style={[
            styles.input,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
          placeholder="What should the app call you?"
          placeholderTextColor={colors.subtle}
          value={displayName}
          onChangeText={setDisplayName}
        />

        <Text style={[styles.inputLabel, { color: colors.subtle }]}>
          Username
        </Text>
        <TextInput
          {...doneKeyboardProps}
          style={[
            styles.input,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
          placeholder="@username"
          placeholderTextColor={colors.subtle}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={[styles.profileHint, { color: colors.subtle }]}>
          Friends use this to find you without needing your email.
        </Text>

        <Text style={[styles.inputLabel, { color: colors.subtle }]}>
          AI Planning Rules
        </Text>
        <TextInput
          {...doneKeyboardProps}
          style={[
            styles.input,
            styles.largeTextInput,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
          placeholder="Example: keep Sundays open, no workouts after 8 PM, plan school first"
          placeholderTextColor={colors.subtle}
          value={planningRules}
          onChangeText={setPlanningRules}
          multiline
        />
        <Text style={[styles.profileHint, { color: colors.subtle }]}>
          These rules are sent with Plan with AI so the planner feels more personal.
        </Text>

        <Text style={[styles.inputLabel, { color: colors.subtle }]}>
          Weekly Focus Goal
        </Text>
        <TextInput
          {...doneKeyboardProps}
          style={[
            styles.input,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
          placeholder="Example: Win the week by studying 5 nights"
          placeholderTextColor={colors.subtle}
          value={weeklyFocusGoal}
          onChangeText={setWeeklyFocusGoal}
        />
        <Text style={[styles.profileHint, { color: colors.subtle }]}>
          This shows on Today so your week has one visible target.
        </Text>

        <Text style={[styles.inputLabel, { color: colors.subtle }]}>
          Companion Nickname
        </Text>
        <TextInput
          {...doneKeyboardProps}
          style={[
            styles.input,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
          placeholder={`Rename ${rewardData.activePet.name} if you want`}
          placeholderTextColor={colors.subtle}
          value={petNickname}
          onChangeText={setPetNickname}
        />

        <TouchableOpacity
          style={[
            styles.primaryButton,
            { backgroundColor: profileDirty ? colors.tint : colors.border },
          ]}
          onPress={handleSaveProfile}
          disabled={!profileDirty || profileSaving}
        >
          <Text style={styles.primaryButtonText}>
            {profileSaving ? "Saving..." : "Save Profile"}
          </Text>
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, shadowColor: colors.tint },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>
          Feel & Feedback
        </Text>
        <Text style={[styles.noteText, { color: colors.text }]}>
          Tune the satisfying parts of the app: completion sounds, focus music,
          and phone vibrations.
        </Text>

        <View style={styles.settingRows}>
          {[
            {
              label: "Sound effects",
              value: profile.soundEnabled !== false,
              updates: { soundEnabled: profile.soundEnabled === false },
            },
            {
              label: "Calm focus music",
              value: profile.calmFocusMusicEnabled !== false,
              updates: {
                calmFocusMusicEnabled:
                  profile.calmFocusMusicEnabled === false,
              },
            },
            {
              label: "Phone vibrations",
              value: profile.hapticsEnabled !== false,
              updates: { hapticsEnabled: profile.hapticsEnabled === false },
            },
          ].map((item) => (
            <View
              key={item.label}
              style={[
                styles.settingToggleRow,
                { borderBottomColor: colors.border },
              ]}
            >
              <Text style={[styles.settingToggleLabel, { color: colors.text }]}>
                {item.label}
              </Text>
              <TouchableOpacity
                style={[
                  styles.settingToggleButton,
                  {
                    backgroundColor: item.value ? colors.tint : colors.surface,
                    borderColor: item.value ? colors.tint : colors.border,
                  },
                ]}
                onPress={async () => {
                  await saveProfile(item.updates);
                  await playSelectionFeedback(profile);
                }}
              >
                <Text
                  style={[
                    styles.settingToggleText,
                    { color: item.value ? "#fff" : colors.subtle },
                  ]}
                >
                  {item.value ? "On" : "Off"}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, shadowColor: colors.tint },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>
          Discipline Pro Preview
        </Text>
        <Text style={[styles.noteText, { color: colors.text }]}>
          A mock subscription layer for demos: it lets you show what could be
          paid later without blocking any tester from using the core app.
        </Text>
        <View
          style={[
            styles.proPreviewPanel,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          <View style={styles.securityHeaderCopy}>
            <Text style={[styles.emptySettingsTitle, { color: colors.text }]}>
              {profile.proPreviewEnabled
                ? "Pro Preview Enabled"
                : "Free Tester Mode"}
            </Text>
            <Text style={[styles.emptySettingsText, { color: colors.subtle }]}>
              Pro preview unlocks labels for AI memory, advanced challenges,
              calendar pull-sync, and accountability proof tools.
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.inlineActionButton,
              {
                backgroundColor: profile.proPreviewEnabled
                  ? colors.surface
                  : colors.tint,
                borderColor: colors.border,
              },
            ]}
            onPress={async () => {
              await saveProfile({
                proPreviewEnabled: profile.proPreviewEnabled !== true,
              });
              await playSelectionFeedback(profile);
            }}
            accessibilityRole="button"
            accessibilityLabel="Toggle Discipline Pro preview mode"
          >
            <Text
              style={[
                styles.inlineActionText,
                { color: profile.proPreviewEnabled ? colors.text : "#fff" },
              ]}
            >
              {profile.proPreviewEnabled ? "Turn Off" : "Try Pro"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, shadowColor: colors.tint },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>Themes</Text>
        <Text style={[styles.noteText, { color: colors.text }]}>
          Choose a look that matches how you want the app to feel today.
        </Text>
        <AppDropdown
          label="Theme"
          value={themeName}
          options={themeDropdownOptions}
          colors={colors}
          onChange={setThemeName}
        />
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, shadowColor: colors.tint },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>
          Reward System
        </Text>
        <View style={styles.statRow}>
          <View
            style={[
              styles.statCard,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.statNumber, { color: colors.text }]}>
              {rewardData.totalXp}
            </Text>
            <Text style={[styles.statLabel, { color: colors.subtle }]}>XP</Text>
          </View>
          <View
            style={[
              styles.statCard,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.statNumber, { color: colors.text }]}>
              {rewardData.levelData.level}
            </Text>
            <Text style={[styles.statLabel, { color: colors.subtle }]}>
              Level
            </Text>
          </View>
          <View
            style={[
              styles.statCard,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.statNumber, { color: colors.text }]}>
              {rewardData.completedTasks}
            </Text>
            <Text style={[styles.statLabel, { color: colors.subtle }]}>Done</Text>
          </View>
        </View>

        <View
          style={[
            styles.progressTrack,
            { backgroundColor: colors.border, marginTop: 4 },
          ]}
        >
          <View
            style={[
              styles.progressFill,
              {
                width: `${rewardData.petProgress.progressPercent}%`,
                backgroundColor: colors.tint,
              },
            ]}
          />
        </View>

        <Text
          style={[styles.profileHint, { color: colors.subtle, marginTop: 10 }]}
        >
          {rewardData.petProgress.nextPet
            ? `${rewardData.petProgress.remainingXp} XP until ${rewardData.petProgress.nextPet.name}`
            : "Every companion is unlocked."}
        </Text>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, shadowColor: colors.tint },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>Routine Intelligence</Text>
        <Text style={[styles.noteText, { color: colors.text }]}>
          The app watches recurring tasks for friction so routines feel adaptive,
          not robotic.
        </Text>
        {routineInsights.length > 0 ? (
          routineInsights.map((insight) => (
            <View
              key={insight.id}
              style={[
                styles.insightRow,
                { backgroundColor: colors.background, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.insightTitle, { color: colors.text }]}>
                {insight.title}
              </Text>
              <Text style={[styles.insightBody, { color: colors.subtle }]}>
                {insight.message}
              </Text>
            </View>
          ))
        ) : (
          <View
            style={[
              styles.emptySettingsCard,
              { backgroundColor: colors.background, borderColor: colors.success },
            ]}
          >
            <Text style={[styles.emptySettingsTitle, { color: colors.text }]}>Routines look stable</Text>
            <Text style={[styles.emptySettingsText, { color: colors.subtle }]}>
              No high-friction recurring tasks detected yet. Keep completing or
              skipping honestly so the coach has real signal.
            </Text>
          </View>
        )}
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, shadowColor: colors.tint },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>
          Routine Manager
        </Text>
        <Text style={[styles.noteText, { color: colors.text }]}>
          See ongoing plans in one place. Cancel a routine like &quot;gym
          every day except Sunday&quot; without deleting completed history.
        </Text>

        <View
          style={[
            styles.routineManagerPanel,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          <View style={styles.routineManagerStats}>
            {[
              { label: "Active", value: routineManagerSummary.active },
              { label: "Needs Tune", value: routineManagerSummary.needsAttention },
              { label: "Upcoming", value: routineManagerSummary.nextSevenDays },
            ].map((item) => (
              <View key={item.label} style={styles.routineManagerStat}>
                <Text style={[styles.routineManagerValue, { color: colors.text }]}>
                  {item.value}
                </Text>
                <Text style={[styles.routineManagerLabel, { color: colors.subtle }]}>
                  {item.label}
                </Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.tint }]}
            onPress={repairRollingRoutines}
            disabled={routineManagerBusy || routineGroups.length === 0}
            accessibilityRole="button"
            accessibilityLabel="Refill rolling routine tasks"
          >
            <Text style={styles.primaryButtonText}>
              {routineManagerBusy ? "Checking routines..." : "Refill / Repair Routines"}
            </Text>
          </TouchableOpacity>
        </View>

        {routineGroups.length > 0 ? (
          routineGroups.map((routine) => {
            const coach = routineCoachById[routine.id];
            const coachBusy = routineCoachBusyId === routine.id;

            return (
              <View
                key={routine.id}
                style={[
                  styles.routineRow,
                  { backgroundColor: colors.background, borderColor: colors.border },
                ]}
              >
                <View style={styles.routineTopRow}>
                  <View style={styles.routineCopy}>
                    <Text style={[styles.routineTitle, { color: colors.text }]}>
                      {routine.title}
                    </Text>
                    <Text style={[styles.routineMeta, { color: colors.subtle }]}>
                      {formatRecurrenceLabel(
                        routine.recurrence,
                        routine.recurrenceDays
                      )}{" "}
                      at {routine.time} · next{" "}
                      {getRelativeDateLabel(routine.nextDate)}
                    </Text>
                <Text style={[styles.routineMeta, { color: colors.subtle }]}>
                  {routine.activeCount} open · {routine.completedCount} done ·{" "}
                  {routine.skippedCount} skipped · refills ahead
                </Text>
                <Text style={[styles.routineMeta, { color: colors.subtle }]}>
                  Current streak {routine.currentStreak} · best streak{" "}
                  {routine.bestStreak} · last 7 rate{" "}
                  {routine.recentCompletionRate}%
                </Text>
                {routine.upcomingDates.length > 0 && (
                  <View style={styles.routineUpcomingRow}>
                    {routine.upcomingDates.map((dateKey) => (
                      <View
                        key={`${routine.id}-${dateKey}`}
                        style={[
                          styles.routineUpcomingPill,
                          { backgroundColor: colors.surface, borderColor: colors.border },
                        ]}
                      >
                        <Text style={[styles.routineUpcomingText, { color: colors.subtle }]}>
                          {getRelativeDateLabel(dateKey)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

                  <View
                    style={[
                      styles.routineHealthPill,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.routineHealthScore, { color: colors.text }]}>
                      {routine.healthScore}%
                    </Text>
                    <Text style={[styles.routineHealthLabel, { color: colors.subtle }]}>
                      {routine.healthLabel}
                    </Text>
                  </View>
                </View>

                {coach ? (
                  <View
                    style={[
                      styles.routineCoachCard,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.routineCoachTitle, { color: colors.text }]}>
                      {coach.headline}
                    </Text>
                    <Text style={[styles.routineCoachBody, { color: colors.subtle }]}>
                      {coach.message}
                    </Text>
                    {coach.suggestions.map((suggestion) => (
                      <Text
                        key={suggestion}
                        style={[styles.routineCoachBullet, { color: colors.subtle }]}
                      >
                        {suggestion}
                      </Text>
                    ))}
                    <Text style={[styles.routineCoachSource, { color: colors.subtle }]}>
                      {coach.source === "openai" || coach.source === "gemini"
                        ? "AI coach"
                        : "Local coach"}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.routineActionRow}>
                  <TouchableOpacity
                    style={[
                      styles.routineActionButton,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                    onPress={() => loadRoutineCoach(routine)}
                    disabled={coachBusy}
                  >
                    <Text style={[styles.routineActionText, { color: colors.tint }]}>
                      {coachBusy ? "Coaching..." : "Coach"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.routineActionButton,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                    onPress={() => openRoutineEditor(routine)}
                  >
                    <Text style={[styles.routineActionText, { color: colors.text }]}>
                      Edit
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.routineActionButton,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                    onPress={() => skipNextRoutineOccurrence(routine)}
                  >
                    <Text style={[styles.routineActionText, { color: colors.warning }]}>
                      Skip Next
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.routineActionButton,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                    onPress={() => pauseRoutineForWeek(routine)}
                  >
                    <Text style={[styles.routineActionText, { color: colors.subtle }]}>
                      Pause 7d
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.routineActionButton,
                      { backgroundColor: colors.surface, borderColor: colors.warning },
                    ]}
                    onPress={() => confirmEndRoutine(routine)}
                  >
                    <Text style={[styles.routineActionText, { color: colors.warning }]}>
                      Delete
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        ) : (
          <View
            style={[
              styles.emptySettingsCard,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.emptySettingsTitle, { color: colors.text }]}>
              No active routines yet
            </Text>
            <Text style={[styles.emptySettingsText, { color: colors.subtle }]}>
              Add something like &quot;Gym at 6 PM every day&quot; and it will
              show up here.
            </Text>
            <TouchableOpacity
              style={[styles.inlineActionButton, { backgroundColor: colors.tint }]}
              onPress={() => router.push("/(tabs)/explore" as never)}
            >
              <Text style={styles.inlineActionText}>Create Routine</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, shadowColor: colors.tint },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>
          Companion Collection
        </Text>
        <View style={styles.petGrid}>
          {PET_TIERS.map((pet) => {
            const isUnlocked = rewardData.totalXp >= pet.unlockXp;
            const isActive = rewardData.activePet.key === pet.key;

            return (
              <TouchableOpacity
                key={pet.key}
                style={[
                  styles.petCard,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    opacity: isUnlocked ? 1 : 0.45,
                  },
                  isActive && {
                    borderColor: colors.tint,
                    backgroundColor: colors.surface,
                  },
                ]}
                onPress={() => {
                  if (isUnlocked) {
                    saveProfile({ activePetKey: pet.key });
                    setPetNickname(
                      getPetNickname(
                        pet.key,
                        profile.petNicknames,
                        profile.petNickname
                      )
                    );
                    setStatusTone("success");
                    setStatusMessage(
                      `${pet.name} is now your active companion.`
                    );
                  }
                }}
                disabled={!isUnlocked}
              >
                <PetSprite
                  petKey={pet.key}
                  size={58}
                  style={styles.petCardSprite}
                />
                <Text style={[styles.petCardName, { color: colors.text }]}>
                  {getPetDisplayName(
                    pet,
                    profile.petNicknames,
                    profile.petNickname
                  )}
                </Text>
                <Text style={[styles.petCardMeta, { color: colors.subtle }]}>
                  {isUnlocked
                    ? isActive
                      ? "Active"
                      : "Unlocked"
                    : `${pet.unlockXp} XP`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, shadowColor: colors.tint },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>
          Notifications
        </Text>
        <Text style={[styles.noteText, { color: colors.text }]}>
          Use these tools after changing lots of tasks or if you want to confirm
          reminders are still healthy on-device.
        </Text>

        {notificationAudit && (
          <View
            style={[
              styles.auditCard,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <View style={styles.auditHeader}>
              <View>
                <Text style={[styles.auditTitle, { color: colors.text }]}>
                  Reminder Health
                </Text>
                <Text style={[styles.auditSubtitle, { color: colors.subtle }]}>
                  {notificationAudit.duplicateCount === 0
                    ? "No duplicate reminders detected."
                    : `${notificationAudit.duplicateCount} duplicate reminder${
                        notificationAudit.duplicateCount === 1 ? "" : "s"
                      } detected.`}
                </Text>
              </View>
              <View
                style={[
                  styles.auditPill,
                  {
                    backgroundColor:
                      notificationAudit.duplicateCount === 0
                        ? colors.success
                        : colors.warning,
                  },
                ]}
              >
                <Text style={styles.auditPillText}>
                  {notificationAudit.total} total
                </Text>
              </View>
            </View>

            <View style={styles.auditStats}>
              <Text style={[styles.auditStatText, { color: colors.subtle }]}>
                Tasks {notificationAudit.taskReminderCount}
              </Text>
              <Text style={[styles.auditStatText, { color: colors.subtle }]}>
                Follow-ups {notificationAudit.missedFollowUpCount}
              </Text>
              <Text style={[styles.auditStatText, { color: colors.subtle }]}>
                Base{" "}
                {notificationAudit.morningSummaryCount +
                  notificationAudit.eveningReminderCount}
              </Text>
            </View>

            {notificationAudit.nextNotifications.length > 0 && (
              <View style={styles.auditUpcoming}>
                {notificationAudit.nextNotifications.slice(0, 3).map((item, index) => (
                  <Text
                    key={`${item.id}-${item.kind}-${index}`}
                    style={[styles.auditUpcomingText, { color: colors.subtle }]}
                    numberOfLines={1}
                  >
                    {item.title} · {item.kind}
                  </Text>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={styles.settingRows}>
          {[
            {
              label: "Task reminders",
              value: notificationSettings.taskRemindersEnabled,
              keyName: "taskRemindersEnabled" as const,
            },
            {
              label: "Missed task follow-up",
              value: notificationSettings.missedFollowUpEnabled,
              keyName: "missedFollowUpEnabled" as const,
            },
            {
              label: "Morning summary",
              value: notificationSettings.morningSummaryEnabled,
              keyName: "morningSummaryEnabled" as const,
            },
            {
              label: "Evening planning reminder",
              value: notificationSettings.eveningReminderEnabled,
              keyName: "eveningReminderEnabled" as const,
            },
          ].map((item) => (
            <View
              key={item.keyName}
              style={[
                styles.settingToggleRow,
                { borderBottomColor: colors.border },
              ]}
            >
              <Text style={[styles.settingToggleLabel, { color: colors.text }]}>
                {item.label}
              </Text>
              <TouchableOpacity
                style={[
                  styles.settingToggleButton,
                  {
                    backgroundColor: item.value ? colors.tint : colors.surface,
                    borderColor: item.value ? colors.tint : colors.border,
                  },
                ]}
                onPress={() =>
                  updateNotificationSettings({ [item.keyName]: !item.value })
                }
                disabled={remindersBusy}
              >
                <Text
                  style={[
                    styles.settingToggleText,
                    { color: item.value ? "#fff" : colors.subtle },
                  ]}
                >
                  {item.value ? "On" : "Off"}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <Text style={[styles.inputLabel, { color: colors.subtle }]}>
          Morning Summary Time
        </Text>
        <AppDropdown
          value={notificationSettings.morningSummaryTime}
          options={morningTimeDropdownOptions}
          colors={colors}
          disabled={remindersBusy}
          onChange={(time) =>
            updateNotificationSettings({ morningSummaryTime: time })
          }
        />

        <Text style={[styles.inputLabel, { color: colors.subtle }]}>
          Evening Planning Time
        </Text>
        <AppDropdown
          value={notificationSettings.eveningReminderTime}
          options={eveningTimeDropdownOptions}
          colors={colors}
          disabled={remindersBusy}
          onChange={(time) =>
            updateNotificationSettings({ eveningReminderTime: time })
          }
        />

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.secondaryButton, { backgroundColor: colors.surface }]}
            onPress={handleRefreshReminders}
            disabled={remindersBusy}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
              {remindersBusy ? "Working..." : "Refresh & Clean"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, { backgroundColor: colors.surface }]}
            onPress={handleTestReminder}
            disabled={remindersBusy}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
              Test Ping
            </Text>
          </TouchableOpacity>
        </View>

        {statusMessage ? (
          <Text style={[styles.statusText, { color: statusColor }]}>
            {statusMessage}
          </Text>
        ) : null}
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, shadowColor: colors.tint },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>
          Tester Feedback
        </Text>
        <Text style={[styles.noteText, { color: colors.text }]}>
          Send bugs, confusing moments, or ideas straight into Firestore while
          testing.
        </Text>

        <AppDropdown
          label="Feedback Type"
          value={feedbackType}
          options={feedbackTypeOptions}
          colors={colors}
          onChange={setFeedbackType}
        />

        <TextInput
          {...doneKeyboardProps}
          style={[
            styles.feedbackInput,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
          placeholder="What should I fix, improve, or keep?"
          placeholderTextColor={colors.subtle}
          value={feedbackText}
          onChangeText={setFeedbackText}
          multiline
        />

        <TouchableOpacity
          style={[
            styles.primaryButton,
            {
              backgroundColor:
                feedbackText.trim() && !feedbackBusy ? colors.tint : colors.border,
            },
          ]}
          onPress={submitFeedback}
          disabled={!feedbackText.trim() || feedbackBusy}
        >
          <Text style={styles.primaryButtonText}>
            {feedbackBusy ? "Sending..." : "Send Feedback"}
          </Text>
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, shadowColor: colors.tint },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>
          Feedback Dashboard
        </Text>
        <Text style={[styles.noteText, { color: colors.text }]}>
          Recent tester notes from this account, useful when someone is showing
          you a bug on their phone.
        </Text>
        {recentFeedback.length > 0 ? (
          recentFeedback.map((item) => (
            <View
              key={item.id}
              style={[
                styles.diagnosticRow,
                { backgroundColor: colors.background, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.diagnosticTitle, { color: colors.text }]}>
                {item.type ?? "Feedback"} · {formatTimestampLabel(item.createdAt)}
              </Text>
              <Text style={[styles.diagnosticBody, { color: colors.subtle }]}>
                {item.message ?? "No message saved."}
              </Text>
            </View>
          ))
        ) : (
          <View
            style={[
              styles.emptySettingsCard,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.emptySettingsTitle, { color: colors.text }]}>
              No feedback yet
            </Text>
            <Text style={[styles.emptySettingsText, { color: colors.subtle }]}>
              Tester notes submitted above will appear here instantly.
            </Text>
          </View>
        )}
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, shadowColor: colors.tint },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>
          Diagnostics
        </Text>
        <Text style={[styles.noteText, { color: colors.text }]}>
          Crash-style reports caught by the in-app error boundary and manual
          reporters. Quiet diagnostics are a good sign before a bigger test.
        </Text>
        {diagnosticsLoading ? (
          ["Loading diagnostics", "Checking feedback"].map((label) => (
            <View
              key={label}
              style={[
                styles.skeletonRow,
                { backgroundColor: colors.background, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.diagnosticTitle, { color: colors.subtle }]}>
                {label}...
              </Text>
            </View>
          ))
        ) : appErrors.length > 0 ? (
          appErrors.map((item) => (
            <View
              key={item.id}
              style={[
                styles.diagnosticRow,
                { backgroundColor: colors.background, borderColor: colors.warning },
              ]}
            >
              <Text style={[styles.diagnosticTitle, { color: colors.text }]}>
                {item.source ?? "App"} · {formatTimestampLabel(item.createdAt)}
              </Text>
              <Text style={[styles.diagnosticBody, { color: colors.subtle }]}>
                {item.message ?? item.name ?? "Unknown error"}
              </Text>
            </View>
          ))
        ) : (
          <View
            style={[
              styles.emptySettingsCard,
              { backgroundColor: colors.background, borderColor: colors.success },
            ]}
          >
            <Text style={[styles.emptySettingsTitle, { color: colors.text }]}>
              No recent app errors
            </Text>
            <Text style={[styles.emptySettingsText, { color: colors.subtle }]}>
              Nice. This account has no recent diagnostic reports.
            </Text>
          </View>
        )}
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.danger,
            shadowColor: colors.danger,
          },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.danger }]}>
          Tester Data Controls
        </Text>
        <Text style={[styles.noteText, { color: colors.text }]}>
          Use these when a tester wants a clean start or wants their account
          removed.
        </Text>

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.tint }]}
          onPress={loadDemoDay}
          disabled={dangerBusy}
        >
          <Text style={styles.primaryButtonText}>
            {dangerBusy ? "Working..." : "Load Demo Day"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.dangerOutlineButton,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
          onPress={shareDataExport}
          disabled={dangerBusy}
        >
          <Text style={[styles.dangerOutlineText, { color: colors.text }]}>
            {dangerBusy ? "Working..." : "Export My Data"}
          </Text>
        </TouchableOpacity>

        {dataExportSummary ? (
          <Text style={[styles.profileHint, { color: colors.subtle }]}>
            {dataExportSummary}
          </Text>
        ) : null}

        <TouchableOpacity
          style={[
            styles.dangerOutlineButton,
            { backgroundColor: colors.surface, borderColor: colors.warning },
          ]}
          onPress={confirmResetData}
          disabled={dangerBusy}
        >
          <Text style={[styles.dangerOutlineText, { color: colors.warning }]}>
            {dangerBusy ? "Working..." : "Reset App Data"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dangerSolidButton, { backgroundColor: colors.danger }]}
          onPress={confirmDeleteAccount}
          disabled={dangerBusy}
        >
          <Text style={styles.dangerSolidText}>
            {dangerBusy ? "Working..." : "Delete Account"}
          </Text>
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, shadowColor: colors.tint },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>
          App Details
        </Text>
        <Text style={[styles.noteText, { color: colors.text }]}>
          {appName} v{appVersion}
        </Text>
        <Text style={[styles.noteText, { color: colors.text }]}>
          Theme: {ThemeLabels[themeName]} • Focus preset:{" "}
          {profile.focusDurationMinutes ?? 25} minutes
        </Text>
        <Text style={[styles.noteText, { color: colors.text }]}>
          Recurring tasks support editing or deleting this task only, or this
          task and future repeats. Privacy controls include analytics and
          diagnostic opt-outs for tester builds.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.logoutButton, { backgroundColor: colors.danger }]}
        onPress={() => signOut(auth)}
      >
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>

      <Modal
        visible={!!editingRoutine}
        animationType="fade"
        transparent
        onRequestClose={() => setEditingRoutine(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Edit Routine
            </Text>
            <Text style={[styles.modalBody, { color: colors.subtle }]}>
              Update the routine name and time. This applies to the active loop
              and its history so the routine stays connected.
            </Text>

            <TextInput
              {...doneKeyboardProps}
              style={[
                styles.modalInput,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              placeholder="Routine title"
              placeholderTextColor={colors.subtle}
              value={editRoutineTitle}
              onChangeText={setEditRoutineTitle}
            />
            <TextInput
              {...doneKeyboardProps}
              style={[
                styles.modalInput,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              placeholder="6:00 PM"
              placeholderTextColor={colors.subtle}
              value={editRoutineTime}
              onChangeText={setEditRoutineTime}
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={[
                  styles.secondaryButton,
                  { backgroundColor: colors.surface },
                ]}
                onPress={() => setEditingRoutine(null)}
              >
                <Text style={[styles.secondaryButtonText, { color: colors.subtle }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryButton, { backgroundColor: colors.tint }]}
                onPress={saveRoutineEdits}
              >
                <Text style={[styles.secondaryButtonText, { color: "#fff" }]}>
                  Save Routine
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    paddingBottom: 130,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  headerBadge: {
    borderWidth: 1,
    borderRadius: 20,
    minWidth: 82,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  headerBadgeValue: {
    fontSize: 25,
    fontWeight: "900",
    lineHeight: 28,
  },
  headerBadgeLabel: {
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2,
    textTransform: "uppercase",
  },
  backText: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 14,
  },
  title: {
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -0.7,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
  },
  card: {
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  profileText: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 6,
  },
  profileHint: {
    fontSize: 13,
    lineHeight: 19,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
  },
  largeTextInput: {
    minHeight: 86,
    lineHeight: 20,
    textAlignVertical: "top",
  },
  primaryButton: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 16,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  themeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 2,
  },
  themeOption: {
    width: "48%",
    minHeight: 108,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
    justifyContent: "space-between",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 2,
  },
  themePreview: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  themeSwatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    marginRight: -3,
  },
  themeLabel: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
  },
  selectedText: {
    alignSelf: "flex-start",
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: "800",
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginHorizontal: 4,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
  },
  petGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  petCard: {
    width: "48%",
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  petCardSprite: {
    marginBottom: 10,
  },
  petCardName: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  petCardMeta: {
    fontSize: 12,
    fontWeight: "600",
  },
  noteText: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 10,
  },
  checklistRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 9,
  },
  checklistDot: {
    fontSize: 18,
    fontWeight: "900",
    marginRight: 9,
    lineHeight: 20,
  },
  checklistText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },
  aiHealthHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  aiHealthCopy: {
    flex: 1,
    paddingRight: 12,
  },
  inlineRefreshButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  inlineRefreshText: {
    fontSize: 12,
    fontWeight: "900",
  },
  aiHealthPanel: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginTop: 8,
  },
  aiHealthTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  aiHealthTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
    paddingRight: 10,
  },
  aiHealthBadge: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  aiHealthBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  aiHealthMeta: {
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 8,
  },
  feedbackTypeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
    marginTop: 4,
    marginBottom: 10,
  },
  feedbackTypeChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 4,
    marginBottom: 8,
  },
  feedbackTypeText: {
    fontSize: 12,
    fontWeight: "900",
  },
  feedbackInput: {
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 104,
    padding: 14,
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: "top",
  },
  dangerOutlineButton: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  dangerOutlineText: {
    fontSize: 14,
    fontWeight: "900",
  },
  dangerSolidButton: {
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 10,
  },
  dangerSolidText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },
  routineRow: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginTop: 10,
  },
  routineTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  routineCopy: {
    flex: 1,
    paddingRight: 12,
  },
  routineTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
  },
  routineMeta: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
  },
  routineUpcomingRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 9,
    marginHorizontal: -3,
  },
  routineUpcomingPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginHorizontal: 3,
    marginBottom: 5,
  },
  routineUpcomingText: {
    fontSize: 10,
    fontWeight: "900",
  },
  routineHealthPill: {
    borderWidth: 1,
    borderRadius: 16,
    minWidth: 78,
    paddingHorizontal: 10,
    paddingVertical: 9,
    alignItems: "center",
  },
  routineHealthScore: {
    fontSize: 18,
    fontWeight: "900",
  },
  routineHealthLabel: {
    fontSize: 10,
    fontWeight: "900",
    marginTop: 2,
    textTransform: "uppercase",
  },
  routineCoachCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginTop: 12,
  },
  routineCoachTitle: {
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 4,
  },
  routineCoachBody: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 6,
  },
  routineCoachBullet: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  routineCoachSource: {
    fontSize: 10,
    fontWeight: "900",
    marginTop: 8,
    textTransform: "uppercase",
  },
  routineActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
    marginTop: 12,
  },
  routineActionButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
    marginHorizontal: 4,
    marginBottom: 8,
  },
  routineActionText: {
    fontSize: 12,
    fontWeight: "900",
  },
  routineManagerPanel: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginTop: 12,
    marginBottom: 12,
  },
  routineManagerStats: {
    flexDirection: "row",
    marginHorizontal: -5,
    marginBottom: 12,
  },
  routineManagerStat: {
    flex: 1,
    alignItems: "center",
    marginHorizontal: 5,
  },
  routineManagerValue: {
    fontSize: 20,
    fontWeight: "900",
  },
  routineManagerLabel: {
    fontSize: 10,
    fontWeight: "900",
    marginTop: 3,
    textTransform: "uppercase",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.46)",
    justifyContent: "center",
    padding: 22,
  },
  modalCard: {
    borderRadius: 24,
    padding: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 8,
  },
  modalBody: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 10,
  },
  modalActionRow: {
    flexDirection: "row",
    marginHorizontal: -4,
    marginTop: 6,
  },
  emptySettingsCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginTop: 10,
  },
  emptySettingsTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 6,
  },
  emptySettingsText: {
    fontSize: 13,
    lineHeight: 19,
  },
  offlineQueuePanel: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  proPreviewPanel: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  inlineActionButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginTop: 12,
    marginRight: 8,
  },
  inlineActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  inlineActionText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  securityPanel: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginTop: 12,
  },
  securityHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  securityHeaderCopy: {
    flex: 1,
    paddingRight: 10,
  },
  securityLabel: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  securityValue: {
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
  },
  secretBox: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginTop: 12,
  },
  secretText: {
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.5,
    lineHeight: 22,
  },
  secretHint: {
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
    marginTop: 8,
  },
  factorRow: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  auditCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginTop: 12,
    marginBottom: 8,
  },
  auditHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  auditTitle: {
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 4,
  },
  auditSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    maxWidth: 210,
  },
  auditPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  auditPillText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
  },
  auditStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
  },
  auditStatText: {
    fontSize: 12,
    fontWeight: "800",
    marginRight: 12,
    marginBottom: 4,
  },
  auditUpcoming: {
    marginTop: 8,
  },
  auditUpcomingText: {
    fontSize: 12,
    lineHeight: 18,
  },
  settingRows: {
    marginTop: 8,
  },
  settingToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
  },
  settingToggleLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    marginRight: 12,
  },
  settingToggleButton: {
    borderWidth: 1,
    borderRadius: 999,
    minWidth: 58,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: "center",
  },
  settingToggleText: {
    fontSize: 12,
    fontWeight: "900",
  },
  timeChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
    marginBottom: 4,
  },
  timeChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 4,
    marginBottom: 8,
  },
  timeChipText: {
    fontSize: 12,
    fontWeight: "800",
  },
  buttonRow: {
    flexDirection: "row",
    marginTop: 8,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginHorizontal: 4,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
  statusText: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 14,
    fontWeight: "600",
  },
  logoutButton: {
    marginHorizontal: 16,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  logoutText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  releaseScorePanel: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginTop: 10,
    marginBottom: 4,
  },
  releaseScoreText: {
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 10,
  },
  checklistCopy: {
    flex: 1,
  },
  checklistDetail: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
    marginTop: 2,
  },
  insightRow: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 13,
    marginTop: 10,
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 4,
  },
  insightBody: {
    fontSize: 12,
    lineHeight: 18,
  },
  diagnosticRow: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 13,
    marginTop: 10,
  },
  diagnosticTitle: {
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 4,
  },
  diagnosticBody: {
    fontSize: 12,
    lineHeight: 18,
  },
  skeletonRow: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 13,
    marginTop: 10,
    opacity: 0.72,
  },
  bottomSpacer: {
    height: 18,
  },
});
