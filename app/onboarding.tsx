import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { markOnboardingSeen, useAppTheme } from "@/constants/appTheme";
import { Colors } from "@/constants/theme";

const slides = [
  {
    emoji: "🌙",
    title: "Plan tomorrow tonight",
    description:
      "Set your tasks the night before so your day starts with direction instead of guesswork.",
  },
  {
    emoji: "🎯",
    title: "Focus on today only",
    description:
      "See what matters now, track progress, and build discipline one task at a time.",
  },
  {
    emoji: "📈",
    title: "Learn how you really work",
    description:
      "Your app will help you notice patterns, improve consistency, and build a routine you can actually follow.",
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { themeName } = useAppTheme();
  const colors = Colors[themeName];
  const [currentSlide, setCurrentSlide] = useState(0);

  const isLastSlide = currentSlide === slides.length - 1;
  const slide = slides[currentSlide];

  const handleNext = async () => {
    if (!isLastSlide) {
      setCurrentSlide((prev) => prev + 1);
      return;
    }

    await markOnboardingSeen();
    router.replace("/login");
  };

  const handleSkip = async () => {
    await markOnboardingSeen();
    router.replace("/login");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
            { backgroundColor: colors.card, shadowColor: colors.tint },
          ]}
        >
          <Text style={styles.emoji}>{slide.emoji}</Text>
          <Text style={[styles.title, { color: colors.text }]}>
            {slide.title}
          </Text>
          <Text style={[styles.description, { color: colors.subtle }]}>
            {slide.description}
          </Text>
        </View>

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
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 5,
  },
  emoji: {
    fontSize: 64,
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
    marginBottom: 20,
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
