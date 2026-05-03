import { useRouter } from "expo-router";
import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { AmbientBackground } from "@/components/ambient-background";
import { PetSprite } from "@/components/pet-sprite";
import { useAppTheme } from "@/constants/appTheme";
import {
  PET_TIERS,
  getActivePet,
  getPetProgress,
  getTaskXp,
  getUnlockedPets,
  type Priority,
} from "@/constants/rewards";
import { Colors } from "@/constants/theme";
import { useUserProfile } from "@/hooks/use-user-profile";
import { formatDateKey } from "@/utils/task-helpers";
import { auth, db } from "../constants/firebaseConfig";

type Task = {
  id: string;
  title: string;
  date: string;
  time: string;
  completed: boolean;
  priority?: Priority;
  status?: "pending" | "completed" | "skipped";
  completedAt?: any;
  rescheduledCount?: number;
  originalTime?: string;
};

export default function PetHomeScreen() {
  const router = useRouter();
  const { themeName } = useAppTheme();
  const { profile, saveProfile } = useUserProfile();
  const colors = Colors[themeName];
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    return onSnapshot(
      collection(db, "users", uid, "tasks"),
      (snap) => {
        setTasks(
          snap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as Task[]
        );
      },
      () => {
        setTasks([]);
      }
    );
  }, []);

  const petData = useMemo(() => {
    const today = formatDateKey(new Date());
    const todayTasks = tasks.filter((task) => task.date === today);
    const totalXp = tasks.reduce((sum, task) => sum + getTaskXp(task), 0);
    const todayXp = todayTasks.reduce((sum, task) => sum + getTaskXp(task), 0);
    const completedToday = todayTasks.filter((task) => task.completed).length;
    const skippedToday = todayTasks.filter(
      (task) => (task.status ?? "pending") === "skipped"
    ).length;
    const activePet = getActivePet(totalXp, profile.activePetKey);
    const petProgress = getPetProgress(totalXp);
    const unlockedPets = getUnlockedPets(totalXp);
    const completionRate = todayTasks.length
      ? Math.round((completedToday / todayTasks.length) * 100)
      : 0;
    const mood =
      todayTasks.length === 0
        ? "Waiting for a mission"
        : skippedToday > 0
          ? "A little concerned"
          : completionRate === 100
            ? "Proud and glowing"
            : completedToday > 0
              ? "Energized"
              : "Ready to start";
    const bondScore = Math.min(
      100,
      Math.round(
        Math.round(totalXp / 40) + completedToday * 8 + Math.max(0, completionRate / 4)
      )
    );
    const careSignals = [
      {
        label: "Bond",
        value: `${bondScore}%`,
        detail:
          bondScore >= 80
            ? "Deep trust"
            : bondScore >= 45
              ? "Growing"
              : "New bond",
      },
      {
        label: "Energy",
        value: `${Math.max(0, 100 - skippedToday * 18)}%`,
        detail: skippedToday > 0 ? "Needs a reset" : "Steady",
      },
      {
        label: "Focus",
        value: `${completionRate}%`,
        detail: todayTasks.length === 0 ? "No missions" : "Today",
      },
    ];
    const milestones = [
      {
        label: "First Step",
        unlocked: totalXp >= 25,
        detail: "Earn 25 XP",
      },
      {
        label: "Steady Week",
        unlocked: totalXp >= 250,
        detail: "Earn 250 XP",
      },
      {
        label: "Companion Keeper",
        unlocked: unlockedPets.length >= 4,
        detail: "Unlock 4 pets",
      },
      {
        label: "Legend Bond",
        unlocked: unlockedPets.length === PET_TIERS.length,
        detail: "Unlock every pet",
      },
    ];
    const companionLine =
      todayTasks.length === 0
        ? "Give me one mission and I will guard it with you."
        : completionRate === 100
          ? "That was clean. I am saving this one in the legend book."
          : skippedToday > 0
            ? "We slipped, but we do not have to spiral. Pick the smallest next move."
            : completedToday > 0
              ? "Momentum is awake. Do not let it wander off."
              : "Start small. I will match your pace.";

    return {
      activePet,
      bondScore,
      careSignals,
      completedToday,
      completionRate,
      companionLine,
      milestones,
      mood,
      petProgress,
      skippedToday,
      todayTasks,
      todayXp,
      totalXp,
      unlockedPets,
    };
  }, [profile.activePetKey, tasks]);

  const activeName = profile.petNickname?.trim() || petData.activePet.name;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientBackground colors={colors} variant="energy" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.backText, { color: colors.tint }]}>Back</Text>
          </TouchableOpacity>
          <Text style={[styles.kicker, { color: colors.tint }]}>Companion Home</Text>
          <Text style={[styles.title, { color: colors.text }]}>{activeName}</Text>
          <Text style={[styles.subtitle, { color: colors.subtle }]}>
            Your companion grows with consistency, not perfection.
          </Text>
        </View>

        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowColor: colors.tint,
            },
          ]}
        >
          <PetSprite
            petKey={petData.activePet.key}
            size={138}
            animated
            mood={
              petData.completionRate === 100
                ? "happy"
                : petData.skippedToday > 0
                  ? "tired"
                  : "idle"
            }
            style={styles.heroPet}
          />
          <Text style={[styles.moodLabel, { color: colors.tint }]}>
            {petData.mood}
          </Text>
          <Text style={[styles.petDescription, { color: colors.subtle }]}>
            {petData.activePet.description}
          </Text>
          <View
            style={[
              styles.companionSpeech,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.companionSpeechText, { color: colors.text }]}>
              {petData.companionLine}
            </Text>
          </View>

          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${petData.petProgress.progressPercent}%`,
                  backgroundColor: colors.tint,
                },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: colors.subtle }]}>
            {petData.petProgress.nextPet
              ? `${petData.petProgress.remainingXp} XP until ${petData.petProgress.nextPet.name}`
              : "Collection complete. Legendary behavior."}
          </Text>
        </View>

        <View
          style={[
            styles.bondCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Companion Bond
          </Text>
          <View style={styles.careGrid}>
            {petData.careSignals.map((signal) => (
              <View
                key={signal.label}
                style={[
                  styles.careTile,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.careValue, { color: colors.text }]}>
                  {signal.value}
                </Text>
                <Text style={[styles.careLabel, { color: colors.subtle }]}>
                  {signal.label}
                </Text>
                <Text style={[styles.careDetail, { color: colors.tint }]}>
                  {signal.detail}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.statGrid}>
          {[
            { label: "Total XP", value: petData.totalXp },
            { label: "Today XP", value: `+${petData.todayXp}` },
            { label: "Unlocked", value: `${petData.unlockedPets.length}/${PET_TIERS.length}` },
            { label: "Today", value: `${petData.completionRate}%` },
          ].map((item) => (
            <View
              key={item.label}
              style={[
                styles.statCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.statValue, { color: colors.text }]}>
                {item.value}
              </Text>
              <Text style={[styles.statLabel, { color: colors.subtle }]}>
                {item.label}
              </Text>
            </View>
          ))}
        </View>

        <View
          style={[
            styles.collectionCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Companion Lineup
          </Text>
          <View style={styles.petGrid}>
            {PET_TIERS.map((pet) => {
              const unlocked = petData.totalXp >= pet.unlockXp;
              const active = petData.activePet.key === pet.key;

              return (
                <TouchableOpacity
                  key={pet.key}
                  disabled={!unlocked}
                  onPress={() => saveProfile({ activePetKey: pet.key })}
                  style={[
                    styles.petTile,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                      opacity: unlocked ? 1 : 0.45,
                    },
                    active && {
                      backgroundColor: colors.surface,
                      borderColor: colors.tint,
                    },
                  ]}
                >
                  <PetSprite petKey={pet.key} size={50} style={styles.petTileSprite} />
                  <Text style={[styles.petTileName, { color: colors.text }]}>
                    {pet.name}
                  </Text>
                  <Text style={[styles.petTileMeta, { color: colors.subtle }]}>
                    {unlocked ? (active ? "Active" : "Unlocked") : `${pet.unlockXp} XP`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View
          style={[
            styles.badgeCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Reward Badges
          </Text>
          <View style={styles.badgeGrid}>
            {petData.milestones.map((badge) => (
              <View
                key={badge.label}
                style={[
                  styles.badgeTile,
                  {
                    backgroundColor: badge.unlocked
                      ? colors.surface
                      : colors.background,
                    borderColor: badge.unlocked ? colors.tint : colors.border,
                    opacity: badge.unlocked ? 1 : 0.55,
                  },
                ]}
              >
                <Text style={styles.badgeIcon}>{badge.unlocked ? "*" : "-"}</Text>
                <Text style={[styles.badgeLabel, { color: colors.text }]}>
                  {badge.label}
                </Text>
                <Text style={[styles.badgeDetail, { color: colors.subtle }]}>
                  {badge.detail}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: 20,
    paddingTop: 58,
    paddingBottom: 48,
  },
  header: {
    marginBottom: 16,
  },
  backText: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 18,
  },
  kicker: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  heroCard: {
    alignItems: "center",
    borderRadius: 28,
    borderWidth: 1,
    padding: 24,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
    elevation: 5,
  },
  heroPet: {
    marginBottom: 12,
  },
  moodLabel: {
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 6,
  },
  petDescription: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 14,
  },
  companionSpeech: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 18,
    padding: 13,
    marginBottom: 18,
  },
  companionSpeechText: {
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
    textAlign: "center",
  },
  progressTrack: {
    width: "100%",
    height: 9,
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: 9,
    borderRadius: 999,
  },
  progressText: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 10,
    textAlign: "center",
  },
  bondCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
  },
  careGrid: {
    flexDirection: "row",
    marginHorizontal: -4,
  },
  careTile: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginHorizontal: 4,
  },
  careValue: {
    fontSize: 20,
    fontWeight: "900",
  },
  careLabel: {
    fontSize: 11,
    fontWeight: "900",
    marginTop: 3,
    textTransform: "uppercase",
  },
  careDetail: {
    fontSize: 11,
    fontWeight: "800",
    marginTop: 6,
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  statCard: {
    width: "48%",
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "900",
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "800",
    marginTop: 5,
    textTransform: "uppercase",
  },
  collectionCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 14,
  },
  petGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  petTile: {
    width: "48%",
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  petTileSprite: {
    marginBottom: 8,
  },
  petTileName: {
    fontSize: 14,
    fontWeight: "900",
  },
  petTileMeta: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  badgeCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
  },
  badgeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  badgeTile: {
    width: "48%",
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  badgeIcon: {
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 8,
  },
  badgeLabel: {
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 4,
  },
  badgeDetail: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
});
