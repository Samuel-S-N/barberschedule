import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { formatPriceBRL } from "../../components/domain/ServiceCard";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { errorMessage } from "../../i18n/errors";
import { centsToReaisInput, parseReaisToCents } from "../../lib/money";
import { useSupabaseSession } from "../../providers/AppProviders";
import type { OwnerBarber } from "../barbers/types";
import { createBarberService, setBarberServiceActive, updateBarberService } from "./api";
import type { BarberService, Service } from "./types";
import { isIntegerInput, parseIntegerInput } from "./validation";

type Props = {
  barberServices: BarberService[];
  barbers: OwnerBarber[];
  onFeedback: (message: string, variant: "error" | "success") => void;
  service: Service;
  shopId: string;
};

// Which barbers offer this service, with the owner's per-barber price and duration overrides (one service x many barbers).
export function ServiceAssignments({ barberServices, barbers, onFeedback, service, shopId }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [overridePrice, setOverridePrice] = useState("");
  const [overrideDuration, setOverrideDuration] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["owner-services"] });
  const fail = (error: unknown) => onFeedback(errorMessage(error, t, t("owner.services.updateError")), "error");

  const change = useMutation({ mutationFn: (job: () => Promise<unknown>) => job(), onError: fail, onSuccess: () => void refresh() });
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
    onError: fail,
    onSuccess: () => {
      setOverrideId(null);
      onFeedback(t("owner.services.overrideSaved"), "success");
      void refresh();
    },
  });

  const startOverride = (assignment: BarberService) => {
    setOverrideId(assignment.id);
    setOverridePrice(assignment.priceOverrideCents === null ? "" : centsToReaisInput(assignment.priceOverrideCents));
    setOverrideDuration(assignment.durationOverrideMinutes === null ? "" : String(assignment.durationOverrideMinutes));
  };

  const busy = change.isPending || saveOverride.isPending;

  return (
    <View className="gap-2" testID={`barbers-${service.id}`}>
      {barbers.map((barber) => {
        const assignment = barberServices.find((item) => item.barberId === barber.id && item.serviceId === service.id) ?? null;
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
                  onPress={() => change.mutate(() => (assignment ? setBarberServiceActive(supabase, assignment.id, true) : createBarberService(supabase, { barberId: barber.id, serviceId: service.id, shopId })))}
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
}
