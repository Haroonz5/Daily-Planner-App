import { useRouter } from "expo-router";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  sendEmailVerification,
} from "firebase/auth";
import { doc, getDoc, writeBatch } from "firebase/firestore";
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

import { useAppTheme } from "@/constants/appTheme";
import { Colors } from "@/constants/theme";
import {
  getEmailValidationError,
  normalizeEmail,
} from "@/utils/email-validation";
import { getUsernameError, normalizeUsername } from "@/utils/usernames";
import { auth, db } from "../constants/firebaseConfig";

export default function Signup() {
  const router = useRouter();
  const { themeName } = useAppTheme();
  const colors = Colors[themeName];

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignup = async () => {
    if (!email.trim() || !username.trim() || !password.trim()) {
      setError("Please enter your email, username, and password");
      return;
    }

    const normalizedUsername = normalizeUsername(username);
    const usernameError = getUsernameError(normalizedUsername);
    if (usernameError) {
      setError(usernameError);
      return;
    }

    if (password.trim().length < 6) {
      setError("Password should be at least 6 characters");
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const emailError = getEmailValidationError(normalizedEmail);
    if (emailError) {
      setError(emailError);
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");

      const credential = await createUserWithEmailAndPassword(
        auth,
        normalizedEmail,
        password
      );
      const usernameRef = doc(db, "publicUsernames", normalizedUsername);
      const usernameSnapshot = await getDoc(usernameRef);
      const usernameOwner = usernameSnapshot.data()?.uid;

      if (usernameSnapshot.exists() && usernameOwner !== credential.user.uid) {
        await deleteUser(credential.user).catch(() => {});
        setError("That username is already taken. Pick another one.");
        return;
      }

      // I create both the private profile and the public username reservation
      // here so friends can find each other by username instead of exposing email.
      const batch = writeBatch(db);
      batch.set(
        doc(db, "users", credential.user.uid),
        {
          createdAt: new Date(),
          email: normalizedEmail,
          username: normalizedUsername,
          displayName: normalizedUsername,
          tutorialCompleted: false,
        },
        { merge: true }
      );
      batch.set(
        doc(db, "publicProfiles", credential.user.uid),
        {
          uid: credential.user.uid,
          email: normalizedEmail,
          username: normalizedUsername,
          displayName: normalizedUsername,
          updatedAt: new Date(),
        },
        { merge: true }
      );
      batch.set(usernameRef, {
        uid: credential.user.uid,
        email: normalizedEmail,
        username: normalizedUsername,
        createdAt: new Date(),
      });

      try {
        await batch.commit();
      } catch (profileError) {
        // I reserve usernames after Firebase Auth creates the user because
        // Firestore rules correctly block anonymous reads of publicUsernames.
        // If the reservation fails, this fresh auth account is deleted so the
        // tester can immediately retry with another username.
        await deleteUser(credential.user).catch(() => {});

        const code =
          typeof profileError === "object" &&
          profileError &&
          "code" in profileError
            ? String((profileError as { code?: string }).code)
            : "";

        setError(
          code.includes("permission-denied")
            ? "That username may already be taken, or the latest Firestore rules need to be deployed."
            : "Could not save your profile. Try another username."
        );
        return;
      }

      await sendEmailVerification(credential.user).catch(() => {});

      router.replace("/verify-email" as never);
    } catch (signupError) {
      const code =
        typeof signupError === "object" && signupError && "code" in signupError
          ? String((signupError as { code?: string }).code)
          : "";

      if (code.includes("email-already-in-use")) {
        setError("That email already has an account. Try logging in instead.");
        return;
      }
      if (code.includes("invalid-email")) {
        setError("Enter a valid email address.");
        return;
      }
      if (code.includes("weak-password")) {
        setError("Password should be at least 6 characters.");
        return;
      }

      setError("Could not create account. Try again.");
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
          <Text style={styles.emoji}>✨</Text>
          <Text style={[styles.title, { color: colors.text }]}>Get Started</Text>
          <Text style={[styles.subtitle, { color: colors.subtle }]}>
            Your productive life starts here.
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

          <Text style={[styles.label, { color: colors.subtle }]}>Username</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            placeholder="@haroon"
            placeholderTextColor={colors.subtle}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
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
            style={[styles.button, { backgroundColor: colors.tint }, isSubmitting && styles.buttonDisabled]}
            onPress={handleSignup}
            disabled={isSubmitting}
          >
            <Text style={styles.buttonText}>
              {isSubmitting ? "Creating Account..." : "Create Account"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push("/login")}>
            <Text style={[styles.link, { color: colors.subtle }]}>
              Already have an account?{" "}
              <Text style={[styles.linkBold, { color: colors.tint }]}>Log In</Text>
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
});
