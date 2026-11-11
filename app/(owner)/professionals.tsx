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
import { setProfessionalActive } from "../../src/features/professionals/api";
import { splitByActive } from "../../src/features/professionals/owner-list";
import { useOwnerProfessionals } from "../../src/features/professionals/owner/use-owner-professionals";
import type { OwnerProfessional } from "../../src/features/professionals/types";
import { errorMessage } from "../../src/i18n/errors";
import { useBack } from "../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../src/providers/AppProviders";
import { pullToRefresh, useRefreshAll } from "../../src/lib/use-refresh";

export default function OwnerProfessionalsScreen() {
  const { t } = useTranslation();
  const pull = useRefreshAll();
  const router = useRouter();
  const back = useBack();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const { professionals, shop } = useOwnerProfessionals();
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reactivate = useMutation({
    mutationFn: (professional: OwnerProfessional) => setProfessionalActive(supabase, professional.id, true),
    onError: (caught) => setError(errorMessage(caught, t, t("owner.professionals.updateError"))),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["owner-professionals"] }),
  });

  const { active, inactive } = splitByActive(professionals.data?.list ?? []);
  const loading = shop.isLoading || professionals.isLoading;
  const loadError = shop.error ?? professionals.error;

  const accountStatus = (professional: OwnerProfessional) =>
    !professional.userId ? "owner.professionals.statusNone" : professionals.data?.signedIn[professional.id] ? "owner.professionals.statusActive" : "owner.professionals.statusInvited";
  const compensationSummary = (professional: OwnerProfessional) =>
    professional.compensation.type === "commission"
      ? t("owner.professionals.summaryCommission", { percent: professional.compensation.commissionPercent })
      : t("owner.professionals.summaryChairRental", { amount: formatPriceBRL(professional.compensation.amountCents), frequency: t(`professional.frequency.${professional.compensation.frequency}`) });

  const row = (professional: OwnerProfessional) => (
    <Card key={professional.id} testID={`owner-professional-${professional.id}`} variant="outlined">
      <View className="gap-3">
        <View className="flex-row items-center gap-3">
          <Avatar name={professional.name} size={44} uri={professional.avatarUrl} />
          <View className="flex-1 gap-0.5">
            <Text className="text-base font-sans-semibold text-ink">{professional.name}{professional.active ? "" : ` ${t("common.archived")}`}</Text>
            <Text className="text-sm font-sans text-neutral-600">{t(accountStatus(professional))}</Text>
            <Text className="text-sm font-sans text-neutral-600">{compensationSummary(professional)}</Text>
          </View>
        </View>
        <View className="flex-row flex-wrap gap-2">
          <Button label={t("common.edit")} onPress={() => router.push({ params: { id: professional.id }, pathname: "/professional-profile" })} size="sm" testID={`professional-edit-${professional.id}`} variant="outline" />
          {professional.active ? null : <Button disabled={reactivate.isPending} label={t("owner.professionals.reactivate")} onPress={() => reactivate.mutate(professional)} size="sm" testID={`professional-toggle-${professional.id}`} />}
        </View>
      </View>
    </Card>
  );

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView refreshControl={pullToRefresh(pull)} className="flex-1" contentContainerStyle={{ paddingBottom: 96 }}>
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("owner.professionals.title")} />
            {loading ? <SkeletonBlock height={96} width={320} /> : null}
            {loadError ? <Text className="text-sm font-sans text-danger-500">{errorMessage(loadError, t, t("owner.professionals.loadError"))}</Text> : null}
            {shop.data === null ? <EmptyState title={t("common.noShop")} /> : null}
            {professionals.data && active.length === 0 ? <EmptyState title={t("owner.professionals.empty")} /> : null}
            {active.map(row)}
            {inactive.length > 0 ? (
              <>
                <Button label={showInactive ? t("owner.professionals.hideInactive") : t("owner.professionals.showInactive", { count: inactive.length })} onPress={() => setShowInactive((current) => !current)} size="sm" testID="professionals-show-inactive" variant="ghost" />
                {showInactive ? inactive.map(row) : null}
              </>
            ) : null}
            <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
          </View>
        </View>
      </ScrollView>
      <FabAdd label={t("owner.professionals.add")} onPress={() => router.push("/professional-new")} />
    </Screen>
  );
}
