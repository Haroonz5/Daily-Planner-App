import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { doneKeyboardProps, keyboardScrollViewProps } from "@/utils/keyboard";

import { AmbientBackground } from "@/components/ambient-background";
import { useAppTheme } from "@/constants/appTheme";
import { Colors } from "@/constants/theme";
import { checkAiBackendHealth, type AiBackendHealth } from "@/utils/ai";
import { playSaveFeedback, playWarningFeedback } from "@/utils/feedback";
import { useUserProfile } from "@/hooks/use-user-profile";

const gatewayUrl = (process.env.EXPO_PUBLIC_AI_API_URL || "http://127.0.0.1:8020").replace(/\/$/, "");

type AuditSummary = {
  audit_db?: boolean;
  total_requests?: number;
  failed_requests?: number;
  rate_limited_requests?: number;
  avg_latency_ms?: number;
  top_endpoints?: { endpoint: string; count: number; failed_count: number; avg_latency_ms: number }[];
  suspicious_ips?: { ip: string; count: number; failed_count: number; last_seen?: string }[];
  recent_failures?: { endpoint: string; method: string; status: number; reason?: string; ip?: string; created_at?: string }[];
};

type CompletionSummary = {
  buckets?: { bucket: string; task_count: number; completed_count: number; completion_rate: number }[];
  total_events?: number;
};

const formatPercent = (value: number | undefined) => `${Math.round((value ?? 0) * 100)}%`;

export default function AdminAnalyticsScreen() {
  const router = useRouter();
  const { themeName } = useAppTheme();
  const { profile } = useUserProfile();
  const colors = Colors[themeName];
  const [token, setToken] = useState("local-admin-token");
  const [audit, setAudit] = useState<AuditSummary | null>(null);
  const [completion, setCompletion] = useState<CompletionSummary | null>(null);
  const [health, setHealth] = useState<AiBackendHealth | null>(null);
  const [status, setStatus] = useState("Load gateway analytics to demo security audit logging, rate limits, SQL-backed task analytics, and backend health.");
  const [busy, setBusy] = useState(false);

  const loadAnalytics = async () => {
    setBusy(true);
    try {
      const [auditResponse, completionResponse, healthResult] = await Promise.all([
        fetch(`${gatewayUrl}/admin/audit-summary`, { headers: { "X-Admin-Token": token.trim() } }),
        fetch(`${gatewayUrl}/v1/analytics/completion-by-time`, { headers: { "X-Admin-Token": token.trim() } }),
        checkAiBackendHealth(),
      ]);

      if (!auditResponse.ok) throw new Error("Audit dashboard rejected the token or gateway is offline.");

      setAudit(await auditResponse.json());
      setCompletion(completionResponse.ok ? await completionResponse.json() : null);
      setHealth(healthResult);
      setStatus(`Loaded from ${gatewayUrl}`);
      await playSaveFeedback(profile);
    } catch (error: any) {
      setStatus(error?.message ?? "Admin analytics could not be loaded.");
      await playWarningFeedback(profile);
    } finally {
      setBusy(false);
    }
  };

  const bestBucket = (completion?.buckets ?? [])
    .slice()
    .sort((a, b) => b.completion_rate - a.completion_rate)[0];

  return (
    <ScrollView
      {...keyboardScrollViewProps}
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <AmbientBackground colors={colors} variant="focus" />
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
        <Text style={[styles.back, { color: colors.tint }]}>Back</Text>
      </TouchableOpacity>

      <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.kicker, { color: colors.tint }]}>Production Analytics</Text>
        <Text style={[styles.title, { color: colors.text }]}>Security, AI, and usage dashboard</Text>
        <Text style={[styles.body, { color: colors.subtle }]}>{status}</Text>
      </View>

      <TextInput
        {...doneKeyboardProps}
        style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
        placeholder="Admin dashboard token"
        placeholderTextColor={colors.subtle}
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        accessibilityLabel="Admin dashboard token"
      />

      <TouchableOpacity style={[styles.primaryButton, { backgroundColor: busy ? colors.border : colors.tint }]} onPress={loadAnalytics} disabled={busy} accessibilityRole="button" accessibilityLabel="Load admin analytics">
        <Text style={styles.primaryText}>{busy ? "Loading..." : "Load Production Analytics"}</Text>
      </TouchableOpacity>

      <View style={styles.grid}>
        {[
          ["Requests", audit?.total_requests ?? 0],
          ["Failures", audit?.failed_requests ?? 0],
          ["Rate Limited", audit?.rate_limited_requests ?? 0],
          ["Avg Latency", `${Math.round(audit?.avg_latency_ms ?? 0)}ms`],
          ["AI", health?.ok ? (health.modelConfigured ? "Model" : "Fallback") : "Offline"],
          ["Best Window", bestBucket ? `${bestBucket.bucket} ${formatPercent(bestBucket.completion_rate)}` : "No data"],
        ].map(([label, value]) => (
          <View key={String(label)} style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.tileValue, { color: colors.text }]}>{value}</Text>
            <Text style={[styles.tileLabel, { color: colors.subtle }]}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Top Gateway Endpoints</Text>
        {(audit?.top_endpoints ?? []).slice(0, 5).map((endpoint) => (
          <View key={endpoint.endpoint} style={styles.metricRow}>
            <Text style={[styles.lineStrong, { color: colors.text }]}>{endpoint.endpoint}</Text>
            <Text style={[styles.line, { color: colors.subtle }]}>{endpoint.count} calls · {endpoint.failed_count} failed · {Math.round(endpoint.avg_latency_ms)}ms avg</Text>
          </View>
        ))}
        {(audit?.top_endpoints?.length ?? 0) === 0 ? <Text style={[styles.line, { color: colors.subtle }]}>No audit rows yet. Send a few AI requests through the gateway.</Text> : null}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Suspicious IPs & Recent Failures</Text>
        {(audit?.suspicious_ips ?? []).slice(0, 4).map((ip) => (
          <Text key={`${ip.ip}-${ip.count}`} style={[styles.line, { color: colors.subtle }]}>{ip.ip}: {ip.count} requests, {ip.failed_count} failed</Text>
        ))}
        {(audit?.recent_failures ?? []).slice(0, 4).map((failure, index) => (
          <Text key={`${failure.endpoint}-${failure.created_at}-${index}`} style={[styles.line, { color: colors.warning }]}>{failure.status} {failure.method} {failure.endpoint} · {failure.reason ?? "failed"}</Text>
        ))}
        {!(audit?.suspicious_ips?.length || audit?.recent_failures?.length) ? <Text style={[styles.line, { color: colors.subtle }]}>No suspicious IPs or recent gateway failures.</Text> : null}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Completion By Time</Text>
        {(completion?.buckets ?? []).map((bucket) => (
          <View key={bucket.bucket} style={styles.metricRow}>
            <Text style={[styles.lineStrong, { color: colors.text }]}>{bucket.bucket}</Text>
            <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
              <View style={[styles.progressFill, { width: `${Math.round(bucket.completion_rate * 100)}%`, backgroundColor: colors.tint }]} />
            </View>
            <Text style={[styles.line, { color: colors.subtle }]}>{formatPercent(bucket.completion_rate)} ({bucket.completed_count}/{bucket.task_count})</Text>
          </View>
        ))}
        {(completion?.buckets?.length ?? 0) === 0 ? <Text style={[styles.line, { color: colors.subtle }]}>No task analytics events yet. Complete a few tasks after the gateway is hosted.</Text> : null}
      </View>
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
  input: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12, fontSize: 15 },
  primaryButton: { borderRadius: 18, paddingVertical: 16, alignItems: "center", marginBottom: 18 },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5 },
  tile: { width: "47%", borderWidth: 1, borderRadius: 18, padding: 14, margin: 5 },
  tileValue: { fontSize: 20, fontWeight: "900" },
  tileLabel: { fontSize: 11, fontWeight: "900", textTransform: "uppercase", marginTop: 4 },
  card: { borderWidth: 1, borderRadius: 22, padding: 18, marginTop: 12 },
  cardTitle: { fontSize: 18, fontWeight: "900", marginBottom: 10 },
  metricRow: { marginBottom: 12 },
  lineStrong: { fontSize: 14, lineHeight: 21, fontWeight: "900" },
  line: { fontSize: 13, lineHeight: 21, fontWeight: "700" },
  progressTrack: { height: 8, borderRadius: 999, overflow: "hidden", marginTop: 7, marginBottom: 4 },
  progressFill: { height: "100%", borderRadius: 999 },
});
