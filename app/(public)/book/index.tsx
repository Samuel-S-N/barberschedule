import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { SafeAreaView, Text, View } from "react-native";

import { EmptyState } from "../../../src/components/domain/EmptyState";
import { SkeletonBlock } from "../../../src/components/domain/SkeletonLoader";
import { Button } from "../../../src/components/ui/Button";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

type Shop = { id: string; name: string };

export default function BookIndexScreen() {
  const router = useRouter();
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
    <SafeAreaView className="flex-1 bg-canvas">
      <View className="flex-1 items-center gap-4 p-5">
        <Text accessibilityRole="header" className="w-full max-w-[420px] text-3xl font-display-bold text-ink">
          Book an appointment
        </Text>
        <View className="w-full max-w-[420px] gap-3">
          {shops.isLoading ? (
            <>
              <SkeletonBlock height={60} width={320} />
              <SkeletonBlock height={60} width={320} />
              <SkeletonBlock height={60} width={320} />
            </>
          ) : null}
          {shops.error ? (
            <Text className="text-sm font-sans text-danger-500">Unable to load shops.</Text>
          ) : null}
          {!shops.isLoading && !shops.error && shops.data?.length === 0 ? (
            <EmptyState title="No shops available" />
          ) : null}
          {shops.data?.map((shop) => (
            <Button
              key={shop.id}
              label={`Start booking at ${shop.name}`}
              onPress={() => router.push(`/book/barber?shopId=${encodeURIComponent(shop.id)}`)}
              size="lg"
              variant="primary"
            />
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}
