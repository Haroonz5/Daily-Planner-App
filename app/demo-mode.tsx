import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { AmbientBackground } from "@/components/ambient-background";
import { useAppTheme } from "@/constants/appTheme";
import { Colors } from "@/constants/theme";
import { auth } from "@/constants/firebaseConfig";
import { seedDemoMode } from "@/utils/demo-mode";
import { playTaskCreatedFeedback, playWarningFeedback } from "@/utils/feedback";
import { useUserProfile } from "@/hooks/use-user-profile";

export default function DemoModeScreen() {
  const router = useRouter();
  const { themeName } = useAppTheme();
  const { profile } = useUserProfile();
  const colors = Colors[themeName];
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Seed a clean portfolio demo with tasks, AI memory, routines, and stats history.");

  const runSeed = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setMessage("Sign in before turning on demo mode.");
      await playWarningFeedback(profile);
      return;
    }

    setBusy(true);
    try {
      const count = await seedDemoMode(uid);
      await playTaskCreatedFeedback(profile);
      setMessage(`${count} demo tasks added. Open Today, Stats, AI Memory, or Weekly Report to demo the loop.`);
    } catch {
      await playWarningFeedback(profile);
      setMessage("Demo mode could not be seeded. Check Firestore rules and login state.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <AmbientBackground colors={colors} variant="focus" />
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
        <Text style={[styles.back, { color: colors.tint }]}>Back</Text>
      </TouchableOpacity>

      <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}> 
        <Text style={[styles.kicker, { color: colors.tint }]}>Portfolio Demo</Text>
        <Text style={[styles.title, { color: colors.text }]}>Make the app demo-ready in one tap</Text>
        <Text style={[styles.body, { color: colors.subtle }]}>{message}</Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
        <Text style={[styles.cardTitle, { color: colors.text }]}>What gets seeded</Text>
        {[
          "Today tasks for the core productivity loop",
          "Completed history for Stats and Weekly Report",
          "AI memory and planning rules for the coach story",
          "A sample ongoing gym routine",
        ].map((item) => (
          <Text key={item} style={[styles.bullet, { color: colors.subtle }]}>- {item}</Text>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, { backgroundColor: busy ? colors.border : colors.tint }]}
        onPress={runSeed}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Seed portfolio demo data"
      >
        <Text style={styles.primaryText}>{busy ? "Seeding demo..." : "Seed Demo Mode"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 62, paddingBottom: 140 },
  back: { fontSize: 15, fontWeight: "900", marginBottom: 18 },
  hero: { borderWidth: 1, borderRadius: 28, padding: 22, marginBottom: 18 },
  kicker: { fontSize: 12, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 },
  title: { fontSize: 30, fontWeight: "900", lineHeight: 35, marginBottom: 10 },
  body: { fontSize: 15, lineHeight: 22 },
  card: { borderWidth: 1, borderRadius: 22, padding: 18, marginBottom: 18 },
  cardTitle: { fontSize: 18, fontWeight: "900", marginBottom: 10 },
  bullet: { fontSize: 14, lineHeight: 22, fontWeight: "700" },
  primaryButton: { borderRadius: 18, paddingVertical: 16, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "900" },
});
