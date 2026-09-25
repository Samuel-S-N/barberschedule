import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Button, Linking, ScrollView, StyleSheet, Text, View } from "react-native";

import { errorMessage } from "../../src/i18n/errors";
import { buildWhatsAppRecurrenceConflictUrl, listOwnerRecurrenceConflicts } from "../../src/features/recurrence/api";
import type { RecurrenceConflict } from "../../src/features/recurrence/types";
import { useSupabaseSession } from "../../src/providers/AppProviders";
import { Screen } from "../../src/components/ui/Screen";

type ShopRow = { id: string };

export default function RecurrenceConflictsScreen() {
  const { t } = useTranslation();
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
        if (!shopId) {
          if (active) setFeedback(t("common.noShop"));
          return;
        }
        const nextConflicts = await listOwnerRecurrenceConflicts(supabase, shopId);
        if (active) setConflicts(nextConflicts);
      } catch (error) {
        if (active) setFeedback(errorMessage(error, t as never, t("owner.conflicts.loadError")));
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
      setFeedback(t("owner.conflicts.noPhone"));
      return;
    }
    await Linking.openURL(url);
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>{t("owner.conflicts.title")}</Text>
        <Link href="/monthly-customers" style={styles.link}>{t("owner.conflicts.back")}</Link>
        <Text style={styles.note}>{t("owner.conflicts.note")}</Text>
        {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
        {isLoading ? <ActivityIndicator /> : null}
        {conflicts.map((conflict) => <View key={conflict.id} style={styles.card}>
          <Text style={styles.name}>{conflict.customerName} · {conflict.serviceName}</Text>
          <Text>{conflict.occurrenceDate} · {conflict.localStartTime} · {conflict.reason} · {conflict.status}</Text>
          <Button onPress={() => void openWhatsApp(conflict)} title={t("owner.conflicts.openWhatsApp")} />
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
