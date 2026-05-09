import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useAppTheme } from "@/constants/appTheme";
import { Colors } from "@/constants/theme";

const featureCards = [
  {
    icon: "sparkles-outline" as const,
    title: "Plan With AI",
    body: "Type normal language like gym every weekday at 6 PM and the app turns it into tasks.",
  },
  {
    icon: "shield-checkmark-outline" as const,
    title: "Discipline Guardrails",
    body: "Reality checks, skip patterns, routines, and security logs keep the system honest.",
  },
  {
    icon: "paw-outline" as const,
    title: "Earn Companions",
    body: "XP unlocks pets, streaks, and feedback so consistency feels like visible progress.",
  },
];

const stackItems = [
  "React Native + Expo app",
  "Firebase Auth, Firestore, rules, and TOTP",
  "Python AI backend with Gemini/OpenAI support",
  "Go security gateway with rate limits and audit logs",
];

export default function LandingScreen() {
  const router = useRouter();
  const { themeName } = useAppTheme();
  const colors = Colors[themeName];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.glowOne, { backgroundColor: colors.tint }]} />
      <View style={[styles.glowTwo, { backgroundColor: colors.success }]} />

      <View style={styles.hero}>
        <View style={[styles.logoMark, { backgroundColor: colors.tint }]}>
          <Ionicons name="checkmark-done" size={34} color="#fff" />
        </View>
        <Text style={[styles.kicker, { color: colors.tint }]}>
          AI discipline planner
        </Text>
        <Text style={[styles.title, { color: colors.text }]}>
          Build days you can actually follow.
        </Text>
        <Text style={[styles.subtitle, { color: colors.subtle }]}>
          Daily Discipline combines task planning, routines, reminders, focus,
          friends, XP rewards, and an AI backend into one accountability loop.
        </Text>

        <View style={styles.heroActions}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.tint }]}
            onPress={() => router.push("/signup" as never)}
            accessibilityRole="button"
            accessibilityLabel="Create an account"
          >
            <Text style={styles.primaryButtonText}>Create Account</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.secondaryButton,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() => router.push("/login" as never)}
            accessibilityRole="button"
            accessibilityLabel="Log in"
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
              Log In
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.featureGrid}>
        {featureCards.map((feature) => (
          <View
            key={feature.title}
            style={[
              styles.featureCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Ionicons name={feature.icon} size={24} color={colors.tint} />
            <Text style={[styles.featureTitle, { color: colors.text }]}>
              {feature.title}
            </Text>
            <Text style={[styles.featureBody, { color: colors.subtle }]}>
              {feature.body}
            </Text>
          </View>
        ))}
      </View>

      <View
        style={[
          styles.stackCard,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Built Like A Real Product
        </Text>
        <Text style={[styles.sectionBody, { color: colors.subtle }]}>
          This page is intentionally public-facing so the project reads clearly
          to testers, friends, and recruiters before they ever open the app.
        </Text>
        {stackItems.map((item) => (
          <View key={item} style={styles.stackRow}>
            <View style={[styles.stackDot, { backgroundColor: colors.tint }]} />
            <Text style={[styles.stackText, { color: colors.subtle }]}>
              {item}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 22,
    paddingTop: 76,
    paddingBottom: 54,
  },
  glowOne: {
    position: "absolute",
    top: -90,
    right: -80,
    width: 220,
    height: 220,
    borderRadius: 110,
    opacity: 0.16,
  },
  glowTwo: {
    position: "absolute",
    top: 210,
    left: -105,
    width: 210,
    height: 210,
    borderRadius: 105,
    opacity: 0.12,
  },
  hero: {
    alignItems: "flex-start",
  },
  logoMark: {
    width: 62,
    height: 62,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },
  kicker: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: -1.3,
    lineHeight: 46,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: 16,
  },
  heroActions: {
    flexDirection: "row",
    marginTop: 24,
  },
  primaryButton: {
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginRight: 10,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "900",
  },
  featureGrid: {
    marginTop: 34,
  },
  featureCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    marginBottom: 12,
  },
  featureTitle: {
    fontSize: 17,
    fontWeight: "900",
    marginTop: 12,
    marginBottom: 6,
  },
  featureBody: {
    fontSize: 14,
    lineHeight: 21,
  },
  stackCard: {
    borderWidth: 1,
    borderRadius: 28,
    padding: 20,
    marginTop: 14,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  sectionBody: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 12,
  },
  stackRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  stackDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  stackText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
});
