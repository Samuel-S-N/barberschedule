import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { BarberCard } from "../../../../src/components/domain/BarberCard";
import { EmptyState } from "../../../../src/components/domain/EmptyState";
import { ErrorRetry } from "../../../../src/components/domain/ErrorRetry";
import { SkeletonBlock } from "../../../../src/components/domain/SkeletonLoader";
import { listPublicBarbers } from "../../../../src/features/barbers/api";
import { useRefresh } from "../../../../src/lib/use-refresh";
import { useSupabaseSession } from "../../../../src/providers/AppProviders";
import { Screen } from "../../../../src/components/ui/Screen";

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default function BookBarberScreen() {
  const { shopId: rawShopId } = useLocalSearchParams<{ shopId?: string }>();
  const shopId = param(rawShopId);
  const router = useRouter();
  const { t } = useTranslation();
  const { supabase } = useSupabaseSession();
  const barbers = useQuery({
    enabled: Boolean(shopId),
    queryFn: () => listPublicBarbers(supabase, shopId),
    queryKey: ["public-barbers", shopId],
  });

  const refresh = useRefresh([barbers.refetch]);

  return (
    <Screen edges={["top", "left", "right"]} className="flex-1 bg-canvas">
      <ScrollView className="flex-1" refreshControl={<RefreshControl onRefresh={refresh.onRefresh} refreshing={refresh.refreshing} />}>
      <View className="items-center gap-4 p-5">
        <Text accessibilityRole="header" className="w-full max-w-[420px] text-3xl font-display-bold text-ink">
          {t("book.barberTitle")}
        </Text>
        <View className="w-full max-w-[420px] gap-3">
          {barbers.isLoading ? (
            <>
              <SkeletonBlock height={72} width={320} />
              <SkeletonBlock height={72} width={320} />
            </>
          ) : null}
          {barbers.error ? (
            <ErrorRetry message={t("book.barbersError")} onRetry={() => void barbers.refetch()} testID="barbers-retry" />
          ) : null}
          {!barbers.isLoading && !barbers.error && barbers.data?.length === 0 ? (
            <EmptyState title={t("book.noBarbers")} />
          ) : null}
          {barbers.data?.map((barber) => (
            <BarberCard
              key={barber.id}
              name={barber.name}
              onPress={() => router.push(
                `/book/service?shopId=${encodeURIComponent(shopId)}&barberId=${encodeURIComponent(barber.id)}`,
              )}
              testID={`barber-card-${barber.id}`}
            />
          ))}
        </View>
      </View>
      </ScrollView>
    </Screen>
  );
}
