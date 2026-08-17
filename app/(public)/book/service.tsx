import { useQuery } from "@tanstack/react-query";
import { Link, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { useSupabaseSession } from "../../../src/providers/AppProviders";

type BarberServiceRow = { id: string; services: { name: string } | null };

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default function BookServiceScreen() {
  const { barberId: rawBarberId, shopId: rawShopId } = useLocalSearchParams<{ barberId?: string; shopId?: string }>();
  const barberId = param(rawBarberId);
  const shopId = param(rawShopId);
  const { supabase } = useSupabaseSession();
  const services = useQuery({
    enabled: Boolean(barberId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("barber_services")
        .select("id, services(name)")
        .eq("barber_id", barberId)
        .order("id");
      if (error) throw error;
      return (data ?? []) as unknown as BarberServiceRow[];
    },
    queryKey: ["public-barber-services", barberId],
  });

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Choose a service</Text>
        {services.isLoading ? <ActivityIndicator /> : null}
        {services.error ? <Text>Unable to load services.</Text> : null}
        {services.data?.map((service) => (
          <Link key={service.id} href={`/book/date?shopId=${encodeURIComponent(shopId)}&barberId=${encodeURIComponent(barberId)}&barberServiceId=${encodeURIComponent(service.id)}`} style={styles.link}>
            {service.services?.name ?? "Service"}
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
