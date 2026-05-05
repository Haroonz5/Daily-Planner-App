import { useRouter } from "expo-router";
import { sendEmailVerification, signOut } from "firebase/auth";
import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useAppTheme } from "@/constants/appTheme";
import { Colors } from "@/constants/theme";
import { auth } from "@/constants/firebaseConfig";

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { themeName } = useAppTheme();
  const colors = Colors[themeName];
  const [message, setMessage] = useState(
    "We sent a verification link to your email."
  );
  const [busy, setBusy] = useState(false);

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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={styles.icon}>✉️</Text>
        <Text style={[styles.title, { color: colors.text }]}>
          Verify Your Email
        </Text>
        <Text style={[styles.body, { color: colors.subtle }]}>{message}</Text>
        <Text style={[styles.body, { color: colors.subtle }]}>
          This is the second account check before the app opens. It protects
          usernames, friends, and progress from fake signups.
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
  link: {
    fontSize: 13,
    fontWeight: "800",
    marginTop: 18,
  },
});
