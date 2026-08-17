import { Link } from "expo-router";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";

export default function OwnerHomeScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Owner workspace</Text>
        <Link href="/agenda" style={styles.link}>Agenda</Link>
        <Link href="/customers" style={styles.link}>Customers</Link>
        <Link href="/monthly-customers" style={styles.link}>Recurring customers</Link>
        <Link href="/schedule" style={styles.link}>Schedule</Link>
        <Link href="/settings" style={styles.link}>Settings</Link>
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
