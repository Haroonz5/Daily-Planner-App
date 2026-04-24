import { useRouter } from "expo-router";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth } from "../constants/firebaseConfig";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleSignup = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password");
      return;
    }

    if (password.trim().length < 6) {
      setError("Password should be at least 6 characters");
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");

      const normalizedEmail = email.trim().toLowerCase();
      await createUserWithEmailAndPassword(auth, normalizedEmail, password);

      router.replace("/(tabs)");
    } catch {
      setError("Could not create account. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <View style={styles.headerContainer}>
          <Text style={styles.emoji}>✨</Text>
          <Text style={styles.title}>Get Started</Text>
          <Text style={styles.subtitle}>Your productive life starts here.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@email.com"
            placeholderTextColor="#c4b5c8"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#c4b5c8"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, isSubmitting && styles.buttonDisabled]}
            onPress={handleSignup}
            disabled={isSubmitting}
          >
            <Text style={styles.buttonText}>
              {isSubmitting ? "Creating Account..." : "Create Account"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push("/login")}>
            <Text style={styles.link}>
              Already have an account? <Text style={styles.linkBold}>Log In</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fdf6ff",
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  headerContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#4a3f55",
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    color: "#9b8aa8",
    marginTop: 6,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#c4a8d4",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9b8aa8",
    marginBottom: 6,
    marginLeft: 4,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: "#fdf6ff",
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: "#4a3f55",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e8d8f0",
  },
  button: {
    backgroundColor: "#c4a8d4",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: 0.5,
  },
  link: {
    textAlign: "center",
    color: "#9b8aa8",
    fontSize: 14,
  },
  linkBold: {
    fontWeight: "700",
    color: "#c4a8d4",
  },
  error: {
    color: "#e07a9b",
    marginBottom: 12,
    fontSize: 13,
    textAlign: "center",
  },
});
