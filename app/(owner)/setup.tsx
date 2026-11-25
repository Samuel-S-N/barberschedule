import { useFocusEffect, useRouter } from "expo-router";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Screen } from "../../src/components/ui/Screen";
import { SignOutButton } from "../../src/features/account/SignOutButton";
import { completeShopSetup } from "../../src/features/setup/api";
import { SetupAgreementStep } from "../../src/features/setup/SetupAgreementStep";
import { SetupStepCard } from "../../src/features/setup/SetupStepCard";
import { SetupTeamStep } from "../../src/features/setup/SetupTeamStep";
import { canOpen, progress, stepDone } from "../../src/features/setup/steps";
import { useSetupStatus } from "../../src/features/setup/use-setup-status";
import { useOwnerShopId } from "../../src/features/shops/use-owner-shop-id";
import { errorMessage } from "../../src/i18n/errors";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function OwnerSetupScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const shopId = useOwnerShopId().data ?? null;
  const status = useSetupStatus();
  const refetch = status.refetch;
  // Each step opens an existing screen; coming back must show what it changed.
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));

  const open = useMutation({
    mutationFn: () => completeShopSetup(supabase, shopId ?? ""),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["current-shop"] });
      await queryClient.invalidateQueries({ queryKey: ["shop-setup-status"] });
      router.push("/shop-link");
    },
  });
  const go = (path: string) => () => router.push(path as never);

  if (status.isError) {
    return (
      <Screen className="flex-1 bg-canvas">
        <View className="flex-1 items-center justify-center gap-4 p-5">
          <Text className="text-base font-sans text-danger-500">{t("setup.loadError")}</Text>
          <Button label={t("common.tryAgain")} onPress={() => void refetch()} />
        </View>
      </Screen>
    );
  }
  const data = status.data;
  const done = (step: Parameters<typeof stepDone>[1]) => (data ? stepDone(data, step) : false);
  const counted = data ? progress(data) : { done: 0, total: 5 };

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right", "bottom"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <Text accessibilityRole="header" className="text-3xl leading-[44px] font-display-bold text-ink">{t("setup.title")}</Text>
            <Text className="text-base font-sans text-neutral-700">{t("setup.intro")}</Text>
            <Text className="text-sm font-sans-medium text-primary-600" testID="setup-progress">{t("setup.progress", counted)}</Text>

            <SetupAgreementStep done={done("agreement")} onAccepted={() => void refetch()} />
            <SetupStepCard done={done("details")} hint={t("setup.details.hint")} stepKey="details" title={t("setup.details.title")}>
              <Button label={done("details") ? t("setup.review") : t("setup.open")} onPress={go("/shop")} size="sm" testID="setup-details-open" variant="outline" />
            </SetupStepCard>
            <SetupStepCard done={done("hours")} hint={t("setup.hours.hint")} stepKey="hours" title={t("setup.hours.title")}>
              <Button label={done("hours") ? t("setup.review") : t("setup.open")} onPress={go("/shop")} size="sm" testID="setup-hours-open" variant="outline" />
            </SetupStepCard>
            <SetupStepCard done={done("services")} hint={t("setup.services.hint")} stepKey="services" title={t("setup.services.title")}>
              <Button label={done("services") ? t("setup.review") : t("setup.open")} onPress={go("/services")} size="sm" testID="setup-services-open" variant="outline" />
            </SetupStepCard>
            <SetupTeamStep done={done("team")} onChanged={() => void refetch()} professionals={data?.professionals ?? []} />
            <SetupStepCard done={null} hint={t("setup.colours.hint")} optionalLabel={t("setup.optional")} stepKey="colours" title={t("setup.colours.title")}>
              <Button label={t("setup.open")} onPress={go("/appearance")} size="sm" testID="setup-colours-open" variant="outline" />
            </SetupStepCard>

            <SetupStepCard done={null} hint={t("setup.finish.hint")} stepKey="open" title={t("setup.finish.title")}>
              <Button disabled={!data || !canOpen(data) || open.isPending} label={t("setup.finish.title")} onPress={() => open.mutate()} size="lg" testID="setup-open" />
            </SetupStepCard>
            <Toast message={open.isError ? errorMessage(open.error, t, t("setup.finish.error")) : ""} onDismiss={() => open.reset()} variant="error" visible={open.isError} />
            <SignOutButton />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
