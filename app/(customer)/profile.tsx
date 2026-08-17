import { Link } from "expo-router";
import { useState } from "react";
import { Button, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { signOut } from "../../src/features/auth/api";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function CustomerProfileScreen() {
  const { profile, supabase } = useSupabaseSession();
  const [feedback, setFeedback] = useState<string | null>(null);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>My profile</Text>
        <Text>{profile?.fullName ?? "Customer"}</Text>
        <Text>Role: {profile?.role ?? "customer"}</Text>
        <Link href="/appointments" style={styles.link}>My appointments</Link>
        <Link href="/history" style={styles.link}>Appointment history</Link>
        {feedback ? <Text>{feedback}</Text> : null}
        <Button onPress={async () => { try { await signOut(supabase); } catch (error) { setFeedback(error instanceof Error ? error.message : "Unable to sign out."); } }} title="Sign out" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, maxWidth: 520, width: "100%" },
  link: { color: "#2563eb", fontSize: 16 },
  screen: { alignItems: "center", backgroundColor: "#fff", flex: 1, padding: 24 },
  title: { color: "#111827", fontSize: 28, fontWeight: "700" },
});
