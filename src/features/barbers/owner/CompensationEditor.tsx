import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { setBarberCompensation } from "../api";
import type { BarberCompensation, OwnerBarber } from "../types";

export function CompensationEditor({ barber, onFeedback }: { barber: OwnerBarber; onFeedback: (message: string, variant: "error" | "success") => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const [editing, setEditing] = useState(false);
  const [compType, setCompType] = useState<BarberCompensation["type"]>(barber.compensation.type);
  const [percent, setPercent] = useState(barber.compensation.type === "commission" ? String(barber.compensation.commissionPercent) : "");
  const [rent, setRent] = useState(barber.compensation.type === "chair_rental" ? centsToReaisInput(barber.compensation.amountCents) : "");
  const [rentFrequency, setRentFrequency] = useState<"weekly" | "monthly">(barber.compensation.type === "chair_rental" ? barber.compensation.frequency : "monthly");

  const save = useMutation({
    mutationFn: () => {
      if (compType === "commission") return setBarberCompensation(supabase, barber.id, { commissionPercent: Number(percent), type: "commission" });
      const amountCents = parseReaisToCents(rent);
      if (amountCents === null) throw Object.assign(new Error("invalid"), { code: "P0021" });

      return setBarberCompensation(supabase, barber.id, { amountCents, frequency: rentFrequency, type: "chair_rental" });
    },
    onError: (error) => onFeedback(errorMessage(error, t, t("owner.barbers.compensationError")), "error"),
    onSuccess: () => {
      setEditing(false);
      onFeedback(t("owner.barbers.compensationSaved"), "success");
      void queryClient.invalidateQueries({ queryKey: ["owner-barbers"] });
    },
  });

  const summary = barber.compensation.type === "commission"
    ? t("owner.barbers.summaryCommission", { percent: barber.compensation.commissionPercent })
    : t("owner.barbers.summaryChairRental", { amount: formatPriceBRL(barber.compensation.amountCents), frequency: t(`barber.frequency.${barber.compensation.frequency}`) });

  return (
    <Card variant="outlined">
      <View className="gap-3">
        <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{t("owner.barbers.compensation")}</Text>
        <Text className="text-sm font-sans text-neutral-600" testID="barber-comp-summary">{summary}</Text>
        {editing ? (
          <View className="gap-2">
            <View className="flex-row gap-2">
              <Button label={t("owner.barbers.commissionTab")} onPress={() => setCompType("commission")} size="sm" testID="comp-type-commission" variant={compType === "commission" ? "dark" : "outline"} />
              <Button label={t("owner.barbers.chairRentalTab")} onPress={() => setCompType("chair_rental")} size="sm" testID="comp-type-chair_rental" variant={compType === "chair_rental" ? "dark" : "outline"} />
            </View>
            {compType === "commission" ? (
              <Input keyboardType="numeric" label={t("owner.barbers.commissionPercentLabel")} onChangeText={setPercent} testID="comp-percent" value={percent} />
            ) : (
              <>
                <Input keyboardType="numeric" label={t("owner.barbers.rentalAmountLabel")} onChangeText={setRent} testID="comp-rent" value={rent} />
                <View className="flex-row gap-2">
                  {(["weekly", "monthly"] as const).map((frequency) => (
                    <Button key={frequency} label={t(`barber.frequency.${frequency}`)} onPress={() => setRentFrequency(frequency)} size="sm" testID={`comp-freq-${frequency}`} variant={rentFrequency === frequency ? "dark" : "outline"} />
                  ))}
                </View>
              </>
            )}
            <View className="flex-row gap-2">
              <Button disabled={save.isPending} label={t("owner.barbers.saveCompensation")} onPress={() => save.mutate()} size="sm" testID="comp-save" />
              <Button label={t("common.cancel")} onPress={() => setEditing(false)} size="sm" variant="outline" />
            </View>
          </View>
        ) : (
          <Button label={t("common.edit")} onPress={() => setEditing(true)} size="sm" testID="barber-comp-edit" variant="outline" />
        )}
      </View>
    </Card>
  );
}
