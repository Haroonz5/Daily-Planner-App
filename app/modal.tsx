import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function ModalScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🌙</Text>
      <Text style={styles.title}>Nothing here yet</Text>
      <Text style={styles.subtitle}>
        This screen is available if you want to turn it into settings, onboarding,
        or a future focus mode.
      </Text>

      <TouchableOpacity style={styles.button} onPress={() => router.replace("/(tabs)")}>
        <Text style={styles.buttonText}>Back to Today</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fdf6ff",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#4a3f55",
    marginBottom: 10,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: "#9b8aa8",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  button: {
    backgroundColor: "#c4a8d4",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});
