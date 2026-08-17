import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { useSupabaseSession } from "../../../src/providers/AppProviders";

type Shop = { id: string; name: string };

export default function BookIndexScreen() {
  const { supabase } = useSupabaseSession();
  const shops = useQuery({
    queryFn: async () => {
      const { data, error } = await supabase.from("shops").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Shop[];
    },
    queryKey: ["public-shops"],
  });

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Book an appointment</Text>
        {shops.isLoading ? <ActivityIndicator /> : null}
        {shops.error ? <Text>Unable to load shops.</Text> : null}
        {shops.data?.map((shop) => (
          <Link key={shop.id} href={`/book/barber?shopId=${encodeURIComponent(shop.id)}`} style={styles.link}>
            Start booking at {shop.name}
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
