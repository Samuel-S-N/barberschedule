import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { Avatar } from "../../src/components/domain/Avatar";
import { EmptyState } from "../../src/components/domain/EmptyState";
import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { formatPriceBRL } from "../../src/components/domain/ServiceCard";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { FabAdd } from "../../src/components/ui/FabAdd";
import { Screen } from "../../src/components/ui/Screen";
import { setBarberActive } from "../../src/features/barbers/api";
import { splitByActive } from "../../src/features/barbers/owner-list";
import { useOwnerBarbers } from "../../src/features/barbers/owner/use-owner-barbers";
import type { OwnerBarber } from "../../src/features/barbers/types";
import { errorMessage } from "../../src/i18n/errors";
import { useBack } from "../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../src/providers/AppProviders";
import { pullToRefresh, useRefreshAll } from "../../src/lib/use-refresh";

export default function OwnerBarbersScreen() {
  const { t } = useTranslation();
  const pull = useRefreshAll();
  const router = useRouter();
  const back = useBack("/manage");
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const { barbers, shop } = useOwnerBarbers();
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reactivate = useMutation({
    mutationFn: (barber: OwnerBarber) => setBarberActive(supabase, barber.id, true),
    onError: (caught) => setError(errorMessage(caught, t, t("owner.barbers.updateError"))),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["owner-barbers"] }),
  });

  const { active, inactive } = splitByActive(barbers.data?.list ?? []);
  const loading = shop.isLoading || barbers.isLoading;
  const loadError = shop.error ?? barbers.error;

  const accountStatus = (barber: OwnerBarber) =>
    !barber.userId ? "owner.barbers.statusNone" : barbers.data?.signedIn[barber.id] ? "owner.barbers.statusActive" : "owner.barbers.statusInvited";
  const compensationSummary = (barber: OwnerBarber) =>
    barber.compensation.type === "commission"
      ? t("owner.barbers.summaryCommission", { percent: barber.compensation.commissionPercent })
      : t("owner.barbers.summaryChairRental", { amount: formatPriceBRL(barber.compensation.amountCents), frequency: t(`barber.frequency.${barber.compensation.frequency}`) });

  const row = (barber: OwnerBarber) => (
    <Card key={barber.id} testID={`owner-barber-${barber.id}`} variant="outlined">
      <View className="gap-3">
        <View className="flex-row items-center gap-3">
          <Avatar name={barber.name} size={44} uri={barber.avatarUrl} />
          <View className="flex-1 gap-0.5">
            <Text className="text-base font-sans-semibold text-ink">{barber.name}{barber.active ? "" : ` ${t("common.archived")}`}</Text>
            <Text className="text-sm font-sans text-neutral-600">{t(accountStatus(barber))}</Text>
            <Text className="text-sm font-sans text-neutral-600">{compensationSummary(barber)}</Text>
          </View>
        </View>
        <View className="flex-row flex-wrap gap-2">
          <Button label={t("common.edit")} onPress={() => router.push({ params: { id: barber.id }, pathname: "/barber-profile" })} size="sm" testID={`barber-edit-${barber.id}`} variant="outline" />
          {barber.active ? null : <Button disabled={reactivate.isPending} label={t("owner.barbers.reactivate")} onPress={() => reactivate.mutate(barber)} size="sm" testID={`barber-toggle-${barber.id}`} />}
        </View>
      </View>
    </Card>
  );

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView refreshControl={pullToRefresh(pull)} className="flex-1" contentContainerStyle={{ paddingBottom: 96 }}>
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("owner.barbers.title")} />
            {loading ? <SkeletonBlock height={96} width={320} /> : null}
            {loadError ? <Text className="text-sm font-sans text-danger-500">{errorMessage(loadError, t, t("owner.barbers.loadError"))}</Text> : null}
            {shop.data === null ? <EmptyState title={t("common.noShop")} /> : null}
            {barbers.data && active.length === 0 ? <EmptyState title={t("owner.barbers.empty")} /> : null}
            {active.map(row)}
            {inactive.length > 0 ? (
              <>
                <Button label={showInactive ? t("owner.barbers.hideInactive") : t("owner.barbers.showInactive", { count: inactive.length })} onPress={() => setShowInactive((current) => !current)} size="sm" testID="barbers-show-inactive" variant="ghost" />
                {showInactive ? inactive.map(row) : null}
              </>
            ) : null}
            <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
          </View>
        </View>
      </ScrollView>
      <FabAdd label={t("owner.barbers.add")} onPress={() => router.push("/barber-new")} />
    </Screen>
  );
}
