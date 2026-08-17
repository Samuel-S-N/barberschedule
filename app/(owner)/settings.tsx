import { Button, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { useState } from "react";

import { signOut } from "../../src/features/auth/api";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function OwnerSettingsScreen() {
  const { profile, supabase } = useSupabaseSession();
  const [feedback, setFeedback] = useState<string | null>(null);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Owner settings</Text>
        <Text>Signed in as {profile?.fullName ?? "Owner"}.</Text>
        <Text>Shop timezone: America/Sao_Paulo</Text>
        <Text style={styles.note}>Business settings remain database-owned; release configuration is documented in docs/release.md.</Text>
        {feedback ? <Text>{feedback}</Text> : null}
        <Button onPress={async () => { try { await signOut(supabase); } catch (error) { setFeedback(error instanceof Error ? error.message : "Unable to sign out."); } }} title="Sign out" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, maxWidth: 520, width: "100%" },
  note: { color: "#4b5563" },
  screen: { alignItems: "center", backgroundColor: "#fff", flex: 1, padding: 24 },
  title: { color: "#111827", fontSize: 28, fontWeight: "700" },
});
