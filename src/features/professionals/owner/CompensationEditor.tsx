import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { ConfirmDialog } from "../../../components/domain/ConfirmDialog";
import { formatPriceBRL } from "../../../components/domain/ServiceCard";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { errorMessage } from "../../../i18n/errors";
import { centsToReaisInput, parseReaisToCents } from "../../../lib/money";
import { useSupabaseSession } from "../../../providers/AppProviders";
import { setProfessionalCompensation } from "../api";
import { needsCommissionChoice } from "../commission-change";
import type { ProfessionalCompensation, OwnerProfessional } from "../types";

export function CompensationEditor({ professional, onFeedback }: { professional: OwnerProfessional; onFeedback: (message: string, variant: "error" | "success") => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const [editing, setEditing] = useState(false);
  const [compType, setCompType] = useState<ProfessionalCompensation["type"]>(professional.compensation.type);
  const [percent, setPercent] = useState(professional.compensation.type === "commission" ? String(professional.compensation.commissionPercent) : "");
  const [rent, setRent] = useState(professional.compensation.type === "chair_rental" ? centsToReaisInput(professional.compensation.amountCents) : "");
  const [rentFrequency, setRentFrequency] = useState<"weekly" | "monthly">(professional.compensation.type === "chair_rental" ? professional.compensation.frequency : "monthly");

  const [choosing, setChoosing] = useState(false);

  const save = useMutation({
    mutationFn: (retroactive: boolean) => {
      if (compType === "commission") return setProfessionalCompensation(supabase, professional.id, { commissionPercent: Number(percent), type: "commission" }, { applyRetroactively: retroactive });
      const amountCents = parseReaisToCents(rent);
      if (amountCents === null) throw Object.assign(new Error("invalid"), { code: "P0021" });

      return setProfessionalCompensation(supabase, professional.id, { amountCents, frequency: rentFrequency, type: "chair_rental" });
    },
    onError: (error) => {
      setChoosing(false);
      onFeedback(errorMessage(error, t, t("owner.professionals.compensationError")), "error");
    },
    onSuccess: () => {
      setChoosing(false);
      setEditing(false);
      onFeedback(t("owner.professionals.compensationSaved"), "success");
      void queryClient.invalidateQueries({ queryKey: ["owner-professionals"] });
    },
  });

  // Changing an existing commission asks first: from now on only, or also the earlier appointments.
  const requestSave = () => {
    if (compType === "commission" && needsCommissionChoice(professional.compensation, { commissionPercent: Number(percent), type: "commission" })) return setChoosing(true);
    save.mutate(false);
  };

  const summary = professional.compensation.type === "commission"
    ? t("owner.professionals.summaryCommission", { percent: professional.compensation.commissionPercent })
    : t("owner.professionals.summaryChairRental", { amount: formatPriceBRL(professional.compensation.amountCents), frequency: t(`professional.frequency.${professional.compensation.frequency}`) });

  return (
    <Card variant="outlined">
      <View className="gap-3">
        <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{t("owner.professionals.compensation")}</Text>
        <Text className="text-sm font-sans text-neutral-600" testID="professional-comp-summary">{summary}</Text>
        {editing ? (
          <View className="gap-2">
            <View className="flex-row gap-2">
              <Button label={t("owner.professionals.commissionTab")} onPress={() => setCompType("commission")} size="sm" testID="comp-type-commission" variant={compType === "commission" ? "dark" : "outline"} />
              <Button label={t("owner.professionals.chairRentalTab")} onPress={() => setCompType("chair_rental")} size="sm" testID="comp-type-chair_rental" variant={compType === "chair_rental" ? "dark" : "outline"} />
            </View>
            {compType === "commission" ? (
              <Input keyboardType="numeric" label={t("owner.professionals.commissionPercentLabel")} onChangeText={setPercent} placeholder={t("examples.percent")} testID="comp-percent" value={percent} />
            ) : (
              <>
                <Input keyboardType="numeric" label={t("owner.professionals.rentalAmountLabel")} onChangeText={setRent} placeholder={t("examples.money")} testID="comp-rent" value={rent} />
                <View className="flex-row gap-2">
                  {(["weekly", "monthly"] as const).map((frequency) => (
                    <Button key={frequency} label={t(`professional.frequency.${frequency}`)} onPress={() => setRentFrequency(frequency)} size="sm" testID={`comp-freq-${frequency}`} variant={rentFrequency === frequency ? "dark" : "outline"} />
                  ))}
                </View>
              </>
            )}
            <View className="flex-row gap-2">
              <Button disabled={save.isPending} label={t("owner.professionals.saveCompensation")} onPress={requestSave} size="sm" testID="comp-save" />
              <Button label={t("common.cancel")} onPress={() => setEditing(false)} size="sm" variant="outline" />
            </View>
          </View>
        ) : (
          <Button label={t("common.edit")} onPress={() => setEditing(true)} size="sm" testID="professional-comp-edit" variant="outline" />
        )}
        <ConfirmDialog
          alternateLabel={t("owner.professionals.commissionChange.retroactive")}
          body={t("owner.professionals.commissionChange.body", { percent: Number(percent) })}
          busy={save.isPending}
          cancelLabel={t("owner.professionals.commissionChange.cancel")}
          confirmLabel={t("owner.professionals.commissionChange.forward")}
          confirmVariant="dark"
          onAlternate={() => save.mutate(true)}
          onCancel={() => setChoosing(false)}
          onConfirm={() => save.mutate(false)}
          title={t("owner.professionals.commissionChange.title")}
          visible={choosing}
        />
      </View>
    </Card>
  );
}
