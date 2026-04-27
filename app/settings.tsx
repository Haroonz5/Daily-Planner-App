import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { themeOptions, useAppTheme } from "@/constants/appTheme";
import { PetSprite } from "@/components/pet-sprite";
import {
  getActivePet,
  getPetProgress,
  getTaskXp,
  getUnlockedPets,
  PET_TIERS,
  type Priority,
} from "@/constants/rewards";
import { Colors, ThemeLabels } from "@/constants/theme";
import { useUserProfile } from "@/hooks/use-user-profile";
import { auth, db } from "../constants/firebaseConfig";

type TaskStatus = "pending" | "completed" | "skipped";

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

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const unsubscribe = onSnapshot(collection(db, "users", uid, "tasks"), (snap) => {
      const fetched = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Task[];

      setTasks(fetched);
    });

    return unsubscribe;
  }, []);

  const rewardData = useMemo(() => {
    const totalXp = tasks.reduce((sum, task) => sum + getTaskXp(task), 0);
    const activePet = getActivePet(totalXp, profile.activePetKey);
    const unlockedPets = getUnlockedPets(totalXp);
    const petProgress = getPetProgress(totalXp);

    return { totalXp, activePet, unlockedPets, petProgress };
  }, [profile.activePetKey, tasks]);

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
          Personalize the app and keep your discipline system feeling like yours.
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.tint }]}>
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>Profile</Text>
        <Text style={[styles.profileText, { color: colors.text }]}>
          {auth.currentUser?.email ?? "Signed in"}
        </Text>
        <Text style={[styles.profileHint, { color: colors.subtle }]}>
          Active companion: {rewardData.activePet.name}
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.tint }]}>
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
                selected && { borderColor: colors.tint, backgroundColor: colors.surface },
              ]}
              onPress={() => setThemeName(theme)}
            >
              <View style={styles.themePreview}>
                <View
                  style={[
                    styles.themeSwatch,
                    { backgroundColor: preview.background, borderColor: preview.border },
                  ]}
                />
                <View
                  style={[
                    styles.themeSwatch,
                    { backgroundColor: preview.card, borderColor: preview.border },
                  ]}
                />
                <View
                  style={[
                    styles.themeSwatch,
                    { backgroundColor: preview.tint, borderColor: preview.tint },
                  ]}
                />
              </View>

              <Text style={[styles.themeLabel, { color: colors.text }]}>
                {ThemeLabels[theme]}
              </Text>

              {selected && (
                <Text style={[styles.selectedText, { color: colors.tint }]}>Active</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.tint }]}>
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>Companions</Text>
        <Text style={[styles.profileHint, { color: colors.subtle }]}>
          {rewardData.unlockedPets.length} of {PET_TIERS.length} unlocked • {rewardData.totalXp} XP
        </Text>

        {rewardData.unlockedPets.map((pet) => {
          const isActive = rewardData.activePet.key === pet.key;

          return (
            <TouchableOpacity
              key={pet.key}
              style={[
                styles.petRow,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                },
                isActive && { borderColor: colors.tint, backgroundColor: colors.surface },
              ]}
              onPress={() => saveProfile({ activePetKey: pet.key })}
            >
              <PetSprite petKey={pet.key} size={56} style={styles.petSprite} />
              <View style={styles.petCopy}>
                <Text style={[styles.petName, { color: colors.text }]}>{pet.name}</Text>
                <Text style={[styles.petDescription, { color: colors.subtle }]}>
                  {pet.description}
                </Text>
              </View>
              {isActive ? (
                <Text style={[styles.selectedText, { color: colors.tint }]}>Active</Text>
              ) : null}
            </TouchableOpacity>
          );
        })}

        {rewardData.petProgress.nextPet && (
          <View
            style={[
              styles.lockedHint,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.profileHint, { color: colors.subtle }]}>
              Next unlock: {rewardData.petProgress.nextPet.name} in{" "}
              {rewardData.petProgress.remainingXp} XP
            </Text>
          </View>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.tint }]}>
        <Text style={[styles.cardTitle, { color: colors.subtle }]}>App Notes</Text>
        <Text style={[styles.noteText, { color: colors.text }]}>
          Notifications stay strongest when tasks have clean times and your day is not overloaded.
        </Text>
        <Text style={[styles.noteText, { color: colors.text }]}>
          Recurring tasks now create a runway of future tasks so you can plan ahead without re-entering the same work.
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
  petRow: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  petEmoji: {
    fontSize: 30,
    marginRight: 12,
  },
  petSprite: {
    marginRight: 12,
  },
  petCopy: {
    flex: 1,
  },
  petName: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  petDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  lockedHint: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginTop: 12,
  },
  noteText: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 10,
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
