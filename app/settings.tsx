import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
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
  getLevelData,
  getPetProgress,
  getTaskXp,
  PET_TIERS,
  type Priority,
} from "@/constants/rewards";
import { Colors, ThemeLabels } from "@/constants/theme";
import { useUserProfile } from "@/hooks/use-user-profile";
import {
  refreshNotificationState,
  scheduleQuickTestNotification,
} from "../utils/notifications";
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
};

export default function SettingsScreen() {
  const router = useRouter();
  const { themeName, setThemeName } = useAppTheme();
  const { profile, saveProfile } = useUserProfile();
  const colors = Colors[themeName];

  const [tasks, setTasks] = useState<Task[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [petNickname, setPetNickname] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [remindersBusy, setRemindersBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState<StatusTone>("idle");

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
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    setDisplayName(profile.displayName ?? "");
    setPetNickname(profile.petNickname ?? "");
  }, [profile.displayName, profile.petNickname]);

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

  const profileDirty =
    displayName !== (profile.displayName ?? "") ||
    petNickname !== (profile.petNickname ?? "");

  const statusColor =
    statusTone === "success"
      ? colors.success
      : statusTone === "warning"
        ? colors.warning
        : colors.subtle;

  const appName = Constants.expoConfig?.name ?? "Daily Discipline";
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

  const handleSaveProfile = async () => {
    setProfileSaving(true);

    try {
      await saveProfile({
        displayName: displayName.trim() || null,
        petNickname: petNickname.trim() || null,
      });
      setStatusTone("success");
      setStatusMessage(
        "Profile updated. Your app voice and companion name are saved."
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
      setStatusTone("success");
      setStatusMessage(
        "Reminder schedule refreshed for evening and tomorrow morning."
      );
    } finally {
      setRemindersBusy(false);
    }
  };

  const handleTestReminder = async () => {
    setRemindersBusy(true);

    try {
      const notificationId = await scheduleQuickTestNotification();
      if (notificationId) {
        setStatusTone("success");
        setStatusMessage(
          "Test reminder scheduled for about 5 seconds from now."
        );
      } else {
        setStatusTone("warning");
        setStatusMessage(
          "Notification permission is still off, so the test could not be sent."
        );
      }
    } finally {
      setRemindersBusy(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.backText, { color: colors.tint }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
        <Text style={[styles.subtitle, { color: colors.subtle }]}>
          Personalize the app, check reminders, and keep the system feeling
          owned.
        </Text>
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
          Active companion: {petNickname.trim() || rewardData.activePet.name}
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
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>Themes</Text>
        {themeOptions.map((theme) => {
          const preview = Colors[theme];
          const selected = themeName === theme;

          return (
            <TouchableOpacity
              key={theme}
              style={[
                styles.themeOption,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                },
                selected && {
                  borderColor: colors.tint,
                  backgroundColor: colors.surface,
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

              <Text style={[styles.themeLabel, { color: colors.text }]}>
                {ThemeLabels[theme]}
              </Text>

              {selected ? (
                <Text style={[styles.selectedText, { color: colors.tint }]}>
                  Active
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
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
                  {pet.name}
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

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.secondaryButton, { backgroundColor: colors.surface }]}
            onPress={handleRefreshReminders}
            disabled={remindersBusy}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
              {remindersBusy ? "Working..." : "Refresh Reminders"}
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

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 20,
  },
  backText: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 14,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
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
  themeOption: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  themePreview: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 12,
  },
  themeSwatch: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    marginRight: 6,
  },
  themeLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  selectedText: {
    fontSize: 12,
    fontWeight: "700",
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
});
