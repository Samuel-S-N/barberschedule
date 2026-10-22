import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { ScreenHeader } from "../../components/domain/ScreenHeader";
import { StepBar } from "../../components/domain/StepBar";
import { Toast } from "../../components/domain/Toast";
import { Button } from "../../components/ui/Button";
import { Screen } from "../../components/ui/Screen";
import { errorMessage } from "../../i18n/errors";
import { useLanguage } from "../../i18n/use-language";
import { formatInstantInShopTime } from "../../lib/dates/shop-time";
import { addLocalDays } from "../../lib/dates/calendar-strip-days";
import { BOOKING_DAYS_AHEAD } from "../../lib/dates/month-calendar";
import { formatDateNumeric } from "../../lib/i18n/format";
import { DateStep, TimeStep } from "../availability/steps";

export type RescheduleFlowProps = {
  barberId: string;
  barberServiceId: string;
  // The slot being moved; shown in the review.
  current: { localDate: string; localTime: string } | null;
  // Label of the review's "current" row (default: the current time).
  currentLabel?: string;
  // Shown above the calendar on the first step.
  currentCard: ReactNode;
  // Title of that block (default: the current appointment).
  currentTitle?: string;
  // The day the calendar starts on, if it is inside the booking window (today..30 days); otherwise today.
  initialDate?: string;
  // Label of the "keep" button (default: keep the current time).
  keepLabel?: string;
  // Back on the first step and "keep the current time".
  onExit: () => void;
  // After a successful move: refresh the lists and leave.
  onMoved: () => Promise<void> | void;
  // The final action: reschedule the appointment, resolve the conflict...
  submit: (startsAt: string) => Promise<unknown>;
  // Service / barber (or customer) rows of the review.
  summaryRows: Array<[label: string, value: string]>;
  testPrefix: "conflict" | "move" | "owner" | "reschedule";
};

type Step = "date" | "review" | "time";
const FLOW = ["date", "time", "review", "confirm"] as const;

// Reschedule like the booking wizard: date › time › review › confirm, with the step bar on top.
// "Confirm" is the button of the review step, as in booking, so it has no screen of its own.
export function RescheduleFlow({ barberId, barberServiceId, current, currentCard, currentLabel, currentTitle, initialDate, keepLabel, onExit, onMoved, submit, summaryRows, testPrefix }: RescheduleFlowProps) {
  const { t } = useTranslation();
  const language = useLanguage();
  const queryClient = useQueryClient();
  const today = formatInstantInShopTime(new Date()).localDate;
  const [trail, setTrail] = useState<Step[]>(["date"]);
  const step = trail[trail.length - 1];
  const [localDate, setLocalDate] = useState(initialDate && initialDate > today && initialDate <= addLocalDays(today, BOOKING_DAYS_AHEAD) ? initialDate : today);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const go = (next: Step) => setTrail((existing) => [...existing, next]);
  const goBack = () => (trail.length > 1 ? setTrail((existing) => existing.slice(0, -1)) : onExit());

  const chosen = startsAt ? formatInstantInShopTime(new Date(startsAt)) : null;

  const move = useMutation({
    mutationFn: (newStartsAt: string) => submit(newStartsAt),
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
    ...(current ? ([[currentLabel ?? t("reschedule.currentSlot"), `${formatDateNumeric(current.localDate, language)} · ${current.localTime}`]] as Array<[string, string]>) : []),
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
            <DateStep localDate={localDate} onChange={(date) => { setLocalDate(date); setStartsAt(null); }} onContinue={() => go("time")} testID={`${testPrefix}-continue`} today={today}>
              {currentCard ? (
                <View className="w-full max-w-[420px] gap-2">
                  <Text className="text-sm font-sans-medium text-neutral-600">{currentTitle ?? t("reschedule.current")}</Text>
                  {currentCard}
                </View>
              ) : null}
            </DateStep>
          ) : null}

          {step === "time" ? (
            <TimeStep barberId={barberId} barberServiceId={barberServiceId} localDate={localDate} onContinue={() => go("review")} onSelect={setStartsAt} startsAt={startsAt} testID={`${testPrefix}-continue`} />
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
                <Button label={keepLabel ?? t("reschedule.keep")} onPress={onExit} testID={`${testPrefix}-keep`} variant="ghost" />
              </View>
            </View>
          ) : null}

          <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
        </View>
      </ScrollView>
    </Screen>
  );
}
