import { useRouter } from "expo-router";
import {
  getMultiFactorResolver,
  type MultiFactorResolver,
  sendEmailVerification,
  signInWithEmailAndPassword,
  TotpMultiFactorGenerator,
  type User,
} from "firebase/auth";
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
import {
  getEmailValidationError,
  normalizeEmail,
} from "@/utils/email-validation";
import { getSecureItem, removeSecureItem, setSecureItem } from "@/utils/secure-storage";
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
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(
    null
  );
  const [mfaCode, setMfaCode] = useState("");

  useEffect(() => {
    const loadSavedEmail = async () => {
      const saved = await getSecureItem("savedEmail");
      if (saved) {
        setEmail(saved);
        setRememberMe(true);
      }
    };

    loadSavedEmail();
  }, []);

  const finishSignIn = async (user: User, normalizedEmail: string) => {
    if (!user.emailVerified) {
      // Keep the user signed in so Verify Email can resend, check, or skip.
      // Signing out here caused a flash to Verify Email and then a bounce
      // straight back to Login.
      await sendEmailVerification(user).catch(() => {});
      if (rememberMe) {
        await setSecureItem("savedEmail", normalizedEmail);
      }
      router.replace("/verify-email" as never);
      return;
    }

    if (rememberMe) {
      await setSecureItem("savedEmail", normalizedEmail);
    } else {
      await removeSecureItem("savedEmail");
    }

    router.replace("/(tabs)");
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password");
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

      const credential = await signInWithEmailAndPassword(
        auth,
        normalizedEmail,
        password
      );

      await finishSignIn(credential.user, normalizedEmail);
    } catch (loginError) {
      const code =
        typeof loginError === "object" && loginError && "code" in loginError
          ? String((loginError as { code?: string }).code)
          : "";

      if (code === "auth/multi-factor-auth-required") {
        const resolver = getMultiFactorResolver(auth, loginError as never);
        const hasTotpFactor = resolver.hints.some(
          (hint) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID
        );

        if (!hasTotpFactor) {
          setError(
            "This account has a second factor that this app cannot finish yet."
          );
          return;
        }

        // I keep the MFA resolver in state so the second screen can finish the
        // same Firebase sign-in attempt instead of asking for the password again.
        setMfaResolver(resolver);
        setMfaCode("");
        setError("Enter the 6-digit code from your authenticator app.");
        return;
      }

      setError("Invalid email or password");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMfaConfirm = async () => {
    const code = mfaCode.replace(/\s/g, "");
    const normalizedEmail = normalizeEmail(email);
    if (!mfaResolver || code.length < 6) {
      setError("Enter the 6-digit authenticator code first.");
      return;
    }

    const hint = mfaResolver.hints.find(
      (item) => item.factorId === TotpMultiFactorGenerator.FACTOR_ID
    );
    if (!hint) {
      setError("No authenticator app is available for this account.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");

      const assertion = TotpMultiFactorGenerator.assertionForSignIn(
        hint.uid,
        code
      );
      const credential = await mfaResolver.resolveSignIn(assertion);
      setMfaResolver(null);
      setMfaCode("");
      await finishSignIn(credential.user, normalizedEmail);
    } catch {
      setError("That authenticator code did not work. Try the newest code.");
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

          {mfaResolver ? (
            <View
              style={[
                styles.mfaPanel,
                { backgroundColor: colors.background, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.mfaTitle, { color: colors.text }]}>
                Two-Factor Code
              </Text>
              <Text style={[styles.mfaBody, { color: colors.subtle }]}>
                Open your authenticator app and enter the current 6-digit code.
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    color: colors.text,
                    marginBottom: 10,
                  },
                ]}
                placeholder="123456"
                placeholderTextColor={colors.subtle}
                value={mfaCode}
                onChangeText={setMfaCode}
                keyboardType="number-pad"
                maxLength={8}
              />
              <TouchableOpacity
                style={[
                  styles.button,
                  { backgroundColor: colors.tint, marginBottom: 0 },
                  isSubmitting && styles.buttonDisabled,
                ]}
                onPress={handleMfaConfirm}
                disabled={isSubmitting}
                accessibilityRole="button"
                accessibilityLabel="Confirm two factor authentication code"
              >
                <Text style={styles.buttonText}>
                  {isSubmitting ? "Confirming..." : "Confirm Code"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

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
            accessibilityRole="button"
            accessibilityLabel="Log in"
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
  mfaPanel: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
  },
  mfaTitle: {
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 5,
  },
  mfaBody: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
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
