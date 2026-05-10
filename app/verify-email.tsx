import { useRouter } from "expo-router";
import { sendEmailVerification, signOut } from "firebase/auth";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useAppTheme } from "@/constants/appTheme";
import { Colors } from "@/constants/theme";
import { setEmailVerificationSkipped } from "@/utils/email-verification";
import { auth } from "@/constants/firebaseConfig";

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { themeName } = useAppTheme();
  const colors = Colors[themeName];
  const [message, setMessage] = useState(
    "Sending a verification link to your email..."
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setMessage("Sign in again so we can send the verification email.");
      return;
    }

    // I send this from the Verify screen too, so login/signup can hand off here
    // cleanly and testers always have a visible place to resend or skip.
    sendEmailVerification(user)
      .then(() => {
        setMessage("Verification email sent. Check your inbox and spam folder.");
      })
      .catch(() => {
        setMessage(
          "If an email was sent recently, Firebase may rate-limit another one. Check your inbox or try resend in a minute."
        );
      });
  }, []);

  const resendVerification = async () => {
    const user = auth.currentUser;
    if (!user || busy) return;

    setBusy(true);
    try {
      await sendEmailVerification(user);
      setMessage("Verification email sent again. Check your inbox and spam.");
    } finally {
      setBusy(false);
    }
  };

  const checkVerification = async () => {
    const user = auth.currentUser;
    if (!user || busy) return;

    setBusy(true);
    try {
      await user.reload();
      if (auth.currentUser?.emailVerified) {
        router.replace("/tutorial" as never);
        return;
      }
      setMessage("Not verified yet. Open the email link, then tap this again.");
    } finally {
      setBusy(false);
    }
  };

  const useAnotherAccount = async () => {
    await signOut(auth);
    router.replace("/login" as never);
  };

  const skipVerificationForNow = async () => {
    const user = auth.currentUser;
    if (!user || busy) return;

    setBusy(true);
    try {
      await setEmailVerificationSkipped(user.uid);
      router.replace("/tutorial" as never);
    } catch {
      setMessage(
        "Skip could not save on this device yet. Reload the app and try Skip Verification again."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={styles.icon}>✉️</Text>
        <Text style={[styles.title, { color: colors.text }]}>
          Verify Your Email
        </Text>
        <Text style={[styles.body, { color: colors.subtle }]}>{message}</Text>
        <Text style={[styles.body, { color: colors.subtle }]}>
          For testing right now, you can skip this step and come back later.
          Production builds should keep verification on.
        </Text>

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.tint }]}
          onPress={checkVerification}
          disabled={busy}
        >
          <Text style={styles.primaryText}>
            {busy ? "Checking..." : "I Verified My Email"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryButton, { backgroundColor: colors.surface }]}
          onPress={resendVerification}
          disabled={busy}
        >
          <Text style={[styles.secondaryText, { color: colors.text }]}>
            Resend Email
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.skipButton,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
          onPress={skipVerificationForNow}
          disabled={busy}
        >
          <Text style={[styles.skipText, { color: colors.warning }]}>
            Skip Verification For Now
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={useAnotherAccount} disabled={busy}>
          <Text style={[styles.link, { color: colors.subtle }]}>
            Use another account
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  card: {
    borderRadius: 26,
    padding: 24,
    alignItems: "center",
  },
  icon: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    marginBottom: 10,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 12,
  },
  primaryButton: {
    width: "100%",
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 8,
  },
  primaryText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
  },
  secondaryButton: {
    width: "100%",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 10,
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: "900",
  },
  skipButton: {
    width: "100%",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 10,
    borderWidth: 1,
  },
  skipText: {
    fontSize: 14,
    fontWeight: "900",
  },
  link: {
    fontSize: 13,
    fontWeight: "800",
    marginTop: 18,
  },
});
