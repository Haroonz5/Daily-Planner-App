import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { markOnboardingSeen } from "@/constants/appTheme";

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
    <View style={styles.container}>
      <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.emoji}>{slide.emoji}</Text>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.description}>{slide.description}</Text>
        </View>

        <View style={styles.dotsRow}>
          {slides.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                index === currentSlide && styles.dotActive,
              ]}
            />
          ))}
        </View>

        <View style={styles.footerCard}>
          <Text style={styles.footerTitle}>Daily Discipline</Text>
          <Text style={styles.footerText}>
            Calm planning. Honest execution. Better follow-through.
          </Text>

          <TouchableOpacity style={styles.primaryButton} onPress={handleNext}>
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
    backgroundColor: "#fdf6ff",
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  skipButton: {
    alignSelf: "flex-end",
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  skipText: {
    color: "#9b8aa8",
    fontSize: 14,
    fontWeight: "600",
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: 32,
  },
  heroCard: {
    backgroundColor: "#fff",
    borderRadius: 28,
    padding: 28,
    alignItems: "center",
    shadowColor: "#c4a8d4",
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
    color: "#4a3f55",
    textAlign: "center",
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: "#9b8aa8",
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
    backgroundColor: "#e8d8f0",
    marginHorizontal: 5,
  },
  dotActive: {
    width: 24,
    backgroundColor: "#c4a8d4",
  },
  footerCard: {
    backgroundColor: "#f8f0fb",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
  },
  footerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#4a3f55",
    marginBottom: 8,
  },
  footerText: {
    fontSize: 14,
    color: "#9b8aa8",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: "#c4a8d4",
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
