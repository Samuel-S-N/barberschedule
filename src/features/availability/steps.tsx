import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { EmptyState } from "../../components/domain/EmptyState";
import { MonthCalendar } from "../../components/domain/MonthCalendar";
import { SkeletonBlock } from "../../components/domain/SkeletonLoader";
import { TimeSlotPicker } from "../../components/domain/TimeSlotPicker";
import type { TimeSlot } from "../../components/domain/TimeSlotPicker";
import { Button } from "../../components/ui/Button";
import { useLanguage } from "../../i18n/use-language";
import { formatDateNumeric } from "../../lib/i18n/format";
import { useSupabaseSession } from "../../providers/AppProviders";
import { getAvailableSlotsQueryOptions } from "./query";
import type { AvailableSlot } from "./types";

// The two steps every date-and-time scheduling flow shares (reschedule, move, conflict, owner booking):
// pick the day on the month calendar, then one of that day's free times.

export function DateStep({ children, localDate, maxDaysAhead, onChange, onContinue, testID, today }: { children?: ReactNode; localDate: string; maxDaysAhead?: number; onChange: (date: string) => void; onContinue: () => void; testID: string; today: string }) {
  const { t } = useTranslation();

  return (
    <>
      {children}
      <MonthCalendar maxDaysAhead={maxDaysAhead} onSelectDate={onChange} selectedDate={localDate} today={today} />
      <View className="w-full max-w-[420px]">
        <Button label={t("book.continue")} onPress={onContinue} size="lg" testID={testID} />
      </View>
    </>
  );
}

type TimeStepProps = {
  barberId: string;
  barberServiceId: string;
  localDate: string;
  onContinue: () => void;
  onSelect: (startsAt: string | null) => void;
  startsAt: string | null;
  testID: string;
};

export function TimeStep({ barberId, barberServiceId, localDate, onContinue, onSelect, startsAt, testID }: TimeStepProps) {
  const { t } = useTranslation();
  const language = useLanguage();
  const { supabase } = useSupabaseSession();
  const availability = useQuery({
    ...getAvailableSlotsQueryOptions(supabase, { barberId, barberServiceId, localDate }),
    enabled: Boolean(barberId && barberServiceId),
  });
  const slots: TimeSlot[] = (availability.data ?? []).map((slot: AvailableSlot) => ({ status: slot.startsAt === startsAt ? "selected" : "free", time: slot.localTime.slice(0, 5) }));

  return (
    <View className="w-full max-w-[420px] gap-3">
      <Text className="text-sm font-sans text-neutral-600">{formatDateNumeric(localDate, language)}</Text>
      {availability.isLoading ? <SkeletonBlock height={56} width={320} /> : null}
      {availability.error ? <Text className="text-sm font-sans text-danger-500">{t("reschedule.loadError")}</Text> : null}
      {!availability.isLoading && !availability.error && slots.length === 0 ? <EmptyState title={t("reschedule.noTimes")} /> : null}
      {slots.length > 0 ? (
        <TimeSlotPicker onSelectSlot={(time) => onSelect(availability.data?.find((slot: AvailableSlot) => slot.localTime.slice(0, 5) === time)?.startsAt ?? null)} slots={slots} />
      ) : null}
      <Button disabled={!startsAt} label={t("book.continue")} onPress={onContinue} size="lg" testID={testID} />
    </View>
  );
}
