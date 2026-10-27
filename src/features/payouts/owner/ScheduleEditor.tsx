import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { DateInput } from "../../../components/ui/MaskedInputs";
import { errorMessage } from "../../../i18n/errors";
import { useSupabaseSession } from "../../../providers/AppProviders";
import { setBarberPayoutSchedule } from "../api";
import { isValidSchedule, scheduleText } from "../schedule";
import type { PayoutSchedule, PayoutScheduleConfig } from "../types";

const SCHEDULES: PayoutSchedule[] = ["none", "weekly", "biweekly", "monthly"];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;

type Props = {
  barberId: string;
  current: { config: PayoutScheduleConfig; trackingStart: string | null };
  onFeedback: (message: string, variant: "error" | "success") => void;
};

export function ScheduleEditor({ barberId, current, onFeedback }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const [schedule, setSchedule] = useState<PayoutSchedule>(current.config.schedule);
  const [day1, setDay1] = useState<string>(current.config.day1 === null ? "" : String(current.config.day1));
  const [day2, setDay2] = useState<string>(current.config.day2 === null ? "" : String(current.config.day2));
  const [trackingStart, setTrackingStart] = useState(current.trackingStart ?? "");

  const toNumber = (value: string) => (value.trim() === "" ? null : Number(value));
  const config: PayoutScheduleConfig = {
    day1: schedule === "none" ? null : toNumber(day1),
    day2: schedule === "biweekly" ? toNumber(day2) : null,
    schedule,
  };
  const dateOk = trackingStart === "" || /^\d{4}-\d{2}-\d{2}$/.test(trackingStart);
  const valid = isValidSchedule(config) && dateOk;

  const save = useMutation({
    mutationFn: () => setBarberPayoutSchedule(supabase, barberId, config, trackingStart === "" ? null : trackingStart),
    onError: (error) => onFeedback(errorMessage(error, t, t("owner.barbers.compensationError")), "error"),
    onSuccess: () => {
      onFeedback(t("payouts.schedule.saved"), "success");
      void queryClient.invalidateQueries({ queryKey: ["owner-barbers"] });
      void queryClient.invalidateQueries({ queryKey: ["payout-overview"] });
    },
  });

  return (
    <View className="gap-2">
      <Text accessibilityRole="header" className="text-base font-display-semibold text-ink">{t("payouts.schedule.label")}</Text>
      <Text className="text-sm font-sans text-neutral-600" testID="payout-schedule-summary">{scheduleText(t, current.config)}</Text>
      <View className="flex-row flex-wrap gap-2">
        {SCHEDULES.map((option) => (
          <Button key={option} label={t(`payouts.schedule.options.${option}`)} onPress={() => setSchedule(option)} size="sm" testID={`payout-schedule-${option}`} variant={schedule === option ? "dark" : "outline"} />
        ))}
      </View>
      {schedule === "weekly" ? (
        <View className="flex-row flex-wrap gap-2">
          {WEEKDAYS.map((weekday) => (
            <Button key={weekday} label={t(`payouts.weekdayShort.d${weekday}`)} onPress={() => setDay1(String(weekday))} size="sm" testID={`payout-weekday-${weekday}`} variant={day1 === String(weekday) ? "dark" : "outline"} />
          ))}
        </View>
      ) : null}
      {schedule === "biweekly" ? (
        <View className="flex-row gap-2">
          <View className="flex-1"><Input keyboardType="numeric" label={t("payouts.schedule.firstDay")} onChangeText={setDay1} placeholder={t("examples.day")} testID="payout-day-1" value={day1} /></View>
          <View className="flex-1"><Input keyboardType="numeric" label={t("payouts.schedule.secondDay")} onChangeText={setDay2} placeholder={t("examples.day")} testID="payout-day-2" value={day2} /></View>
        </View>
      ) : null}
      {schedule === "monthly" ? <Input keyboardType="numeric" label={t("payouts.schedule.dayOfMonth")} onChangeText={setDay1} placeholder={t("examples.day")} testID="payout-day-1" value={day1} /> : null}
      {schedule === "biweekly" || schedule === "monthly" ? <Text className="text-xs font-sans text-neutral-600">{t("payouts.schedule.shortMonthHint")}</Text> : null}
      <DateInput label={t("payouts.schedule.trackingStart")} onChangeValue={setTrackingStart} testID="payout-tracking-start" value={trackingStart} />
      <Button disabled={!valid || save.isPending} label={t("owner.barbers.saveCompensation")} onPress={() => save.mutate()} size="sm" testID="payout-schedule-save" />
    </View>
  );
}
