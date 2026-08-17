import { Link } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Button, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";

import { requestPasswordReset } from "../../src/features/auth/api";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function ForgotPasswordScreen() {
  const { isLoading, supabase } = useSupabaseSession();
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    if (!email.trim()) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      await requestPasswordReset(supabase, email.trim());
      setFeedback("Password reset email sent.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to send reset email.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>Reset password</Text>
        <Text style={styles.subtitle}>We will send a reset link if the account exists.</Text>
        <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" onChangeText={setEmail} placeholder="Email" style={styles.input} value={email} />
        {feedback ? <Text>{feedback}</Text> : null}
        {isLoading || isSubmitting ? <ActivityIndicator /> : null}
        <Button disabled={!email.trim() || isLoading || isSubmitting} onPress={submit} title="Send reset email" />
        <Link href="/login" style={styles.link}>Back to sign in</Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, maxWidth: 360, width: "100%" },
  input: { borderColor: "#d1d5db", borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  link: { color: "#2563eb", textAlign: "center" },
  screen: { alignItems: "center", backgroundColor: "#fff", flex: 1, justifyContent: "center", padding: 24 },
  subtitle: { color: "#4b5563", textAlign: "center" },
  title: { color: "#111827", fontSize: 28, fontWeight: "700", textAlign: "center" },
});
