import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { formatPriceBRL } from "../../../components/domain/ServiceCard";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { errorMessage } from "../../../i18n/errors";
import { centsToReaisInput, parseReaisToCents } from "../../../lib/money";
import { useSupabaseSession } from "../../../providers/AppProviders";
import { createBarberService, listOwnerBarberServices, listOwnerServices, setBarberServiceActive, updateBarberService } from "../../services/api";
import type { BarberService, Service } from "../../services/types";
import { isIntegerInput, parseIntegerInput } from "../../services/validation";
import type { OwnerBarber } from "../types";

// The services this barber offers, with the owner's per-barber price and duration overrides (one barber x many services).
export function BarberServicesEditor({ barber, onFeedback }: { barber: OwnerBarber; onFeedback: (message: string, variant: "error" | "success") => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [overridePrice, setOverridePrice] = useState("");
  const [overrideDuration, setOverrideDuration] = useState("");

  const catalog = useQuery({
    queryFn: async () => {
      const [services, barberServices] = await Promise.all([listOwnerServices(supabase, barber.shopId), listOwnerBarberServices(supabase, barber.shopId)]);

      return { barberServices: barberServices.filter((item) => item.barberId === barber.id), services: services.filter((service) => service.active) };
    },
    queryKey: ["owner-barber-services", barber.id],
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["owner-barber-services"] });
    void queryClient.invalidateQueries({ queryKey: ["owner-services"] });
  };
  const fail = (error: unknown) => onFeedback(errorMessage(error, t, t("owner.services.updateError")), "error");

  const change = useMutation({ mutationFn: (job: () => Promise<unknown>) => job(), onError: fail, onSuccess: refresh });
  const saveOverride = useMutation({
    mutationFn: () => {
      const price = overridePrice.trim() === "" ? null : parseReaisToCents(overridePrice);
      if (overridePrice.trim() !== "" && price === null) throw new Error("invalid price");
      if (overrideDuration.trim() !== "" && !isIntegerInput(overrideDuration)) throw new Error("invalid duration");

      return updateBarberService(supabase, overrideId ?? "", {
        durationOverrideMinutes: overrideDuration.trim() === "" ? null : parseIntegerInput(overrideDuration, "Duration"),
        priceOverrideCents: price,
      });
    },
    onError: fail,
    onSuccess: () => {
      setOverrideId(null);
      onFeedback(t("owner.services.overrideSaved"), "success");
      refresh();
    },
  });

  const startOverride = (assignment: BarberService) => {
    setOverrideId(assignment.id);
    setOverridePrice(assignment.priceOverrideCents === null ? "" : centsToReaisInput(assignment.priceOverrideCents));
    setOverrideDuration(assignment.durationOverrideMinutes === null ? "" : String(assignment.durationOverrideMinutes));
  };

  const busy = change.isPending || saveOverride.isPending;
  const services = catalog.data?.services ?? [];

  return (
    <View className="gap-3" testID="barber-services-editor">
      <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{t("owner.barbers.servicesTitle")}</Text>
      {catalog.data && services.length === 0 ? <Text className="text-sm font-sans text-neutral-600">{t("owner.barbers.noServices")}</Text> : null}
      {services.map((service: Service) => {
        const assignment = catalog.data?.barberServices.find((item) => item.serviceId === service.id) ?? null;
        const offered = assignment?.active ?? false;

        return (
          <Card key={service.id} testID={`barber-service-${service.id}`} variant="outlined">
            <View className="gap-2">
              <Text className="text-base font-sans-semibold text-ink">{service.name}</Text>
              <Text className="text-sm font-sans text-neutral-600">
                {offered
                  ? t("owner.services.assignmentSummary", { minutes: assignment?.durationOverrideMinutes ?? service.durationMinutes, price: formatPriceBRL(assignment?.priceOverrideCents ?? service.priceCents) })
                  : t("owner.services.notOffered")}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {offered && assignment ? (
                  <>
                    <Button disabled={busy} label={t("owner.services.overrideEdit")} onPress={() => startOverride(assignment)} size="sm" testID={`barber-override-edit-${service.id}`} variant="outline" />
                    <Button disabled={busy} label={t("owner.services.unassign")} onPress={() => change.mutate(() => setBarberServiceActive(supabase, assignment.id, false))} size="sm" testID={`barber-unassign-${service.id}`} variant="outline" />
                  </>
                ) : (
                  <Button
                    disabled={busy}
                    label={t("owner.services.assign")}
                    onPress={() => change.mutate(() => (assignment ? setBarberServiceActive(supabase, assignment.id, true) : createBarberService(supabase, { barberId: barber.id, serviceId: service.id, shopId: barber.shopId })))}
                    size="sm"
                    testID={`barber-assign-${service.id}`}
                  />
                )}
              </View>
              {overrideId !== null && overrideId === assignment?.id ? (
                <View className="gap-2">
                  <Input keyboardType="numeric" label={t("owner.services.overridePrice")} onChangeText={setOverridePrice} placeholder={t("examples.money")} testID="barber-override-price" value={overridePrice} />
                  <Input keyboardType="numeric" label={t("owner.services.overrideDuration")} onChangeText={setOverrideDuration} placeholder={t("examples.minutes")} testID="barber-override-duration" value={overrideDuration} />
                  <Text className="text-xs font-sans text-neutral-500">{t("owner.services.overrideHint")}</Text>
                  <View className="flex-row gap-2">
                    <Button disabled={busy} label={t("owner.services.overrideSave")} onPress={() => saveOverride.mutate()} size="sm" testID="barber-override-save" />
                    <Button label={t("common.cancel")} onPress={() => setOverrideId(null)} size="sm" variant="outline" />
                  </View>
                </View>
              ) : null}
            </View>
          </Card>
        );
      })}
    </View>
  );
}
