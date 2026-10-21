import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, Text, View } from "react-native";

import { EmptyState } from "../../components/domain/EmptyState";
import { SkeletonBlock } from "../../components/domain/SkeletonLoader";
import { TimeSlotPicker } from "../../components/domain/TimeSlotPicker";
import { Button } from "../../components/ui/Button";
import { DateInput } from "../../components/ui/MaskedInputs";
import { useLanguage } from "../../i18n/use-language";
import { colors } from "../../lib/design/colors";
import { formatDateNumeric } from "../../lib/i18n/format";
import { useSupabaseSession } from "../../providers/AppProviders";
import { getAvailableSlots } from "../availability/api";
import type { AvailableSlot } from "../availability/types";

type Props = {
  barberId: string;
  barberServiceId: string;
  busy: boolean;
  // The conflicted occurrence date: the sheet starts there.
  date: string;
  onClose: () => void;
  onConfirm: (startsAt: string) => void;
  visible: boolean;
};

// Pop-up to move one conflicted occurrence: pick a date, then one of the barber's free times.
export function ConflictRescheduleSheet({ barberId, barberServiceId, busy, date, onClose, onConfirm, visible }: Props) {
  const { t } = useTranslation();
  const language = useLanguage();
  const { supabase } = useSupabaseSession();
  const [localDate, setLocalDate] = useState(date);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(localDate);

  // Each time the sheet opens it starts again at the conflicted date with nothing chosen.
  useEffect(() => {
    if (!visible) return;
    setLocalDate(date);
    setStartsAt(null);
  }, [date, visible]);

  const slots = useQuery({
    enabled: visible && dateValid,
    queryFn: () => getAvailableSlots(supabase, { barberId, barberServiceId, localDate }),
    queryKey: ["conflict-slots", barberId, barberServiceId, localDate],
  });

  if (!visible) return null;

  const rows = (slots.data ?? []).map((slot: AvailableSlot) => ({ status: slot.startsAt === startsAt ? ("selected" as const) : ("free" as const), time: slot.localTime.slice(0, 5) }));

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <Pressable className="flex-1 items-center justify-center bg-black/40 p-5" onPress={onClose}>
        <Pressable className="w-full max-w-[420px] gap-3 rounded-2xl bg-surface p-5" onPress={() => undefined} testID="conflict-sheet">
          <View className="flex-row items-start justify-between gap-2">
            <Text accessibilityRole="header" className="flex-1 text-xl font-display-semibold text-ink">{t("owner.conflicts.sheetTitle", { date: formatDateNumeric(date, language) })}</Text>
            <Pressable accessibilityLabel={t("agendaCard.close")} accessibilityRole="button" className="h-11 w-11 items-center justify-center" hitSlop={8} onPress={onClose} testID="conflict-sheet-close">
              <X color={colors.ink} size={22} />
            </Pressable>
          </View>
          <DateInput label={t("owner.conflicts.sheetDate")} onChangeValue={(value) => { setLocalDate(value); setStartsAt(null); }} testID="conflict-sheet-date" value={localDate} />
          <Text className="text-sm font-sans-medium text-neutral-700">{t("owner.conflicts.sheetTimes")}</Text>
          {slots.isLoading ? <SkeletonBlock height={56} width={320} /> : null}
          {slots.isSuccess && rows.length === 0 ? <EmptyState title={t("owner.conflicts.noTimes")} /> : null}
          {rows.length > 0 ? (
            <TimeSlotPicker
              onSelectSlot={(time) => setStartsAt((slots.data ?? []).find((slot: AvailableSlot) => slot.localTime.slice(0, 5) === time)?.startsAt ?? null)}
              slots={rows}
            />
          ) : null}
          <Button disabled={!startsAt || busy} label={t("owner.conflicts.sheetConfirm")} onPress={() => startsAt && onConfirm(startsAt)} testID="conflict-sheet-confirm" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
