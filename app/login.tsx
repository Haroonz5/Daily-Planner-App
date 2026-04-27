import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useAppTheme } from "@/constants/appTheme";
import { Colors } from "@/constants/theme";
import { auth } from "../constants/firebaseConfig";

export default function Login() {
  const router = useRouter();
  const { themeName } = useAppTheme();
  const colors = Colors[themeName];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadSavedEmail = async () => {
      const saved = await AsyncStorage.getItem("savedEmail");
      if (saved) {
        setEmail(saved);
        setRememberMe(true);
      }
    };

    loadSavedEmail();
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password");
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");

      const normalizedEmail = email.trim().toLowerCase();
      await signInWithEmailAndPassword(auth, normalizedEmail, password);

      if (rememberMe) {
        await AsyncStorage.setItem("savedEmail", normalizedEmail);
      } else {
        await AsyncStorage.removeItem("savedEmail");
      }

      router.replace("/(tabs)");
    } catch {
      setError("Invalid email or password");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <View style={styles.headerContainer}>
          <Text style={styles.emoji}>🌸</Text>
          <Text style={[styles.title, { color: colors.text }]}>Daily Planner</Text>
          <Text style={[styles.subtitle, { color: colors.subtle }]}>
            Plan today. Own tomorrow.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.tint }]}>
          <Text style={[styles.label, { color: colors.subtle }]}>Email</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            placeholder="you@email.com"
            placeholderTextColor={colors.subtle}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />

          <Text style={[styles.label, { color: colors.subtle }]}>Password</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            placeholder="••••••••"
            placeholderTextColor={colors.subtle}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

          <TouchableOpacity
            style={styles.rememberMe}
            onPress={() => setRememberMe((prev) => !prev)}
          >
            <View
              style={[
                styles.rememberBox,
                { borderColor: colors.tint },
                rememberMe && { backgroundColor: colors.tint },
              ]}
            >
              {rememberMe && <Text style={styles.rememberCheck}>✓</Text>}
            </View>
            <Text style={[styles.rememberText, { color: colors.subtle }]}>
              Remember Me
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.tint }, isSubmitting && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={isSubmitting}
          >
            <Text style={styles.buttonText}>
              {isSubmitting ? "Logging In..." : "Log In"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push("/signup")}>
            <Text style={[styles.link, { color: colors.subtle }]}>
              Don&apos;t have an account?{" "}
              <Text style={[styles.linkBold, { color: colors.tint }]}>Sign Up</Text>
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
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 6,
  },
  card: {
    borderRadius: 24,
    padding: 24,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    marginLeft: 4,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  input: {
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    marginBottom: 16,
    borderWidth: 1,
  },
  button: {
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
    fontSize: 14,
  },
  linkBold: {
    fontWeight: "700",
  },
  error: {
    marginBottom: 12,
    fontSize: 13,
    textAlign: "center",
  },
  rememberMe: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  rememberBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  rememberCheck: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  rememberText: {
    fontSize: 14,
  },
});
