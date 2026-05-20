import { useRouter } from "expo-router";
import { collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { useEffect, useState } from "react";
import { ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { AmbientBackground } from "@/components/ambient-background";
import { useAppTheme } from "@/constants/appTheme";
import { Colors } from "@/constants/theme";
import { auth, db } from "@/constants/firebaseConfig";
import { useUserProfile } from "@/hooks/use-user-profile";
import { logProductionAnalyticsEvent } from "@/utils/analytics";
import { playSaveFeedback, playSelectionFeedback } from "@/utils/feedback";

type AnalyticsEvent = {
  id: string;
  eventName?: string;
  createdAt?: any;
};

const formatTime = (value: any) => {
  const date = typeof value?.toDate === "function" ? value.toDate() : value ? new Date(value) : null;
  if (!date) return "recently";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

export default function PrivacyScreen() {
  const router = useRouter();
  const { themeName } = useAppTheme();
  const { profile, saveProfile } = useUserProfile();
  const colors = Colors[themeName];
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);

  useEffect(() => {
    void logProductionAnalyticsEvent("privacy_opened");
  }, []);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    return onSnapshot(
      query(collection(db, "users", uid, "analyticsEvents"), orderBy("createdAt", "desc"), limit(8)),
      (snapshot) => {
        setEvents(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as AnalyticsEvent));
      },
      () => setEvents([])
    );
  }, []);

  const toggle = async (key: "analyticsOptOut" | "crashReportingOptOut") => {
    await saveProfile({ [key]: profile[key] !== true });
    await playSelectionFeedback(profile);
  };

  const sharePrivacySummary = async () => {
    await Share.share({
      message: [
        "Daily Discipline Privacy Summary",
        "Stored: profile, tasks, routines, friends, feedback, diagnostics, and optional analytics events.",
        "AI: task text is sent only to the configured backend/gateway when AI planning is used.",
        `Analytics opt out: ${profile.analyticsOptOut ? "on" : "off"}`,
        `Crash reporting opt out: ${profile.crashReportingOptOut ? "on" : "off"}`,
      ].join("\n"),
    });
    await playSaveFeedback(profile);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <AmbientBackground colors={colors} variant="calm" />
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
        <Text style={[styles.back, { color: colors.tint }]}>Back</Text>
      </TouchableOpacity>

      <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}> 
        <Text style={[styles.kicker, { color: colors.tint }]}>Privacy</Text>
        <Text style={[styles.title, { color: colors.text }]}>Data, AI, and analytics controls</Text>
        <Text style={[styles.body, { color: colors.subtle }]}>A production app should be honest about what it stores. This page gives testers clear controls and gives you an interview-ready privacy story.</Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
        <Text style={[styles.cardTitle, { color: colors.text }]}>Controls</Text>
        {[
          { key: "analyticsOptOut" as const, label: "Opt out of product analytics", value: profile.analyticsOptOut === true },
          { key: "crashReportingOptOut" as const, label: "Opt out of crash/error reports", value: profile.crashReportingOptOut === true },
        ].map((item) => (
          <View key={item.key} style={[styles.toggleRow, { borderBottomColor: colors.border }]}> 
            <Text style={[styles.toggleLabel, { color: colors.text }]}>{item.label}</Text>
            <TouchableOpacity style={[styles.toggleButton, { backgroundColor: item.value ? colors.warning : colors.tint }]} onPress={() => toggle(item.key)} accessibilityRole="button" accessibilityLabel={item.label}>
              <Text style={styles.toggleText}>{item.value ? "Off" : "On"}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
        <Text style={[styles.cardTitle, { color: colors.text }]}>What the app stores</Text>
        {[
          "Tasks, routines, completion status, XP, and pet choices.",
          "Friend usernames, accepted friend links, nudges, and accountability contracts.",
          "Optional diagnostics and lightweight analytics events for tester builds.",
          "AI planning text is sent to your backend URL, never directly with a mobile API key.",
        ].map((line) => <Text key={line} style={[styles.line, { color: colors.subtle }]}>{line}</Text>)}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
        <Text style={[styles.cardTitle, { color: colors.text }]}>Recent analytics events</Text>
        {events.length ? events.map((event) => (
          <Text key={event.id} style={[styles.line, { color: colors.subtle }]}>{event.eventName ?? "event"} · {formatTime(event.createdAt)}</Text>
        )) : <Text style={[styles.line, { color: colors.subtle }]}>No analytics events stored for this account yet.</Text>}
      </View>

      <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.tint }]} onPress={sharePrivacySummary} accessibilityRole="button" accessibilityLabel="Share privacy summary">
        <Text style={styles.primaryText}>Share Privacy Summary</Text>
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
  card: { borderWidth: 1, borderRadius: 22, padding: 18, marginBottom: 14 },
  cardTitle: { fontSize: 18, fontWeight: "900", marginBottom: 10 },
  line: { fontSize: 14, lineHeight: 22, fontWeight: "700", marginBottom: 8 },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, paddingVertical: 12 },
  toggleLabel: { flex: 1, fontSize: 14, fontWeight: "800", paddingRight: 12 },
  toggleButton: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  toggleText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  primaryButton: { borderRadius: 18, paddingVertical: 16, alignItems: "center", marginTop: 4 },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "900" },
});
