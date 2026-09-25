import { Link, Redirect } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, StyleSheet, Text, View } from "react-native";

import { signOut } from "../src/features/auth/api";
import { errorMessage } from "../src/i18n/errors";
import { useSupabaseSession } from "../src/providers/AppProviders";
import { Screen } from "../src/components/ui/Screen";

export default function HomeScreen() {
  const { t } = useTranslation();
  const { profile, supabase } = useSupabaseSession();
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSignOut = async () => {
    try {
      setFeedback(null);
      await signOut(supabase);
    } catch (error) {
      setFeedback(errorMessage(error, t as never, t("profile.signOutError")));
    }
  };

  if (profile?.role === "customer") {
    return <Redirect href="/home" />;
  }

  return (
    <Screen style={styles.screen}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {t("owner.hub.title")}
        </Text>
        <Text style={styles.subtitle}>
          {t("owner.hub.signedInAs", { role: t(profile?.role === "owner" ? "owner.roles.owner" : "owner.roles.account") })}
        </Text>
        {profile?.role === "owner" ? (
          <View style={styles.links}>
            <Link href="/barbers" style={styles.link}>
              {t("owner.hub.manageBarbers")}
            </Link>
            <Link href="/services" style={styles.link}>
              {t("owner.hub.manageServices")}
            </Link>
            <Link href="/customers" style={styles.link}>
              {t("owner.hub.manageCustomers")}
            </Link>
            <Link href="/schedule" style={styles.link}>
              {t("owner.hub.manageSchedule")}
            </Link>
            <Link href="/agenda" style={styles.link}>
              {t("owner.hub.manageAgenda")}
            </Link>
            <Link href="/settings" style={styles.link}>
              {t("owner.hub.settings")}
            </Link>
          </View>
        ) : null}
        {feedback ? <Text style={styles.subtitle}>{feedback}</Text> : null}
        <Button onPress={handleSignOut} title={t("common.signOut")} />
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
