import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { EmptyState } from "../../src/components/domain/EmptyState";
import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { formatPriceBRL } from "../../src/components/domain/ServiceCard";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { FabAdd } from "../../src/components/ui/FabAdd";
import { Screen } from "../../src/components/ui/Screen";
import { listRecurrencePlans, planTitle } from "../../src/features/recurrence/plans-api";
import { recurrenceLabel } from "../../src/features/recurrence/pricing";
import { recurrencePriceText } from "../../src/features/recurrence/price-text";
import { useOwnerShopId } from "../../src/features/shops/use-owner-shop-id";
import { errorMessage } from "../../src/i18n/errors";
import { useBack } from "../../src/lib/navigation/use-back";
import { pullToRefresh, useRefreshAll } from "../../src/lib/use-refresh";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function RecurrencePlansScreen() {
  const { t } = useTranslation();
  const pull = useRefreshAll();
  const router = useRouter();
  const back = useBack();
  const { supabase } = useSupabaseSession();
  const shop = useOwnerShopId();
  const shopId = shop.data ?? null;
  const plans = useQuery({ enabled: shopId !== null, queryFn: () => listRecurrencePlans(supabase, shopId ?? ""), queryKey: ["owner-recurrence-plans", shopId] });
  const loading = shop.isLoading || plans.isLoading;
  const loadError = shop.error ?? plans.error;

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView refreshControl={pullToRefresh(pull)} className="flex-1" contentContainerStyle={{ paddingBottom: 96 }}>
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("owner.plans.title")} />
            {loading ? <SkeletonBlock height={96} width={320} /> : null}
            {loadError ? <Text className="text-sm font-sans text-danger-500">{errorMessage(loadError, t, t("owner.plans.saveError"))}</Text> : null}
            {plans.data && plans.data.length === 0 ? <EmptyState title={t("owner.plans.empty")} /> : null}
            {(plans.data ?? []).map((plan) => (
              <Card key={plan.id} testID={`plan-${plan.id}`} variant="outlined">
                <View className="gap-2">
                  <Text className="text-base font-sans-semibold text-ink">{planTitle(plan)}{plan.active ? "" : ` ${t("owner.plans.inactive")}`}</Text>
                  <Text className="text-sm font-sans text-neutral-600">{plan.serviceName} · {recurrenceLabel(t, plan.weeks)} · {t("recurrence.normalPrice", { price: formatPriceBRL(plan.normalCents) })}</Text>
                  <Text className="text-sm font-sans-medium text-ink">{recurrencePriceText(t, plan.priceCents, plan.weeks)}</Text>
                  <View className="flex-row">
                    <Button label={t("common.edit")} onPress={() => router.push({ params: { id: plan.id }, pathname: "/recurrence-plan-form" })} size="sm" testID={`plan-edit-${plan.id}`} variant="outline" />
                  </View>
                </View>
              </Card>
            ))}
          </View>
        </View>
      </ScrollView>
      <FabAdd label={t("owner.plans.add")} onPress={() => router.push("/recurrence-plan-form")} />
    </Screen>
  );
}
