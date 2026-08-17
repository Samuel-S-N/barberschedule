import { Link, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default function BookDateScreen() {
  const params = useLocalSearchParams<{ barberId?: string; barberServiceId?: string; shopId?: string }>();
  const [localDate, setLocalDate] = useState("");
  const barberId = param(params.barberId);
  const barberServiceId = param(params.barberServiceId);
  const shopId = param(params.shopId);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(localDate);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Choose a date</Text>
        <TextInput
          autoCapitalize="none"
          onChangeText={setLocalDate}
          placeholder="Local date (YYYY-MM-DD)"
          style={styles.input}
          value={localDate}
        />
        {validDate ? (
          <Link href={`/book/review?shopId=${encodeURIComponent(shopId)}&barberId=${encodeURIComponent(barberId)}&barberServiceId=${encodeURIComponent(barberServiceId)}&localDate=${encodeURIComponent(localDate)}`} style={styles.link}>
            Continue to review
          </Link>
        ) : <Text>Enter a date as YYYY-MM-DD.</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, maxWidth: 420, width: "100%" },
  input: { borderColor: "#d1d5db", borderRadius: 8, borderWidth: 1, padding: 12 },
  link: { color: "#2563eb", fontSize: 16 },
  screen: { alignItems: "center", backgroundColor: "#fff", flex: 1, justifyContent: "center", padding: 24 },
  title: { color: "#111827", fontSize: 28, fontWeight: "700" },
});
