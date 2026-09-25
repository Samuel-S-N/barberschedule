import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Button, Linking, ScrollView, StyleSheet, Text, View } from "react-native";

import { buildWhatsAppRecurrenceConflictUrl, listOwnerRecurrenceConflicts } from "../../src/features/recurrence/api";
import type { RecurrenceConflict } from "../../src/features/recurrence/types";
import { useSupabaseSession } from "../../src/providers/AppProviders";
import { Screen } from "../../src/components/ui/Screen";

type ShopRow = { id: string };

export default function RecurrenceConflictsScreen() {
  const { supabase } = useSupabaseSession();
  const [conflicts, setConflicts] = useState<RecurrenceConflict[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { data, error } = await supabase.from("shops").select("id").order("name", { ascending: true });
        if (error) throw error;
        const shopId = (data as ShopRow[] | null)?.[0]?.id;
        if (!shopId) throw new Error("No shop found.");
        const nextConflicts = await listOwnerRecurrenceConflicts(supabase, shopId);
        if (active) setConflicts(nextConflicts);
      } catch (error) {
        if (active) setFeedback(error instanceof Error ? error.message : "Unable to load recurrence conflicts.");
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [supabase]);

  const openWhatsApp = async (conflict: RecurrenceConflict) => {
    const url = buildWhatsAppRecurrenceConflictUrl({
      customerName: conflict.customerName,
      localDate: conflict.occurrenceDate,
      phone: conflict.customerPhone,
      serviceName: conflict.serviceName,
    });
    if (!url) {
      setFeedback("This customer has no phone number for WhatsApp.");
      return;
    }
    await Linking.openURL(url);
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Recurrence conflicts</Text>
        <Link href="/monthly-customers" style={styles.link}>Back to recurring customers</Link>
        <Text style={styles.note}>Conflicts stay at their original local date/time; choose any replacement manually after contacting the customer.</Text>
        {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
        {isLoading ? <ActivityIndicator /> : null}
        {conflicts.map((conflict) => <View key={conflict.id} style={styles.card}>
          <Text style={styles.name}>{conflict.customerName} · {conflict.serviceName}</Text>
          <Text>{conflict.occurrenceDate} · {conflict.localStartTime} · {conflict.reason} · {conflict.status}</Text>
          <Button onPress={() => void openWhatsApp(conflict)} title="Open WhatsApp" />
        </View>)}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderColor: "#d1d5db", borderRadius: 12, borderWidth: 1, gap: 8, padding: 12 },
  content: { gap: 12, padding: 24 },
  feedback: { color: "#b91c1c" },
  link: { color: "#2563eb", fontSize: 16 },
  name: { color: "#111827", fontSize: 16, fontWeight: "600" },
  note: { color: "#4b5563" },
  screen: { backgroundColor: "#fff", flex: 1 },
  title: { color: "#111827", fontSize: 28, fontWeight: "700" },
});
