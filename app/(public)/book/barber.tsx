import { useQuery } from "@tanstack/react-query";
import { Link, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { listPublicBarbers } from "../../../src/features/barbers/api";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default function BookBarberScreen() {
  const { shopId: rawShopId } = useLocalSearchParams<{ shopId?: string }>();
  const shopId = param(rawShopId);
  const { supabase } = useSupabaseSession();
  const barbers = useQuery({
    enabled: Boolean(shopId),
    queryFn: () => listPublicBarbers(supabase, shopId),
    queryKey: ["public-barbers", shopId],
  });

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Choose your barber</Text>
        {barbers.isLoading ? <ActivityIndicator /> : null}
        {barbers.error ? <Text>Unable to load barbers.</Text> : null}
        {barbers.data?.map((barber) => (
          <Link key={barber.id} href={`/book/service?shopId=${encodeURIComponent(shopId)}&barberId=${encodeURIComponent(barber.id)}`} style={styles.link}>
            {barber.name}
          </Link>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, maxWidth: 420, width: "100%" },
  link: { color: "#2563eb", fontSize: 16 },
  screen: { alignItems: "center", backgroundColor: "#fff", flex: 1, justifyContent: "center", padding: 24 },
  title: { color: "#111827", fontSize: 28, fontWeight: "700" },
});
