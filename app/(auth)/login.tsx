import { Link } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Button,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  requestPasswordReset,
  signInWithPassword,
} from "../../src/features/auth/api";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function LoginScreen() {
  const { isLoading, supabase } = useSupabaseSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canSubmit = useMemo(
    () => email.trim().length > 0 && password.length > 0,
    [email, password],
  );

  const handleSignIn = async () => {
    setIsSubmitting(true);
    setFeedback(null);

    try {
      await signInWithPassword(supabase, email.trim(), password);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    setIsSubmitting(true);
    setFeedback(null);

    try {
      await requestPasswordReset(supabase, email.trim());
      setFeedback("Password reset email sent.");
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Unable to send reset email.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>
          Sign in
        </Text>
        <Text style={styles.subtitle}>
          Use the same Barberschedule account on Web, iOS, or Android.
        </Text>
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="Email"
          style={styles.input}
          value={email}
        />
        <TextInput
          autoCapitalize="none"
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
          style={styles.input}
          value={password}
        />
        {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
        {isLoading || isSubmitting ? <ActivityIndicator /> : null}
        <Button disabled={!canSubmit || isLoading || isSubmitting} onPress={handleSignIn} title="Sign in" />
        <Button disabled={email.trim().length === 0 || isLoading || isSubmitting} onPress={handlePasswordReset} title="Forgot password?" />
        <Link href="/forgot-password" style={styles.link}>Open reset page</Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    maxWidth: 360,
    width: "100%",
  },
  feedback: {
    color: "#1f2937",
    textAlign: "center",
  },
  input: {
    borderColor: "#d1d5db",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  link: { color: "#2563eb", textAlign: "center" },
  screen: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  subtitle: {
    color: "#4b5563",
    textAlign: "center",
  },
  title: {
    color: "#111827",
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
  },
});
