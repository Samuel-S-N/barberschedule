import { Link } from "expo-router";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import { Screen } from "../../src/components/ui/Screen";

export default function OwnerHomeScreen() {
  const { t } = useTranslation();

  return (
    <Screen style={styles.screen}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>{t("owner.workspace.title")}</Text>
        <Link href="/agenda" style={styles.link}>{t("owner.workspace.agenda")}</Link>
        <Link href="/customers" style={styles.link}>{t("owner.workspace.customers")}</Link>
        <Link href="/monthly-customers" style={styles.link}>{t("owner.workspace.recurring")}</Link>
        <Link href="/schedule" style={styles.link}>{t("owner.workspace.schedule")}</Link>
        <Link href="/settings" style={styles.link}>{t("owner.workspace.settings")}</Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, maxWidth: 520, width: "100%" },
  link: { color: "#2563eb", fontSize: 16 },
  screen: { alignItems: "center", backgroundColor: "#fff", flex: 1, padding: 24 },
  title: { color: "#111827", fontSize: 28, fontWeight: "700" },
});
