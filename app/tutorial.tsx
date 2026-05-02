import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { AmbientBackground } from "@/components/ambient-background";
import { PetSprite } from "@/components/pet-sprite";
import { useAppTheme } from "@/constants/appTheme";
import type { PetKey } from "@/constants/rewards";
import { Colors } from "@/constants/theme";
import { useUserProfile } from "@/hooks/use-user-profile";

type TutorialSlide = {
  label: string;
  title: string;
  description: string;
  petKey?: PetKey;
  callout: string;
  steps: string[];
};

const tutorialSlides: TutorialSlide[] = [
  {
    label: "Home",
    title: "Start with today's plan",
    description:
      "The home screen shows what is due, what is late, and whether your day looks realistic before you start.",
    callout: "Use the readiness score as your quick sanity check.",
    steps: ["Check Today Readiness", "Review tasks by due time", "Complete or reschedule honestly"],
  },
  {
    label: "Add",
    title: "Create tasks without friction",
    description:
      "Add a task for later today, next week, or repeat routines with AI when the plan should happen more than once.",
    callout: "Try typing: Gym at 6pm every day.",
    steps: ["Pick a date and time", "Use templates for routines", "Use Repeat with AI for natural language"],
  },
  {
    label: "Focus",
    title: "Turn effort into clean sessions",
    description:
      "Focus mode helps you pick one task, run a timer, and earn extra XP for staying with the block.",
    petKey: "fox",
    callout: "One clean 25-minute block is better than a messy hour.",
    steps: ["Pick a task", "Start a focus timer", "Finish the block for bonus XP"],
  },
  {
    label: "Rewards",
    title: "Your companion grows with consistency",
    description:
      "Completing tasks, keeping streaks, and doing focus sessions unlock stronger companions over time.",
    petKey: "dragon",
    callout: "Your pet is feedback, not pressure.",
    steps: ["Complete tasks for XP", "Unlock new pets", "Recover after missed days"],
  },
  {
    label: "Review",
    title: "Adjust the system as you learn",
    description:
      "Stats and settings help you see patterns, change themes, tune reminders, and make the app fit your real life.",
    petKey: "eagle",
    callout: "The goal is a better loop, not a perfect day.",
    steps: ["Read daily feedback", "Check weekly patterns", "Tune reminders and themes"],
  },
];

export default function TutorialScreen() {
  const router = useRouter();
  const { themeName } = useAppTheme();
  const { saveProfile } = useUserProfile();
  const colors = Colors[themeName];
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const slide = tutorialSlides[currentSlide];
  const isLastSlide = currentSlide === tutorialSlides.length - 1;

  const finishTutorial = async () => {
    if (isSaving) return;

    setIsSaving(true);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {}
    );
    await saveProfile({ tutorialCompleted: true });
    router.replace("/(tabs)");
  };

  const handleNext = async () => {
    await Haptics.selectionAsync().catch(() => {});

    if (!isLastSlide) {
      setCurrentSlide((value) => value + 1);
      return;
    }

    await finishTutorial();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientBackground colors={colors} variant="signal" />

      <View style={styles.topBar}>
        <View>
          <Text style={[styles.kicker, { color: colors.tint }]}>
            New User Guide
          </Text>
          <Text style={[styles.screenTitle, { color: colors.text }]}>
            Learn the loop
          </Text>
        </View>
        <TouchableOpacity
          onPress={finishTutorial}
          disabled={isSaving}
          style={[
            styles.skipButton,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.skipText, { color: colors.subtle }]}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
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
          <Text style={[styles.slideLabel, { color: colors.tint }]}>
            {slide.label}
          </Text>

          {slide.petKey ? (
            <PetSprite
              petKey={slide.petKey}
              size={112}
              animated
              mood={isLastSlide ? "happy" : "idle"}
              style={styles.pet}
            />
          ) : (
            <View
              style={[
                styles.abstractIcon,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={[styles.iconLineTall, { backgroundColor: colors.tint }]} />
              <View style={[styles.iconStack, { backgroundColor: colors.card }]}>
                <View style={[styles.iconLine, { backgroundColor: colors.tint }]} />
                <View style={[styles.iconLineWide, { backgroundColor: colors.border }]} />
              </View>
              <View style={[styles.iconStack, { backgroundColor: colors.card }]}>
                <View style={[styles.iconLine, { backgroundColor: colors.success }]} />
                <View style={[styles.iconLineWide, { backgroundColor: colors.border }]} />
              </View>
            </View>
          )}

          <Text style={[styles.title, { color: colors.text }]}>
            {slide.title}
          </Text>
          <Text style={[styles.description, { color: colors.subtle }]}>
            {slide.description}
          </Text>

          <View
            style={[
              styles.callout,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.calloutText, { color: colors.text }]}>
              {slide.callout}
            </Text>
          </View>

          <View style={styles.steps}>
            {slide.steps.map((step, index) => (
              <View
                key={step}
                style={[
                  styles.stepRow,
                  { borderBottomColor: colors.border },
                  index === slide.steps.length - 1 && styles.stepRowLast,
                ]}
              >
                <View
                  style={[styles.stepNumber, { backgroundColor: colors.tint }]}
                >
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <Text style={[styles.stepText, { color: colors.text }]}>
                  {step}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.dotsRow}>
          {tutorialSlides.map((item, index) => (
            <View
              key={item.label}
              style={[
                styles.dot,
                { backgroundColor: colors.border },
                index === currentSlide && [
                  styles.dotActive,
                  { backgroundColor: colors.tint },
                ],
              ]}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.tint }]}
          onPress={handleNext}
          disabled={isSaving}
        >
          <Text style={styles.primaryButtonText}>
            {isSaving
              ? "Opening App..."
              : isLastSlide
                ? "Start Planning"
                : "Next Tip"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 58,
    paddingHorizontal: 20,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  kicker: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: "800",
    marginTop: 4,
  },
  skipButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  skipText: {
    fontSize: 13,
    fontWeight: "800",
  },
  content: {
    flexGrow: 1,
    paddingBottom: 32,
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: 32,
    padding: 24,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 6,
  },
  slideLabel: {
    alignSelf: "center",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 16,
    textTransform: "uppercase",
  },
  pet: {
    marginBottom: 18,
  },
  abstractIcon: {
    alignSelf: "center",
    width: 156,
    height: 132,
    borderRadius: 32,
    borderWidth: 1,
    padding: 18,
    marginBottom: 18,
    justifyContent: "center",
  },
  iconLineTall: {
    position: "absolute",
    left: 26,
    top: 22,
    bottom: 22,
    width: 8,
    borderRadius: 999,
  },
  iconStack: {
    marginLeft: 36,
    borderRadius: 18,
    padding: 12,
    marginVertical: 5,
  },
  iconLine: {
    width: 42,
    height: 7,
    borderRadius: 999,
    marginBottom: 8,
  },
  iconLineWide: {
    width: 78,
    height: 6,
    borderRadius: 999,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 10,
  },
  description: {
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
  },
  callout: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    marginTop: 18,
  },
  calloutText: {
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
    textAlign: "center",
  },
  steps: {
    marginTop: 18,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    paddingVertical: 13,
  },
  stepRowLast: {
    borderBottomWidth: 0,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  stepNumberText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 24,
    marginBottom: 18,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginHorizontal: 4,
  },
  dotActive: {
    width: 28,
  },
  primaryButton: {
    borderRadius: 20,
    paddingVertical: 17,
    alignItems: "center",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 5,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
});
