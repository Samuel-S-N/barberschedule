import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { EmptyState } from "../../components/domain/EmptyState";
import { MonthCalendar } from "../../components/domain/MonthCalendar";
import { ScreenHeader } from "../../components/domain/ScreenHeader";
import { SkeletonBlock } from "../../components/domain/SkeletonLoader";
import { StepBar } from "../../components/domain/StepBar";
import { TimeSlotPicker } from "../../components/domain/TimeSlotPicker";
import type { TimeSlot } from "../../components/domain/TimeSlotPicker";
import { Toast } from "../../components/domain/Toast";
import { Button } from "../../components/ui/Button";
import { Screen } from "../../components/ui/Screen";
import { errorMessage } from "../../i18n/errors";
import { useLanguage } from "../../i18n/use-language";
import { formatInstantInShopTime } from "../../lib/dates/shop-time";
import { formatDateNumeric } from "../../lib/i18n/format";
import { useSupabaseSession } from "../../providers/AppProviders";
import { getAvailableSlotsQueryOptions } from "../availability/query";
import type { AvailableSlot } from "../availability/types";
import { rescheduleAppointment } from "./lifecycle";

export type RescheduleFlowProps = {
  appointmentId: string;
  barberId: string;
  barberServiceId: string;
  // The slot being moved; shown in the review.
  current: { localDate: string; localTime: string } | null;
  // Shown above the calendar on the first step.
  currentCard: ReactNode;
  // Back on the first step and "keep the current time".
  onExit: () => void;
  // After a successful move: refresh the lists and leave.
  onMoved: () => Promise<void> | void;
  // Service / barber (or customer) rows of the review.
  summaryRows: Array<[label: string, value: string]>;
  testPrefix: "move" | "reschedule";
};

type Step = "date" | "review" | "time";
const FLOW = ["date", "time", "review", "confirm"] as const;

// Reschedule like the booking wizard: date › time › review › confirm, with the step bar on top.
// "Confirm" is the button of the review step, as in booking, so it has no screen of its own.
export function RescheduleFlow({ appointmentId, barberId, barberServiceId, current, currentCard, onExit, onMoved, summaryRows, testPrefix }: RescheduleFlowProps) {
  const { t } = useTranslation();
  const language = useLanguage();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const today = formatInstantInShopTime(new Date()).localDate;
  const [trail, setTrail] = useState<Step[]>(["date"]);
  const step = trail[trail.length - 1];
  const [localDate, setLocalDate] = useState(today);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const go = (next: Step) => setTrail((existing) => [...existing, next]);
  const goBack = () => (trail.length > 1 ? setTrail((existing) => existing.slice(0, -1)) : onExit());

  const availability = useQuery({
    ...getAvailableSlotsQueryOptions(supabase, { barberId, barberServiceId, localDate }),
    enabled: Boolean(barberId && barberServiceId),
  });
  const slots: TimeSlot[] = (availability.data ?? []).map((slot: AvailableSlot) => ({ status: slot.startsAt === startsAt ? "selected" : "free", time: slot.localTime.slice(0, 5) }));
  const chosen = startsAt ? formatInstantInShopTime(new Date(startsAt)) : null;

  const move = useMutation({
    mutationFn: (newStartsAt: string) => rescheduleAppointment(supabase, appointmentId, newStartsAt),
    onError: (caught) => {
      setError(errorMessage(caught, t, t("reschedule.error")));
      // The time may have just been taken: drop the stale choice, go back to the times and reload them.
      setStartsAt(null);
      setTrail((existing) => existing.slice(0, existing.indexOf("time") + 1));
      void queryClient.invalidateQueries({ queryKey: ["available-slots"] });
    },
    onSuccess: async () => {
      void queryClient.invalidateQueries({ queryKey: ["available-slots"] });
      await onMoved();
    },
  });

  const title = step === "date" ? t("reschedule.dateTitle") : step === "time" ? t("reschedule.timeTitle") : t("reschedule.reviewTitle");
  const rows: Array<[string, string]> = [
    ...summaryRows,
    ...(current ? ([[t("reschedule.currentSlot"), `${formatDateNumeric(current.localDate, language)} · ${current.localTime}`]] as Array<[string, string]>) : []),
    ...(chosen ? ([[t("reschedule.newSlot"), `${formatDateNumeric(chosen.localDate, language)} · ${chosen.localTime}`]] as Array<[string, string]>) : []),
  ];

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "bottom", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center gap-4 p-5">
          <View className="w-full max-w-[420px]">
            <ScreenHeader backLabel={t("common.back")} onBack={goBack} title={title} />
          </View>
          <StepBar
            canSelect={(key) => trail.includes(key as Step)}
            currentKey={step}
            label={t("book.stepOf", { current: FLOW.indexOf(step) + 1, name: t(`reschedule.steps.${step}`), total: FLOW.length })}
            onSelect={(key) => setTrail((existing) => existing.slice(0, existing.indexOf(key as Step) + 1))}
            steps={FLOW.map((key) => ({ key, label: t(`reschedule.steps.${key}`) }))}
          />

          {step === "date" ? (
            <>
              {currentCard ? (
                <View className="w-full max-w-[420px] gap-2">
                  <Text className="text-sm font-sans-medium text-neutral-600">{t("reschedule.current")}</Text>
                  {currentCard}
                </View>
              ) : null}
              <MonthCalendar onSelectDate={(date) => { setLocalDate(date); setStartsAt(null); }} selectedDate={localDate} today={today} />
              <View className="w-full max-w-[420px]">
                <Button label={t("book.continue")} onPress={() => go("time")} size="lg" testID={`${testPrefix}-continue`} />
              </View>
            </>
          ) : null}

          {step === "time" ? (
            <View className="w-full max-w-[420px] gap-3">
              <Text className="text-sm font-sans text-neutral-600">{formatDateNumeric(localDate, language)}</Text>
              {availability.isLoading ? <SkeletonBlock height={56} width={320} /> : null}
              {availability.error ? <Text className="text-sm font-sans text-danger-500">{t("reschedule.loadError")}</Text> : null}
              {!availability.isLoading && !availability.error && slots.length === 0 ? <EmptyState title={t("reschedule.noTimes")} /> : null}
              {slots.length > 0 ? (
                <TimeSlotPicker onSelectSlot={(time) => setStartsAt(availability.data?.find((slot: AvailableSlot) => slot.localTime.slice(0, 5) === time)?.startsAt ?? null)} slots={slots} />
              ) : null}
              <Button disabled={!startsAt} label={t("book.continue")} onPress={() => go("review")} size="lg" testID={`${testPrefix}-continue`} />
            </View>
          ) : null}

          {step === "review" ? (
            <View className="w-full max-w-[420px] gap-4">
              <View className="gap-2 rounded-[20px] bg-neutral-50 p-4" testID={`${testPrefix}-summary`}>
                {rows.map(([label, value]) => (
                  <View className="flex-row justify-between gap-3" key={label}>
                    <Text className="text-sm font-sans text-neutral-600">{label}</Text>
                    <Text className="flex-shrink text-right text-sm font-sans-semibold text-ink">{value}</Text>
                  </View>
                ))}
              </View>
              <View className="gap-2">
                <Button disabled={!startsAt || move.isPending} label={t("reschedule.confirm")} onPress={() => startsAt && move.mutate(startsAt)} size="lg" testID={`${testPrefix}-confirm`} />
                <Button label={t("reschedule.keep")} onPress={onExit} testID={`${testPrefix}-keep`} variant="ghost" />
              </View>
            </View>
          ) : null}

          <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
        </View>
      </ScrollView>
    </Screen>
  );
}
