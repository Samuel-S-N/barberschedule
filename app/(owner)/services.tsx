import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { EmptyState } from "../../src/components/domain/EmptyState";
import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { formatPriceBRL } from "../../src/components/domain/ServiceCard";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { Input } from "../../src/components/ui/Input";
import { Screen } from "../../src/components/ui/Screen";
import { listOwnerBarbers } from "../../src/features/barbers/api";
import type { OwnerBarber } from "../../src/features/barbers/types";
import {
  createBarberService,
  createService,
  listOwnerBarberServices,
  listOwnerServices,
  setBarberServiceActive,
  setServiceActive,
  setServiceStandard,
  updateBarberService,
  updateService,
} from "../../src/features/services/api";
import type { BarberService, Service } from "../../src/features/services/types";
import { isIntegerInput, parseIntegerInput } from "../../src/features/services/validation";
import { useOwnerShopId } from "../../src/features/shops/use-owner-shop-id";
import { errorMessage } from "../../src/i18n/errors";
import { centsToReaisInput, parseReaisToCents } from "../../src/lib/money";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function OwnerServicesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const shop = useOwnerShopId();
  const shopId = shop.data ?? null;
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [price, setPrice] = useState("25,00");
  // Which service has its barbers section open, and which assignment's override is being edited.
  const [openServiceId, setOpenServiceId] = useState<string | null>(null);
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [overridePrice, setOverridePrice] = useState("");
  const [overrideDuration, setOverrideDuration] = useState("");

  const catalog = useQuery({
    enabled: shopId !== null,
    queryFn: async () => {
      const id = shopId ?? "";
      const [services, barbers, barberServices] = await Promise.all([listOwnerServices(supabase, id), listOwnerBarbers(supabase, id), listOwnerBarberServices(supabase, id)]);

      return { barberServices, barbers: barbers.filter((barber: OwnerBarber) => barber.active), services };
    },
    queryKey: ["owner-services", shopId],
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["owner-services"] });
  const fail = (error: unknown, fallback: string) => setFeedback({ message: errorMessage(error, t, fallback), variant: "error" });

  const resetForm = () => {
    setDescription("");
    setDurationMinutes("30");
    setEditingId(null);
    setName("");
    setPrice("25,00");
  };

  const priceCents = parseReaisToCents(price);
  const validForm = name.trim().length > 0 && isIntegerInput(durationMinutes) && priceCents !== null;

  const save = useMutation({
    mutationFn: () => {
      const payload = { description: description.trim() || null, durationMinutes: parseIntegerInput(durationMinutes, "Duration"), name, priceCents: priceCents ?? 0 };

      return editingId ? updateService(supabase, editingId, payload) : createService(supabase, { ...payload, shopId: shopId ?? "" });
    },
    onError: (error) => fail(error, t("owner.services.saveError")),
    onSuccess: () => {
      resetForm();
      void refresh();
    },
  });

  const change = useMutation({
    mutationFn: (job: () => Promise<unknown>) => job(),
    onError: (error) => fail(error, t("owner.services.updateError")),
    onSuccess: () => void refresh(),
  });

  const saveOverride = useMutation({
    mutationFn: () => {
      const priceOverride = overridePrice.trim() === "" ? null : parseReaisToCents(overridePrice);
      if (overridePrice.trim() !== "" && priceOverride === null) throw new Error("invalid price");
      if (overrideDuration.trim() !== "" && !isIntegerInput(overrideDuration)) throw new Error("invalid duration");

      return updateBarberService(supabase, overrideId ?? "", {
        durationOverrideMinutes: overrideDuration.trim() === "" ? null : parseIntegerInput(overrideDuration, "Duration"),
        priceOverrideCents: priceOverride,
      });
    },
    onError: (error) => fail(error, t("owner.services.updateError")),
    onSuccess: () => {
      setOverrideId(null);
      setFeedback({ message: t("owner.services.overrideSaved"), variant: "success" });
      void refresh();
    },
  });

  const startOverride = (assignment: BarberService) => {
    setOverrideId(assignment.id);
    setOverridePrice(assignment.priceOverrideCents === null ? "" : centsToReaisInput(assignment.priceOverrideCents));
    setOverrideDuration(assignment.durationOverrideMinutes === null ? "" : String(assignment.durationOverrideMinutes));
  };

  const busy = save.isPending || change.isPending || saveOverride.isPending;
  const loading = shop.isLoading || catalog.isLoading;
  const loadError = shop.error ?? catalog.error;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/manage"));

  const renderAssignments = (service: Service) => (
    <View className="gap-2" testID={`barbers-${service.id}`}>
      {(catalog.data?.barbers ?? []).map((barber: OwnerBarber) => {
        const assignment = catalog.data?.barberServices.find((item) => item.barberId === barber.id && item.serviceId === service.id) ?? null;
        const offered = assignment?.active ?? false;
        const effectivePrice = formatPriceBRL(assignment?.priceOverrideCents ?? service.priceCents);
        const effectiveMinutes = assignment?.durationOverrideMinutes ?? service.durationMinutes;

        return (
          <View className="gap-2 rounded-2xl border border-neutral-200 p-3" key={barber.id} testID={`assignment-${service.id}-${barber.id}`}>
            <Text className="text-base font-sans-semibold text-ink">{barber.name}</Text>
            <Text className="text-sm font-sans text-neutral-600">
              {offered ? t("owner.services.assignmentSummary", { minutes: effectiveMinutes, price: effectivePrice }) : t("owner.services.notOffered")}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {offered && assignment ? (
                <>
                  <Button disabled={busy} label={t("owner.services.overrideEdit")} onPress={() => startOverride(assignment)} size="sm" testID={`override-edit-${service.id}-${barber.id}`} variant="outline" />
                  <Button disabled={busy} label={t("owner.services.unassign")} onPress={() => change.mutate(() => setBarberServiceActive(supabase, assignment.id, false))} size="sm" testID={`unassign-${service.id}-${barber.id}`} variant="outline" />
                </>
              ) : (
                <Button
                  disabled={busy}
                  label={t("owner.services.assign")}
                  onPress={() => change.mutate(() => (assignment ? setBarberServiceActive(supabase, assignment.id, true) : createBarberService(supabase, { barberId: barber.id, serviceId: service.id, shopId: shopId ?? "" })))}
                  size="sm"
                  testID={`assign-${service.id}-${barber.id}`}
                />
              )}
            </View>
            {overrideId !== null && overrideId === assignment?.id ? (
              <View className="gap-2">
                <Input keyboardType="numeric" label={t("owner.services.overridePrice")} onChangeText={setOverridePrice} testID="override-price" value={overridePrice} />
                <Input keyboardType="numeric" label={t("owner.services.overrideDuration")} onChangeText={setOverrideDuration} testID="override-duration" value={overrideDuration} />
                <Text className="text-xs font-sans text-neutral-500">{t("owner.services.overrideHint")}</Text>
                <View className="flex-row gap-2">
                  <Button disabled={busy} label={t("owner.services.overrideSave")} onPress={() => saveOverride.mutate()} size="sm" testID="override-save" />
                  <Button label={t("common.cancel")} onPress={() => setOverrideId(null)} size="sm" variant="outline" />
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("owner.services.title")} />

            <Card>
              <View className="gap-3">
                <Input label={t("owner.services.nameLabel")} onChangeText={setName} testID="service-name" value={name} />
                <Input keyboardType="numeric" label={t("owner.services.durationLabel")} onChangeText={setDurationMinutes} testID="service-duration" value={durationMinutes} />
                <Input keyboardType="numeric" label={t("owner.services.priceLabel")} onChangeText={setPrice} testID="service-price" value={price} />
                <Input label={t("owner.services.descriptionLabel")} onChangeText={setDescription} testID="service-description" value={description} />
                <View className="flex-row gap-2">
                  <Button disabled={!validForm || loading || busy || !shopId} label={editingId ? t("owner.services.save") : t("owner.services.add")} onPress={() => save.mutate()} testID="service-save" />
                  {editingId ? <Button label={t("common.cancelEdit")} onPress={resetForm} variant="outline" /> : null}
                </View>
              </View>
            </Card>

            {loading ? <SkeletonBlock height={96} width={320} /> : null}
            {loadError ? <Text className="text-sm font-sans text-danger-500">{errorMessage(loadError, t, t("owner.services.loadError"))}</Text> : null}
            {shop.data === null ? <EmptyState title={t("common.noShop")} /> : null}

            {(catalog.data?.services ?? []).map((service: Service) => (
              <Card key={service.id} testID={`owner-service-${service.id}`} variant="outlined">
                <View className="gap-3">
                  <View className="gap-1">
                    <Text className="text-base font-sans-semibold text-ink">
                      {service.name}{service.active ? "" : ` ${t("common.archived")}`}{service.isStandard ? ` · ${t("owner.services.standardBadge")}` : ""}
                    </Text>
                    <Text className="text-sm font-sans text-neutral-600" style={{ fontVariant: ["tabular-nums"] }}>{service.durationMinutes} min · {formatPriceBRL(service.priceCents)}</Text>
                    {service.description ? <Text className="text-sm font-sans text-neutral-500">{service.description}</Text> : null}
                  </View>
                  <View className="flex-row flex-wrap gap-2">
                    <Button
                      label={t("common.edit")}
                      onPress={() => {
                        setDescription(service.description ?? "");
                        setDurationMinutes(String(service.durationMinutes));
                        setEditingId(service.id);
                        setName(service.name);
                        setPrice(centsToReaisInput(service.priceCents));
                      }}
                      size="sm"
                      testID={`service-edit-${service.id}`}
                      variant="outline"
                    />
                    <Button disabled={busy} label={service.active ? t("common.deactivate") : t("common.activate")} onPress={() => change.mutate(() => setServiceActive(supabase, service.id, !service.active))} size="sm" testID={`service-toggle-${service.id}`} variant="outline" />
                    <Button disabled={busy} label={service.isStandard ? t("owner.services.removeStandard") : t("owner.services.makeStandard")} onPress={() => change.mutate(() => setServiceStandard(supabase, service.id, !service.isStandard))} size="sm" testID={`service-standard-${service.id}`} variant="outline" />
                    <Button label={t("owner.services.barbers")} onPress={() => setOpenServiceId(openServiceId === service.id ? null : service.id)} size="sm" testID={`service-barbers-${service.id}`} variant={openServiceId === service.id ? "dark" : "outline"} />
                  </View>
                  {openServiceId === service.id ? renderAssignments(service) : null}
                </View>
              </Card>
            ))}
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
