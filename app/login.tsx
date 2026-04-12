import AsyncStorage from '@react-native-async-storage/async-storage';
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
  View
} from "react-native";
import { auth } from "../constants/firebaseConfig";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const router = useRouter();

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
    try {
      await signInWithEmailAndPassword(auth, email, password);
      if (rememberMe) {
        await AsyncStorage.setItem("savedEmail", email);
      } else {
        await AsyncStorage.removeItem("savedEmail");
      }
      router.replace("/(tabs)");
    } catch (e: any) {
      setError("Invalid email or password");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <View style={styles.headerContainer}>
          <Text style={styles.emoji}>🌸</Text>
          <Text style={styles.title}>Daily Planner</Text>
          <Text style={styles.subtitle}>Plan today. Own tomorrow.</Text>
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
            style={styles.rememberMe}
            onPress={() => setRememberMe(!rememberMe)}
          >
            <View style={[styles.rememberBox, rememberMe && styles.rememberBoxChecked]}>
              {rememberMe && <Text style={styles.rememberCheck}>✓</Text>}
            </View>
            <Text style={styles.rememberText}>Remember Me</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={handleLogin}>
            <Text style={styles.buttonText}>Log In</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push("/signup")}>
            <Text style={styles.link}>Don't have an account? <Text style={styles.linkBold}>Sign Up</Text></Text>
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
    borderColor: "#c4a8d4",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  rememberBoxChecked: { backgroundColor: "#c4a8d4" },
  rememberCheck: { color: "#fff", fontSize: 11, fontWeight: "700" },
  rememberText: { color: "#9b8aa8", fontSize: 14 },
});