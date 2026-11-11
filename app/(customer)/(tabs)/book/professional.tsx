import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { ProfessionalCard } from "../../../../src/components/domain/ProfessionalCard";
import { EmptyState } from "../../../../src/components/domain/EmptyState";
import { ErrorRetry } from "../../../../src/components/domain/ErrorRetry";
import { SkeletonBlock } from "../../../../src/components/domain/SkeletonLoader";
import { StepIndicator } from "../../../../src/components/domain/StepIndicator";
import { listPublicProfessionals } from "../../../../src/features/professionals/api";
import { useRefresh } from "../../../../src/lib/use-refresh";
import { useSupabaseSession } from "../../../../src/providers/AppProviders";
import { Screen } from "../../../../src/components/ui/Screen";

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default function BookProfessionalScreen() {
  const { shopId: rawShopId } = useLocalSearchParams<{ shopId?: string }>();
  const shopId = param(rawShopId);
  const router = useRouter();
  const { t } = useTranslation();
  const { supabase } = useSupabaseSession();
  const professionals = useQuery({
    enabled: Boolean(shopId),
    queryFn: () => listPublicProfessionals(supabase, shopId),
    queryKey: ["public-professionals", shopId],
  });

  const refresh = useRefresh([professionals.refetch]);

  return (
    <Screen edges={["top", "left", "right"]} className="flex-1 bg-canvas">
      <ScrollView className="flex-1" refreshControl={<RefreshControl onRefresh={refresh.onRefresh} refreshing={refresh.refreshing} />}>
      <View className="items-center gap-4 p-5">
        <Text accessibilityRole="header" className="w-full max-w-[420px] text-3xl leading-[44px] font-display-bold text-ink">
          {t("book.professionalTitle")}
        </Text>
        <StepIndicator current="professional" ids={{ shopId }} />
        <View className="w-full max-w-[420px] gap-3">
          {professionals.isLoading ? (
            <>
              <SkeletonBlock height={72} width={320} />
              <SkeletonBlock height={72} width={320} />
            </>
          ) : null}
          {professionals.error ? (
            <ErrorRetry message={t("book.professionalsError")} onRetry={() => void professionals.refetch()} testID="professionals-retry" />
          ) : null}
          {!professionals.isLoading && !professionals.error && professionals.data?.length === 0 ? (
            <EmptyState title={t("book.noProfessionals")} />
          ) : null}
          {professionals.data?.map((professional) => (
            <ProfessionalCard
              key={professional.id}
              avatarUrl={professional.avatarUrl}
              name={professional.name}
              onPress={() => router.push(
                `/book/service?shopId=${encodeURIComponent(shopId)}&professionalId=${encodeURIComponent(professional.id)}`,
              )}
              testID={`professional-card-${professional.id}`}
            />
          ))}
        </View>
      </View>
      </ScrollView>
    </Screen>
  );
}
