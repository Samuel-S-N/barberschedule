import { X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { DateInput } from "../../../components/ui/MaskedInputs";
import { colors } from "../../../lib/design/colors";
import { centsToReaisInput, parseReaisToCents } from "../../../lib/money";
import type { PayoutOverviewItem } from "../types";
import { PeriodBreakdown } from "./PeriodBreakdown";

type Props = {
  busy: boolean;
  item: PayoutOverviewItem | null;
  onClose: () => void;
  onSubmit: (input: { amountCents: number; note: string; paidOn: string }) => void;
  today: string;
};

// Pop-up over the list (like the agenda's booking sheet): what is open for the barber, then amount, date and note of a payment already made.
export function PayoutSheet({ busy, item, onClose, onSubmit, today }: Props) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const barberId = item?.barberId;
  const balanceCents = item?.balanceCents ?? 0;

  // Reset only when a different barber is opened; a background refetch must not wipe what is being typed.
  useEffect(() => {
    if (!barberId) return;
    setAmount(balanceCents > 0 ? centsToReaisInput(balanceCents) : "");
    setPaidOn(today);
    setNote("");
    setError(null);
  }, [barberId, today]);

  if (!item) return null;

  const submit = () => {
    const amountCents = parseReaisToCents(amount);

    if (amountCents === null) return setError(t("errors.codes.PAYOUT_INVALID"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return setError(t("payouts.form.dateInvalid"));
    setError(null);
    onSubmit({ amountCents, note, paidOn });
  };

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View className="flex-1 items-center justify-center bg-black/40 p-5" testID="payout-sheet-backdrop">
        {/* Tapping the dimmed area outside the window closes it (a sibling layer, so the scrolling form is not wrapped in a Pressable). */}
        <Pressable accessible={false} className="absolute bottom-0 left-0 right-0 top-0" focusable={false} onPress={onClose} testID="payout-sheet-dismiss" />
        <View className="max-h-full w-full max-w-[420px] rounded-2xl bg-surface" testID="payout-sheet">
          <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled">
            <View className="gap-3 p-5">
              <View className="flex-row items-start justify-between gap-2">
                <Text accessibilityRole="header" className="flex-1 text-xl font-display-semibold text-ink">{t("payouts.sheet.title", { name: item.barberName })}</Text>
                <Pressable accessibilityLabel={t("agendaCard.close")} accessibilityRole="button" className="h-11 w-11 items-center justify-center" hitSlop={8} onPress={onClose} testID="payout-sheet-close">
                  <X color={colors.ink} size={22} />
                </Pressable>
              </View>
              <Text className="text-sm font-sans text-neutral-600">{t("payouts.sheet.note")}</Text>
              <View className="gap-1 rounded-xl border border-neutral-300 p-3">
                <Text className="text-xs font-sans-medium text-neutral-500">{t("payouts.sheet.open")}</Text>
                <PeriodBreakdown item={item} showTotal testIdPrefix="payout-sheet-period" />
              </View>
              <Input keyboardType="numeric" label={t("payouts.form.amount")} onChangeText={setAmount} placeholder={t("examples.money")} testID="payout-amount" value={amount} />
              <DateInput label={t("payouts.form.date")} onChangeValue={setPaidOn} testID="payout-date" value={paidOn} />
              <Input label={t("payouts.form.note")} onChangeText={setNote} placeholder={t("examples.payoutNote")} testID="payout-note" value={note} />
              {error ? <Text className="text-sm font-sans text-danger-500">{error}</Text> : null}
              <View className="flex-row gap-2">
                <Button disabled={busy} label={t("payouts.form.save")} onPress={submit} size="sm" testID="payout-submit" />
                <Button label={t("common.cancel")} onPress={onClose} size="sm" variant="outline" />
              </View>
            </View>
          </KeyboardAwareScrollView>
        </View>
      </View>
    </Modal>
  );
}
