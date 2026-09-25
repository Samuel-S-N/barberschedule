import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, StyleSheet, Text, View } from "react-native";

import { Screen } from "../../src/components/ui/Screen";
import { signOut } from "../../src/features/auth/api";
import { errorMessage } from "../../src/i18n/errors";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function OwnerSettingsScreen() {
  const { t } = useTranslation();
  const { profile, supabase } = useSupabaseSession();
  const [feedback, setFeedback] = useState<string | null>(null);

  return (
    <Screen style={styles.screen}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>{t("owner.settings.title")}</Text>
        <Text>{t("owner.settings.signedInAs", { name: profile?.fullName ?? t("owner.settings.ownerFallback") })}</Text>
        <Text>{t("owner.settings.timezone", { timezone: "America/Sao_Paulo" })}</Text>
        <Text style={styles.note}>{t("owner.settings.note")}</Text>
        {feedback ? <Text>{feedback}</Text> : null}
        <Button
          onPress={async () => {
            try {
              await signOut(supabase);
            } catch (error) {
              setFeedback(errorMessage(error, t as never, t("profile.signOutError")));
            }
          }}
          title={t("common.signOut")}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, maxWidth: 520, width: "100%" },
  note: { color: "#4b5563" },
  screen: { alignItems: "center", backgroundColor: "#fff", flex: 1, padding: 24 },
  title: { color: "#111827", fontSize: 28, fontWeight: "700" },
});
