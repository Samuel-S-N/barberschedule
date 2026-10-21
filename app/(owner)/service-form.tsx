import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { EmptyState } from "../../src/components/domain/EmptyState";
import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { Input, useFieldChain } from "../../src/components/ui/Input";
import { Screen } from "../../src/components/ui/Screen";
import { createService, setServiceActive, setServiceStandard, updateService } from "../../src/features/services/api";
import { ServiceAssignments } from "../../src/features/services/ServiceAssignments";
import { useOwnerServiceCatalog } from "../../src/features/services/use-owner-catalog";
import { isIntegerInput, parseIntegerInput } from "../../src/features/services/validation";
import { errorMessage } from "../../src/i18n/errors";
import { centsToReaisInput, parseReaisToCents } from "../../src/lib/money";
import { useBack } from "../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../src/providers/AppProviders";

// Create (no `id`) or edit (`?id=`) a service; editing also manages the standard flag, activation and which barbers offer it.
export default function OwnerServiceFormScreen() {
  const { t } = useTranslation();
  const back = useBack();
  const field = useFieldChain(4);
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { catalog, shop, shopId } = useOwnerServiceCatalog();
  const service = id ? catalog.data?.services.find((candidate) => candidate.id === id) ?? null : null;
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [price, setPrice] = useState("25,00");
  const notify = (message: string, variant: "error" | "success") => setFeedback({ message, variant });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["owner-services"] });

  useEffect(() => {
    if (!service) return;
    setName(service.name);
    setDescription(service.description ?? "");
    setDurationMinutes(String(service.durationMinutes));
    setPrice(centsToReaisInput(service.priceCents));
  }, [service]);

  const priceCents = parseReaisToCents(price);
  const validForm = name.trim().length > 0 && isIntegerInput(durationMinutes) && priceCents !== null;

  const save = useMutation({
    mutationFn: () => {
      const payload = { description: description.trim() || null, durationMinutes: parseIntegerInput(durationMinutes, "Duration"), name, priceCents: priceCents ?? 0 };

      return id ? updateService(supabase, id, payload) : createService(supabase, { ...payload, shopId: shopId ?? "" });
    },
    onError: (error) => notify(errorMessage(error, t, t("owner.services.saveError")), "error"),
    onSuccess: () => {
      void refresh();
      if (id) notify(t("owner.services.saved"), "success");
      else back();
    },
  });

  const change = useMutation({
    mutationFn: (job: () => Promise<unknown>) => job(),
    onError: (error) => notify(errorMessage(error, t, t("owner.services.updateError")), "error"),
    onSuccess: () => void refresh(),
  });

  const loading = shop.isLoading || catalog.isLoading;
  const busy = save.isPending || change.isPending;

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={id ? t("owner.services.editTitle") : t("owner.services.newTitle")} />
            {loading ? <SkeletonBlock height={96} width={320} /> : null}
            {catalog.error ? <Text className="text-sm font-sans text-danger-500">{errorMessage(catalog.error, t, t("owner.services.loadError"))}</Text> : null}
            {id && catalog.data && !service ? <EmptyState title={t("owner.services.notFound")} /> : null}

            {!id || service ? (
              <Card>
                <View className="gap-3">
                  <Input {...field(0)} label={t("owner.services.nameLabel")} onChangeText={setName} placeholder={t("examples.serviceName")} testID="service-name" value={name} />
                  <Input {...field(1)} keyboardType="numeric" label={t("owner.services.durationLabel")} onChangeText={setDurationMinutes} placeholder={t("examples.minutes")} testID="service-duration" value={durationMinutes} />
                  <Input {...field(2)} keyboardType="numeric" label={t("owner.services.priceLabel")} onChangeText={setPrice} placeholder={t("examples.money")} testID="service-price" value={price} />
                  <Input {...field(3)} label={t("owner.services.descriptionLabel")} onChangeText={setDescription} placeholder={t("examples.description")} testID="service-description" value={description} />
                  <Button disabled={!validForm || loading || busy || !shopId} label={id ? t("owner.services.save") : t("owner.services.add")} onPress={() => save.mutate()} testID="service-save" />
                </View>
              </Card>
            ) : null}

            {service && catalog.data && shopId ? (
              <>
                <Button disabled={busy} label={service.isStandard ? t("owner.services.removeStandard") : t("owner.services.makeStandard")} onPress={() => change.mutate(() => setServiceStandard(supabase, service.id, !service.isStandard))} testID={`service-standard-${service.id}`} variant="outline" />
                <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{t("owner.services.barbers")}</Text>
                <ServiceAssignments barberServices={catalog.data.barberServices} barbers={catalog.data.barbers} onFeedback={notify} service={service} shopId={shopId} />
                <Button disabled={busy} label={service.active ? t("common.deactivate") : t("common.activate")} onPress={() => change.mutate(() => setServiceActive(supabase, service.id, !service.active))} testID={`service-toggle-${service.id}`} variant={service.active ? "danger" : "primary"} />
              </>
            ) : null}
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
