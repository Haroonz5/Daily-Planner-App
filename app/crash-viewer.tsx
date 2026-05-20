import { useRouter } from "expo-router";
import { collection, deleteDoc, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { AmbientBackground } from "@/components/ambient-background";
import { useAppTheme } from "@/constants/appTheme";
import { Colors } from "@/constants/theme";
import { auth, db } from "@/constants/firebaseConfig";
import { useUserProfile } from "@/hooks/use-user-profile";
import { reportAppError } from "@/utils/error-reporting";
import { playSaveFeedback, playWarningFeedback } from "@/utils/feedback";

type AppErrorRow = {
  id: string;
  source?: string;
  name?: string;
  message?: string;
  stack?: string | null;
  createdAt?: any;
};

const formatTime = (value: any) => {
  const date = typeof value?.toDate === "function" ? value.toDate() : value ? new Date(value) : null;
  if (!date) return "recently";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

export default function CrashViewerScreen() {
  const router = useRouter();
  const { themeName } = useAppTheme();
  const { profile } = useUserProfile();
  const colors = Colors[themeName];
  const [errors, setErrors] = useState<AppErrorRow[]>([]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    return onSnapshot(
      query(collection(db, "users", uid, "appErrors"), orderBy("createdAt", "desc")),
      (snapshot) => setErrors(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as AppErrorRow)),
      () => setErrors([])
    );
  }, []);

  const addTestError = async () => {
    await reportAppError({
      source: "CrashViewerTest",
      error: new Error("Manual test diagnostic from Crash Viewer"),
      metadata: { safeTest: true },
    });
    await playWarningFeedback(profile);
  };

  const clearError = async (id: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await deleteDoc(doc(db, "users", uid, "appErrors", id));
    await playSaveFeedback(profile);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <AmbientBackground colors={colors} variant="signal" />
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
        <Text style={[styles.back, { color: colors.tint }]}>Back</Text>
      </TouchableOpacity>

      <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}> 
        <Text style={[styles.kicker, { color: colors.tint }]}>Crash Viewer</Text>
        <Text style={[styles.title, { color: colors.text }]}>Error reports for this tester</Text>
        <Text style={[styles.body, { color: colors.subtle }]}>This is the in-app Crashlytics-style viewer. It helps debug Expo tester builds without waiting for a native crash SDK.</Text>
      </View>

      <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.warning }]} onPress={addTestError} accessibilityRole="button" accessibilityLabel="Create a test diagnostic error">
        <Text style={styles.primaryText}>Create Test Error</Text>
      </TouchableOpacity>

      {errors.length ? errors.map((error) => (
        <View key={error.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Text style={[styles.cardTitle, { color: colors.text }]}>{error.source ?? "App"} · {formatTime(error.createdAt)}</Text>
          <Text style={[styles.message, { color: colors.subtle }]}>{error.message ?? error.name ?? "Unknown error"}</Text>
          {error.stack ? <Text style={[styles.stack, { color: colors.subtle }]} numberOfLines={5}>{error.stack}</Text> : null}
          <TouchableOpacity style={[styles.deleteButton, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => clearError(error.id)} accessibilityRole="button" accessibilityLabel="Delete this error report">
            <Text style={[styles.deleteText, { color: colors.text }]}>Delete Report</Text>
          </TouchableOpacity>
        </View>
      )) : (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.success }]}> 
          <Text style={[styles.cardTitle, { color: colors.text }]}>No recent errors</Text>
          <Text style={[styles.message, { color: colors.subtle }]}>Clean diagnostics. That is exactly what we want before sending the build wider.</Text>
        </View>
      )}
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
  primaryButton: { borderRadius: 18, paddingVertical: 16, alignItems: "center", marginBottom: 16 },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  card: { borderWidth: 1, borderRadius: 22, padding: 18, marginBottom: 14 },
  cardTitle: { fontSize: 17, fontWeight: "900", marginBottom: 8 },
  message: { fontSize: 14, lineHeight: 22, fontWeight: "700" },
  stack: { fontSize: 11, lineHeight: 16, marginTop: 10 },
  deleteButton: { borderWidth: 1, borderRadius: 14, paddingVertical: 12, alignItems: "center", marginTop: 12 },
  deleteText: { fontSize: 13, fontWeight: "900" },
});
