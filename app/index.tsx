import { Link, Redirect } from "expo-router";
import { useState } from "react";
import { Button, StyleSheet, Text, View } from "react-native";

import { signOut } from "../src/features/auth/api";
import { useSupabaseSession } from "../src/providers/AppProviders";
import { Screen } from "../src/components/ui/Screen";

export default function HomeScreen() {
  const { profile, supabase } = useSupabaseSession();
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSignOut = async () => {
    try {
      setFeedback(null);
      await signOut(supabase);
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Unable to sign out.",
      );
    }
  };

  if (profile?.role === "customer") {
    return <Redirect href="/home" />;
  }

  return (
    <Screen style={styles.screen}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          Barberschedule MVP
        </Text>
        <Text style={styles.subtitle}>
          Signed in as {profile?.role ?? "account"}.
        </Text>
        {profile?.role === "owner" ? (
          <View style={styles.links}>
            <Link href="/barbers" style={styles.link}>
              Manage barbers
            </Link>
            <Link href="/services" style={styles.link}>
              Manage services
            </Link>
            <Link href="/customers" style={styles.link}>
              Manage customers
            </Link>
            <Link href="/schedule" style={styles.link}>
              Manage schedule
            </Link>
            <Link href="/agenda" style={styles.link}>
              Manage agenda
            </Link>
            <Link href="/settings" style={styles.link}>
              Owner settings
            </Link>
          </View>
        ) : null}
        {feedback ? <Text style={styles.subtitle}>{feedback}</Text> : null}
        <Button onPress={handleSignOut} title="Sign out" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  content: {
    alignItems: "center",
    gap: 8,
  },
  link: {
    color: "#2563eb",
    fontSize: 16,
  },
  links: {
    alignItems: "center",
    gap: 6,
    marginVertical: 8,
  },
  title: {
    color: "#111827",
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    color: "#4b5563",
    fontSize: 16,
    textAlign: "center",
  },
});
