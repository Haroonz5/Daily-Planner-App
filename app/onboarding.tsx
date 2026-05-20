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
import { markOnboardingSeen, useAppTheme } from "@/constants/appTheme";
import type { PetKey } from "@/constants/rewards";
import { saveOnboardingPersonalization, type OnboardingExperience, type OnboardingPlanningGoal } from "@/utils/onboarding-personalization";
import { Colors } from "@/constants/theme";

type OnboardingSlide = {
  emoji: string;
  title: string;
  description: string;
  label: string;
  petKey?: PetKey;
  bullets: string[];
};

const goalOptions: { label: string; value: OnboardingPlanningGoal }[] = [
  { label: "School", value: "school" },
  { label: "Fitness", value: "fitness" },
  { label: "Work", value: "work" },
  { label: "Discipline", value: "discipline" },
  { label: "Wellness", value: "wellness" },
];

const experienceOptions: { label: string; value: OnboardingExperience }[] = [
  { label: "Beginner", value: "beginner" },
  { label: "Steady", value: "steady" },
  { label: "Intense", value: "intense" },
];

const slides: OnboardingSlide[] = [
  {
    emoji: "☀️",
    label: "Step 1",
    title: "Plan before the day gets loud",
    description:
      "Set tasks for today, tomorrow, or the future so your day starts with direction instead of guesswork.",
    bullets: ["Today and future tasks", "Recurring routines", "Clean schedule review"],
  },
  {
    emoji: "✨",
    label: "AI Assist",
    title: "Type messy plans. Get real tasks.",
    description:
      "Write something like 'gym at 6 every day' and the app turns it into structured tasks you can approve.",
    bullets: ["Natural language planning", "Reality checks", "Task breakdowns"],
  },
  {
    emoji: "🐉",
    label: "Rewards",
    petKey: "dragon",
    title: "Earn XP and grow companions",
    description:
      "Every completed task feeds your reward system. Consistency unlocks stronger companions over time.",
    bullets: ["XP by priority", "Pet unlocks", "Recovery missions"],
  },
  {
    emoji: "📈",
    label: "Insights",
    title: "Learn how you actually work",
    description:
      "Stats show your best windows, friction points, skipped patterns, and what to adjust next.",
    bullets: ["Weekly review", "Best time windows", "Plan vs reality"],
  },
  {
    emoji: "🎯",
    label: "Loop",
    title: "Small honest wins stack up",
    description:
      "The goal is not perfection. It is a repeatable loop that keeps you planning, adjusting, and coming back.",
    bullets: ["Plan", "Execute", "Review", "Improve"],
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { themeName } = useAppTheme();
  const colors = Colors[themeName];
  const [currentSlide, setCurrentSlide] = useState(0);
  const [planningGoal, setPlanningGoal] = useState<OnboardingPlanningGoal>("discipline");
  const [onboardingExperience, setOnboardingExperience] = useState<OnboardingExperience>("steady");

  const isLastSlide = currentSlide === slides.length - 1;
  const slide = slides[currentSlide];

  const handleNext = async () => {
    if (!isLastSlide) {
      setCurrentSlide((prev) => prev + 1);
      return;
    }

    await saveOnboardingPersonalization({ planningGoal, onboardingExperience });
    await markOnboardingSeen();
    router.replace("/login");
  };

  const handleSkip = async () => {
    await saveOnboardingPersonalization({ planningGoal, onboardingExperience });
    await markOnboardingSeen();
    router.replace("/login");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AmbientBackground colors={colors} variant="signal" />

      <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
        <Text style={[styles.skipText, { color: colors.subtle }]}>Skip</Text>
      </TouchableOpacity>

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
            <PetSprite petKey={slide.petKey} size={104} style={styles.petHero} />
          ) : (
            <Text style={styles.emoji}>{slide.emoji}</Text>
          )}
          <Text style={[styles.title, { color: colors.text }]}>
            {slide.title}
          </Text>
          <Text style={[styles.description, { color: colors.subtle }]}>
            {slide.description}
          </Text>
          <View style={styles.bulletGrid}>
            {slide.bullets.map((bullet) => (
              <View
                key={bullet}
                style={[
                  styles.bulletPill,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.bulletText, { color: colors.text }]}>
                  {bullet}
                </Text>
              </View>
            ))}
          </View>
        </View>


        {isLastSlide && (
          <View
            style={[
              styles.personalizationCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.personalizationTitle, { color: colors.text }]}>Personalize your first week</Text>
            <Text style={[styles.personalizationText, { color: colors.subtle }]}>These choices become your first AI planning rules after signup.</Text>
            <Text style={[styles.optionLabel, { color: colors.subtle }]}>Main goal</Text>
            <View style={styles.optionGrid}>
              {goalOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.optionPill,
                    { backgroundColor: planningGoal === option.value ? colors.tint : colors.card, borderColor: colors.border },
                  ]}
                  onPress={() => setPlanningGoal(option.value)}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose ${option.label} goal`}
                >
                  <Text style={[styles.optionText, { color: planningGoal === option.value ? "#fff" : colors.text }]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.optionLabel, { color: colors.subtle }]}>Planning intensity</Text>
            <View style={styles.optionGrid}>
              {experienceOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.optionPill,
                    { backgroundColor: onboardingExperience === option.value ? colors.tint : colors.card, borderColor: colors.border },
                  ]}
                  onPress={() => setOnboardingExperience(option.value)}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose ${option.label} planning intensity`}
                >
                  <Text style={[styles.optionText, { color: onboardingExperience === option.value ? "#fff" : colors.text }]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={styles.dotsRow}>
          {slides.map((_, index) => (
            <View
              key={index}
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

        <View
          style={[
            styles.footerCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.footerTitle, { color: colors.text }]}>
            Daily Discipline
          </Text>
          <Text style={[styles.footerText, { color: colors.subtle }]}>
            Calm planning. Honest execution. Better follow-through.
          </Text>
          <Text style={[styles.progressText, { color: colors.subtle }]}>
            {currentSlide + 1} of {slides.length}
          </Text>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.tint }]}
            onPress={handleNext}
          >
            <Text style={styles.primaryButtonText}>
              {isLastSlide ? "Get Started" : "Next"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  skipButton: {
    alignSelf: "flex-end",
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  skipText: {
    fontSize: 14,
    fontWeight: "600",
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: 32,
  },
  heroCard: {
    borderRadius: 28,
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 5,
  },
  slideLabel: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 12,
    textTransform: "uppercase",
  },
  emoji: {
    fontSize: 64,
    marginBottom: 18,
  },
  petHero: {
    marginBottom: 18,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
  bulletGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 18,
  },
  bulletPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 4,
    marginBottom: 8,
  },
  bulletText: {
    fontSize: 12,
    fontWeight: "800",
  },
  personalizationCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    marginTop: 18,
  },
  personalizationTitle: {
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 6,
  },
  personalizationText: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  optionLabel: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 8,
    marginBottom: 8,
  },
  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
  },
  optionPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 4,
    marginBottom: 8,
  },
  optionText: {
    fontSize: 12,
    fontWeight: "900",
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 28,
    marginBottom: 28,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginHorizontal: 5,
  },
  dotActive: {
    width: 24,
  },
  footerCard: {
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
  },
  footerTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  footerText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 10,
  },
  progressText: {
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 18,
  },
  primaryButton: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 28,
    minWidth: 180,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
