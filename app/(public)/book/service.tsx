import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, Text, View } from "react-native";

import { EmptyState } from "../../../src/components/domain/EmptyState";
import { ServiceCard } from "../../../src/components/domain/ServiceCard";
import { SkeletonBlock } from "../../../src/components/domain/SkeletonLoader";
import { resolveEffectiveServiceFields } from "../../../src/features/services/resolve-effective-fields";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

type BarberServiceRow = {
  id: string;
  duration_override_minutes: number | null;
  price_override_cents: number | null;
  services: { name: string; duration_minutes: number; price_cents: number } | null;
};

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default function BookServiceScreen() {
  const { barberId: rawBarberId, shopId: rawShopId } = useLocalSearchParams<{ barberId?: string; shopId?: string }>();
  const barberId = param(rawBarberId);
  const shopId = param(rawShopId);
  const router = useRouter();
  const { supabase } = useSupabaseSession();
  const services = useQuery({
    enabled: Boolean(barberId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("barber_services")
        .select("id, duration_override_minutes, price_override_cents, services(name, duration_minutes, price_cents)")
        .eq("barber_id", barberId)
        .order("id");
      if (error) throw error;
      return (data ?? []) as unknown as BarberServiceRow[];
    },
    queryKey: ["public-barber-services", barberId],
  });

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <View className="flex-1 items-center gap-4 p-5">
        <Text accessibilityRole="header" className="w-full max-w-[420px] text-3xl font-display-bold text-ink">
          Choose a service
        </Text>
        <View className="w-full max-w-[420px] gap-3">
          {services.isLoading ? (
            <>
              <SkeletonBlock height={76} width={320} />
              <SkeletonBlock height={76} width={320} />
            </>
          ) : null}
          {services.error ? (
            <Text className="text-sm font-sans text-danger-500">Unable to load services.</Text>
          ) : null}
          {!services.isLoading && !services.error && services.data?.length === 0 ? (
            <EmptyState title="No services available" />
          ) : null}
          {services.data?.map((service) => {
            const effective = resolveEffectiveServiceFields({
              durationMinutes: service.services?.duration_minutes ?? 0,
              durationOverrideMinutes: service.duration_override_minutes,
              priceCents: service.services?.price_cents ?? 0,
              priceOverrideCents: service.price_override_cents,
            });

            return (
              <ServiceCard
                durationMinutes={effective.durationMinutes}
                key={service.id}
                name={service.services?.name ?? "Service"}
                onPress={() => router.push(
                  `/book/date?shopId=${encodeURIComponent(shopId)}&barberId=${encodeURIComponent(barberId)}&barberServiceId=${encodeURIComponent(service.id)}`,
                )}
                priceCents={effective.priceCents}
                testID={`service-card-${service.id}`}
              />
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}
