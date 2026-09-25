import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { BarberCard } from "../../../src/components/domain/BarberCard";
import { EmptyState } from "../../../src/components/domain/EmptyState";
import { SkeletonBlock } from "../../../src/components/domain/SkeletonLoader";
import { listPublicBarbers } from "../../../src/features/barbers/api";
import { useSupabaseSession } from "../../../src/providers/AppProviders";
import { Screen } from "../../../src/components/ui/Screen";

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

  return (
    <Screen edges={["top", "left", "right"]} className="flex-1 bg-canvas">
      <View className="flex-1 items-center gap-4 p-5">
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
            <Text className="text-sm font-sans text-danger-500">{t("book.barbersError")}</Text>
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
    </Screen>
  );
}
