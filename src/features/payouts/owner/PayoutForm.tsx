import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { DateInput } from "../../../components/ui/MaskedInputs";
import { centsToReaisInput, parseReaisToCents } from "../../../lib/money";

type Props = { balanceCents: number; busy: boolean; onCancel: () => void; onSubmit: (input: { amountCents: number; note: string; paidOn: string }) => void; today: string };

export function PayoutForm({ balanceCents, busy, onCancel, onSubmit, today }: Props) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState(balanceCents > 0 ? centsToReaisInput(balanceCents) : "");
  const [paidOn, setPaidOn] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const amountCents = parseReaisToCents(amount);

    if (amountCents === null) return setError(t("errors.codes.PAYOUT_INVALID"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return setError(t("payouts.form.dateInvalid"));
    setError(null);
    onSubmit({ amountCents, note, paidOn });
  };

  return (
    <View className="gap-2">
      <Input keyboardType="numeric" label={t("payouts.form.amount")} onChangeText={setAmount} placeholder={t("examples.money")} testID="payout-amount" value={amount} />
      <DateInput label={t("payouts.form.date")} onChangeValue={setPaidOn} testID="payout-date" value={paidOn} />
      <Input label={t("payouts.form.note")} onChangeText={setNote} placeholder={t("examples.payoutNote")} testID="payout-note" value={note} />
      {error ? <Text className="text-sm font-sans text-danger-500">{error}</Text> : null}
      <View className="flex-row gap-2">
        <Button disabled={busy} label={t("payouts.form.save")} onPress={submit} size="sm" testID="payout-submit" />
        <Button label={t("common.cancel")} onPress={onCancel} size="sm" variant="outline" />
      </View>
    </View>
  );
}
