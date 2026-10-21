import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { EmptyState } from "../../src/components/domain/EmptyState";
import { RadioBlock } from "../../src/components/domain/RadioBlock";
import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Input, useFieldChain } from "../../src/components/ui/Input";
import { Screen } from "../../src/components/ui/Screen";
import { listRecurrencePlans, saveRecurrencePlan } from "../../src/features/recurrence/plans-api";
import { recurrencePriceText } from "../../src/features/recurrence/price-text";
import { useOwnerServiceCatalog } from "../../src/features/services/use-owner-catalog";
import { useOwnerShopId } from "../../src/features/shops/use-owner-shop-id";
import { errorMessage } from "../../src/i18n/errors";
import { centsToReaisInput, parseReaisToCents } from "../../src/lib/money";
import { useBack } from "../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../src/providers/AppProviders";

// Create (no `id`) or edit (`?id=`) a recurrence plan.
export default function RecurrencePlanFormScreen() {
  const { t } = useTranslation();
  const back = useBack();
  const field = useFieldChain(3);
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const shop = useOwnerShopId();
  const shopId = shop.data ?? null;
  const { catalog } = useOwnerServiceCatalog();
  const plans = useQuery({ enabled: shopId !== null, queryFn: () => listRecurrencePlans(supabase, shopId ?? ""), queryKey: ["owner-recurrence-plans", shopId] });
  const plan = id ? plans.data?.find((candidate) => candidate.id === id) ?? null : null;
  const services = (catalog.data?.services ?? []).filter((service) => service.active);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [priceText, setPriceText] = useState("");
  const [weeksText, setWeeksText] = useState("1");
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);

  useEffect(() => {
    if (!plan) return;
    setServiceId(plan.serviceId);
    setName(plan.name ?? "");
    setPriceText(centsToReaisInput(plan.priceCents));
    setWeeksText(String(plan.weeks));
  }, [plan]);

  const priceCents = parseReaisToCents(priceText);
  const weeks = Number(weeksText);
  const weeksValid = Number.isInteger(weeks) && weeks >= 1 && weeks <= 12;
  const valid = serviceId !== null && priceCents !== null && weeksValid;

  const save = useMutation({
    mutationFn: (active: boolean) => saveRecurrencePlan(supabase, { active, id: id ?? null, name, priceCents: priceCents ?? 0, serviceId: serviceId ?? "", weeks }),
    onError: (error) => setFeedback({ message: errorMessage(error, t, t("owner.plans.saveError")), variant: "error" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["owner-recurrence-plans"] });
      if (id) setFeedback({ message: t("owner.plans.saved"), variant: "success" });
      else back();
    },
  });

  const loading = shop.isLoading || catalog.isLoading || plans.isLoading;

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={id ? t("owner.plans.editTitle") : t("owner.plans.newTitle")} />
            {loading ? <SkeletonBlock height={96} width={320} /> : null}
            {id && plans.data && !plan ? <EmptyState title={t("owner.plans.notFound")} /> : null}

            {!id || plan ? (
              <>
                <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{t("owner.plans.service")}</Text>
                <RadioBlock items={services.map((service) => ({ key: `plan-service-${service.id}`, label: service.name, onPress: () => setServiceId(service.id), selected: service.id === serviceId }))} />
                <Input {...field(0)} label={t("owner.plans.name")} onChangeText={setName} placeholder={t("examples.serviceName")} testID="plan-name" value={name} />
                <Input {...field(1)} keyboardType="numeric" label={t("owner.plans.price")} onChangeText={setPriceText} placeholder={t("examples.money")} testID="plan-price" value={priceText} />
                <View className="flex-row gap-2">
                  <Button label={t("owner.plans.quickMonthly")} onPress={() => setWeeksText("1")} size="sm" testID="plan-weeks-1" variant={weeksText === "1" ? "dark" : "outline"} />
                  <Button label={t("owner.plans.quickBiweekly")} onPress={() => setWeeksText("2")} size="sm" testID="plan-weeks-2" variant={weeksText === "2" ? "dark" : "outline"} />
                </View>
                <Input {...field(2)} keyboardType="number-pad" label={t("owner.plans.every")} onChangeText={setWeeksText} placeholder={t("examples.weeks")} testID="plan-weeks" value={weeksText} />
                {priceCents !== null && weeksValid ? <Text className="text-sm font-sans-medium text-ink" testID="plan-summary">{recurrencePriceText(t, priceCents, weeks)}</Text> : null}
                <Button disabled={!valid || save.isPending} label={t("owner.plans.save")} onPress={() => save.mutate(plan ? plan.active : true)} testID="plan-save" />
                {plan ? (
                  <Button disabled={save.isPending} label={plan.active ? t("common.deactivate") : t("common.activate")} onPress={() => save.mutate(!plan.active)} testID="plan-toggle" variant={plan.active ? "danger" : "primary"} />
                ) : null}
              </>
            ) : null}
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
