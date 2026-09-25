import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Screen } from "../../src/components/ui/Screen";

export default function OwnerHomeScreen() {
  return (
    <Screen style={styles.screen}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Owner workspace</Text>
        <Link href="/agenda" style={styles.link}>Agenda</Link>
        <Link href="/customers" style={styles.link}>Customers</Link>
        <Link href="/monthly-customers" style={styles.link}>Recurring customers</Link>
        <Link href="/schedule" style={styles.link}>Schedule</Link>
        <Link href="/settings" style={styles.link}>Settings</Link>
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
