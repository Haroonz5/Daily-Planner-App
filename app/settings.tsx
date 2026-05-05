import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { deleteUser, signOut } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

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
import {
  formatDateKey,
  formatRecurrenceLabel,
  getRelativeDateLabel,
  parseTimeToMinutes,
  type RecurrenceRule,
} from "@/utils/task-helpers";
import {
  getRoutineCoach,
  type RoutineCoachResult,
} from "@/utils/ai";
import {
  playRoutineFeedback,
  playSaveFeedback,
  playSelectionFeedback,
  playWarningFeedback,
} from "@/utils/feedback";
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
};

type SettingsScreenProps = {
  showBackButton?: boolean;
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

export default function SettingsScreen({
  showBackButton = true,
}: SettingsScreenProps) {
  const router = useRouter();
  const { themeName, setThemeName } = useAppTheme();
  const { profile, saveProfile } = useUserProfile();
  const colors = Colors[themeName];

  const [tasks, setTasks] = useState<Task[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [petNickname, setPetNickname] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
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
  const [dangerBusy, setDangerBusy] = useState(false);
  const [routineCoachById, setRoutineCoachById] = useState<
    Record<string, RoutineCoachResult>
  >({});
  const [routineCoachBusyId, setRoutineCoachBusyId] = useState<string | null>(null);
  const [editingRoutine, setEditingRoutine] = useState<RoutineGroup | null>(null);
  const [editRoutineTitle, setEditRoutineTitle] = useState("");
  const [editRoutineTime, setEditRoutineTime] = useState("");
  const today = formatDateKey(new Date());
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

  useEffect(() => {
    setDisplayName(profile.displayName ?? "");
  }, [profile.displayName]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user?.email) return;

    void setDoc(
      doc(db, "publicProfiles", user.uid),
      {
        uid: user.uid,
        email: user.email.toLowerCase(),
        displayName: profile.displayName ?? null,
        updatedAt: new Date(),
      },
      { merge: true }
    ).catch(() => {});
  }, [profile.displayName]);

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
          tasks: sortedTasks,
        };
      })
      .filter((routine) => routine.activeCount > 0)
      .sort((a, b) => {
        if (a.nextDate !== b.nextDate) return a.nextDate.localeCompare(b.nextDate);
        return (parseTimeToMinutes(a.time) ?? 0) - (parseTimeToMinutes(b.time) ?? 0);
      });
  }, [tasks, today]);

  const profileDirty =
    displayName !== (profile.displayName ?? "") ||
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

  const deleteCollectionDocs = async (
    uid: string,
    collectionName: "tasks" | "focusSessions" | "feedback"
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
    setProfileSaving(true);

    try {
      const nextPetNickname = petNickname.trim() || null;
      const nextPetNicknames = {
        ...(profile.petNicknames ?? {}),
        [rewardData.activePet.key]: nextPetNickname,
      };

      await saveProfile({
        displayName: displayName.trim() || null,
        petNickname: nextPetNickname,
        petNicknames: nextPetNicknames,
      });
      let publicProfileSynced = true;
      if (auth.currentUser?.email) {
        await setDoc(
          doc(db, "publicProfiles", auth.currentUser.uid),
          {
            uid: auth.currentUser.uid,
            email: auth.currentUser.email.toLowerCase(),
            displayName: displayName.trim() || null,
            updatedAt: new Date(),
          },
          { merge: true }
        ).catch(() => {
          publicProfileSynced = false;
          setStatusTone("warning");
          setStatusMessage(
            "Profile saved, but friend profile sync needs deployed Firestore rules."
          );
        });
      }
      if (publicProfileSynced) {
        await playSaveFeedback(profile);
        setStatusTone("success");
        setStatusMessage(
          "Profile updated. Your app voice and companion name are saved."
        );
      }
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
          Calendar, Widgets & Lock Screen
        </Text>
        <Text style={[styles.noteText, { color: colors.text }]}>
          The app now writes richer widget summary data, supports Complete and
          Snooze actions from task notifications, and can export individual
          tasks to Google Calendar from the Week Planner.
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
            Full iPhone home-screen widgets and direct Apple Calendar writes
            need a development or production build. Expo Go can still test the
            app-side data, week view, and reminder actions.
          </Text>
          <TouchableOpacity
            style={[styles.inlineActionButton, { backgroundColor: colors.tint }]}
            onPress={() => router.push("/week" as never)}
          >
            <Text style={styles.inlineActionText}>Open Week Planner</Text>
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
          Accountability Friends
        </Text>
        <Text style={[styles.noteText, { color: colors.text }]}>
          Add friends by email so you can see each other&apos;s daily progress
          and send quick check-ins.
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
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>Profile</Text>
        <Text style={[styles.profileText, { color: colors.text }]}>
          {auth.currentUser?.email ?? "Signed in"}
        </Text>
        <Text style={[styles.profileHint, { color: colors.subtle }]}>
          Active companion: {activePetDisplayName}
        </Text>

        <Text style={[styles.inputLabel, { color: colors.subtle }]}>
          Your Name
        </Text>
        <TextInput
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
          Companion Nickname
        </Text>
        <TextInput
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
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>Themes</Text>
        <Text style={[styles.noteText, { color: colors.text }]}>
          Choose a look that matches how you want the app to feel today.
        </Text>
        <View style={styles.themeGrid}>
          {themeOptions.map((theme) => {
            const preview = Colors[theme];
            const selected = themeName === theme;
            const toneLabel =
              preview.navigationTone === "dark" ? "Dark" : "Light";

            return (
              <TouchableOpacity
                key={theme}
                activeOpacity={0.84}
                style={[
                  styles.themeOption,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                  selected && {
                    borderColor: colors.tint,
                    backgroundColor: colors.surface,
                    shadowColor: colors.tint,
                  },
                ]}
                onPress={() => setThemeName(theme)}
              >
                <View style={styles.themePreview}>
                  <View
                    style={[
                      styles.themeSwatch,
                      {
                        backgroundColor: preview.background,
                        borderColor: preview.border,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.themeSwatch,
                      {
                        backgroundColor: preview.card,
                        borderColor: preview.border,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.themeSwatch,
                      {
                        backgroundColor: preview.tint,
                        borderColor: preview.tint,
                      },
                    ]}
                  />
                </View>

                <Text
                  numberOfLines={1}
                  style={[styles.themeLabel, { color: colors.text }]}
                >
                  {ThemeLabels[theme]}
                </Text>

                <Text
                  style={[
                    styles.selectedText,
                    {
                      backgroundColor: selected ? colors.tint : colors.surface,
                      color: selected ? colors.background : colors.subtle,
                    },
                  ]}
                >
                  {selected ? "Active" : toneLabel}
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
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>
          Routine Manager
        </Text>
        <Text style={[styles.noteText, { color: colors.text }]}>
          See ongoing plans in one place. Cancel a routine like &quot;gym
          every day except Sunday&quot; without deleting completed history.
        </Text>

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
                {notificationAudit.nextNotifications.slice(0, 3).map((item) => (
                  <Text
                    key={item.id}
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
        <View style={styles.timeChipRow}>
          {notificationTimeOptions.map((time) => {
            const selected = notificationSettings.morningSummaryTime === time;
            return (
              <TouchableOpacity
                key={`morning-${time}`}
                style={[
                  styles.timeChip,
                  {
                    backgroundColor: selected ? colors.surface : colors.background,
                    borderColor: selected ? colors.tint : colors.border,
                  },
                ]}
                onPress={() =>
                  updateNotificationSettings({ morningSummaryTime: time })
                }
                disabled={remindersBusy}
              >
                <Text style={[styles.timeChipText, { color: colors.text }]}>
                  {time}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.inputLabel, { color: colors.subtle }]}>
          Evening Planning Time
        </Text>
        <View style={styles.timeChipRow}>
          {eveningTimeOptions.map((time) => {
            const selected = notificationSettings.eveningReminderTime === time;
            return (
              <TouchableOpacity
                key={`evening-${time}`}
                style={[
                  styles.timeChip,
                  {
                    backgroundColor: selected ? colors.surface : colors.background,
                    borderColor: selected ? colors.tint : colors.border,
                  },
                ]}
                onPress={() =>
                  updateNotificationSettings({ eveningReminderTime: time })
                }
                disabled={remindersBusy}
              >
                <Text style={[styles.timeChipText, { color: colors.text }]}>
                  {time}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

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

        <View style={styles.feedbackTypeRow}>
          {feedbackTypes.map((type) => {
            const selected = feedbackType === type;
            return (
              <TouchableOpacity
                key={type}
                style={[
                  styles.feedbackTypeChip,
                  {
                    backgroundColor: selected ? colors.tint : colors.background,
                    borderColor: selected ? colors.tint : colors.border,
                  },
                ]}
                onPress={() => setFeedbackType(type)}
              >
                <Text
                  style={[
                    styles.feedbackTypeText,
                    { color: selected ? "#fff" : colors.text },
                  ]}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TextInput
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
          task and future repeats.
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
  inlineActionButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginTop: 12,
  },
  inlineActionText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
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
  bottomSpacer: {
    height: 18,
  },
});
