import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { ScreenHeader } from "../../../src/components/domain/ScreenHeader";
import { SkeletonBlock } from "../../../src/components/domain/SkeletonLoader";
import { Toast } from "../../../src/components/domain/Toast";
import { Button } from "../../../src/components/ui/Button";
import { Card } from "../../../src/components/ui/Card";
import { Screen } from "../../../src/components/ui/Screen";
import { DateInput, TimeInput } from "../../../src/components/ui/MaskedInputs";
import { listMyBarberAgenda } from "../../../src/features/appointments/barber-agenda";
import { getMyBarberProfile, getMyLunchBreak, listMyWorkingPeriods, setMyLunchBreak } from "../../../src/features/barbers/api";
import { createScheduleOverride, deleteScheduleOverride, listMyScheduleOverrides } from "../../../src/features/schedule/api";
import { appointmentsInAbsence, expandAbsenceDates } from "../../../src/features/schedule/absence-range";
import { errorMessage } from "../../../src/i18n/errors";
import { useLanguage } from "../../../src/i18n/use-language";
import { formatInstantInShopTime } from "../../../src/lib/dates/shop-time";
import { formatDateNumeric } from "../../../src/lib/i18n/format";
import { useBack } from "../../../src/lib/navigation/use-back";
import { pullToRefresh, useRefreshAll } from "../../../src/lib/use-refresh";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

const WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function BarberAvailabilityScreen() {
  const { t } = useTranslation();
  const language = useLanguage();
  const pull = useRefreshAll();
  const back = useBack();
  const queryClient = useQueryClient();
  const { profile, supabase } = useSupabaseSession();
  const today = formatInstantInShopTime(new Date()).localDate;
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const [lunchStart, setLunchStart] = useState("");
  const [lunchEnd, setLunchEnd] = useState("");
  const [from, setFrom] = useState(today);
  const [until, setUntil] = useState("");
  const [absenceStart, setAbsenceStart] = useState("");
  const [absenceEnd, setAbsenceEnd] = useState("");
  const [conflictCount, setConflictCount] = useState(0);
  const [confirmed, setConfirmed] = useState(false);

  const periods = useQuery({ queryFn: () => listMyWorkingPeriods(supabase), queryKey: ["my-working-periods", profile?.userId] });
  const barber = useQuery({ queryFn: () => getMyBarberProfile(supabase), queryKey: ["my-barber-profile", profile?.userId] });
  const lunch = useQuery({ queryFn: () => getMyLunchBreak(supabase), queryKey: ["my-lunch", profile?.userId] });
  const absences = useQuery({
    enabled: Boolean(barber.data),
    queryFn: async () => (await listMyScheduleOverrides(supabase, barber.data?.id ?? "", today)).filter((item) => item.kind === "block"),
    queryKey: ["barber-blocks", barber.data?.id, today],
  });

  useEffect(() => {
    setLunchStart(lunch.data?.start ?? "");
    setLunchEnd(lunch.data?.end ?? "");
  }, [lunch.data]);

  const fail = (caught: unknown, fallback: string) => setFeedback({ message: errorMessage(caught, t, fallback), variant: "error" });
  const refreshSchedule = () => {
    void queryClient.invalidateQueries({ queryKey: ["barber-blocks"] });
    void queryClient.invalidateQueries({ queryKey: ["barber-slots"] });
    void queryClient.invalidateQueries({ queryKey: ["barber-agenda"] });
  };

  const lunchValid = TIME.test(lunchStart) && TIME.test(lunchEnd) && lunchStart < lunchEnd;
  const saveLunch = useMutation({
    mutationFn: (value: { end: string; start: string } | null) => setMyLunchBreak(supabase, value),
    onError: (caught) => fail(caught, t("barber.availability.lunchError")),
    onSuccess: () => {
      setFeedback({ message: t("barber.availability.lunchSaved"), variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["my-lunch"] });
      void queryClient.invalidateQueries({ queryKey: ["barber-slots"] });
    },
  });

  const timed = absenceStart !== "" || absenceEnd !== "";
  const timesValid = !timed || (TIME.test(absenceStart) && TIME.test(absenceEnd) && absenceStart < absenceEnd);
  const absenceValid = /^\d{4}-\d{2}-\d{2}$/.test(from) && from >= today && (until === "" || /^\d{4}-\d{2}-\d{2}$/.test(until)) && timesValid;
  const resetWarning = () => {
    setConfirmed(false);
    setConflictCount(0);
  };

  const addAbsence = useMutation({
    mutationFn: async () => {
      if (!barber.data) throw new Error("Barber profile not loaded.");
      const dates = expandAbsenceDates(from, until || null);

      if (!confirmed) {
        const agenda = await listMyBarberAgenda(supabase, { limit: 100, offset: 0, rangeEnd: dates[dates.length - 1], rangeStart: dates[0] });
        const affected = appointmentsInAbsence(agenda, dates, timed ? absenceStart : null, timed ? absenceEnd : null);

        if (affected.length > 0) return { affected: affected.length };
      }
      for (const localDate of dates) {
        await createScheduleOverride(supabase, {
          barberId: barber.data.id,
          endTime: timed ? absenceEnd : null,
          kind: "block",
          localDate,
          shopId: barber.data.shopId,
          startTime: timed ? absenceStart : null,
        });
      }

      return { affected: 0 };
    },
    onError: (caught) => fail(caught, t("barber.availability.absenceError")),
    onSuccess: ({ affected }) => {
      if (affected > 0) {
        setConflictCount(affected);
        setConfirmed(true);

        return;
      }
      resetWarning();
      setUntil("");
      setAbsenceStart("");
      setAbsenceEnd("");
      setFeedback({ message: t("barber.availability.absenceAdded"), variant: "success" });
      refreshSchedule();
    },
  });

  const removeAbsence = useMutation({
    mutationFn: (id: string) => deleteScheduleOverride(supabase, id),
    onError: (caught) => fail(caught, t("barber.availability.absenceError")),
    onSuccess: refreshSchedule,
  });

  const busy = saveLunch.isPending || addAbsence.isPending || removeAbsence.isPending;

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView refreshControl={pullToRefresh(pull)} bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("barber.hub.menu.availability")} />

            <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("barber.availability.hoursTitle")}</Text>
            <Text className="text-sm font-sans text-neutral-600" testID="barber-hours-note">{t("barber.availability.hoursNote")}</Text>
            {periods.isLoading ? <SkeletonBlock height={96} width={320} /> : null}
            {periods.error ? <Text className="text-sm font-sans text-danger-500">{errorMessage(periods.error, t, t("barber.availability.loadError"))}</Text> : null}
            {periods.data ? (
              <Card variant="outlined">
                <View className="gap-3">
                  {WEEKDAY_KEYS.map((key, index) => {
                    const day = periods.data.filter((period) => period.weekday === index + 1);

                    return (
                      <View className="flex-row items-center justify-between gap-3" key={key} testID={`barber-hours-${key}`}>
                        <Text className="text-base font-sans-medium text-ink">{t(`owner.schedule.weekdays.${key}`)}</Text>
                        <Text className="flex-1 text-right text-base font-sans text-neutral-700" style={{ fontVariant: ["tabular-nums"] }}>
                          {day.length === 0 ? t("barber.availability.closed") : day.map((period) => `${period.startTime}–${period.endTime}`).join(", ")}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </Card>
            ) : null}

            <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("barber.availability.lunchTitle")}</Text>
            <Card variant="outlined">
              <View className="gap-3">
                <Text className="text-sm font-sans text-neutral-600">{t("barber.availability.lunchHint")}</Text>
                <View className="flex-row items-end gap-2">
                  <View className="flex-1"><TimeInput label={t("common.startTime")} onChangeValue={setLunchStart} testID="lunch-start" value={lunchStart} /></View>
                  <View className="flex-1"><TimeInput label={t("common.endTime")} onChangeValue={setLunchEnd} testID="lunch-end" value={lunchEnd} /></View>
                </View>
                <Button disabled={busy || !lunchValid} label={t("barber.availability.lunchSave")} onPress={() => saveLunch.mutate({ end: lunchEnd, start: lunchStart })} testID="lunch-save" />
                {lunch.data ? <Button disabled={busy} label={t("barber.availability.lunchRemove")} onPress={() => saveLunch.mutate(null)} testID="lunch-remove" variant="outline" /> : null}
              </View>
            </Card>

            <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("barber.availability.absencesTitle")}</Text>
            {absences.data && absences.data.length === 0 ? <Text className="text-sm font-sans text-neutral-600">{t("barber.availability.absencesNone")}</Text> : null}
            {(absences.data ?? []).map((absence) => (
              <Card key={absence.id} testID={`absence-${absence.id}`} variant="outlined">
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="flex-1 text-base font-sans-medium text-ink" style={{ fontVariant: ["tabular-nums"] }}>
                    {formatDateNumeric(absence.localDate, language)} · {absence.startTime ? `${absence.startTime.slice(0, 5)}–${absence.endTime?.slice(0, 5)}` : t("barber.availability.absenceAllDay")}
                  </Text>
                  <Button disabled={busy} label={t("barber.availability.absenceRemove")} onPress={() => removeAbsence.mutate(absence.id)} size="sm" testID={`absence-remove-${absence.id}`} variant="danger" />
                </View>
              </Card>
            ))}
            <Card>
              <View className="gap-3">
                <DateInput label={t("barber.availability.absenceFrom")} onChangeValue={(value) => { setFrom(value); resetWarning(); }} testID="absence-from" value={from} />
                <DateInput label={t("barber.availability.absenceUntil")} onChangeValue={(value) => { setUntil(value); resetWarning(); }} testID="absence-until" value={until} />
                <View className="flex-row items-end gap-2">
                  <View className="flex-1"><TimeInput label={t("common.startTime")} onChangeValue={(value) => { setAbsenceStart(value); resetWarning(); }} testID="absence-start" value={absenceStart} /></View>
                  <View className="flex-1"><TimeInput label={t("common.endTime")} onChangeValue={(value) => { setAbsenceEnd(value); resetWarning(); }} testID="absence-end" value={absenceEnd} /></View>
                </View>
                {conflictCount > 0 ? <Text className="text-sm font-sans text-danger-500" testID="absence-conflict">{t("barber.availability.absenceConflict", { count: conflictCount })}</Text> : null}
                <Button
                  disabled={busy || !barber.data || !absenceValid}
                  label={conflictCount > 0 ? t("barber.availability.absenceConfirm") : t("barber.availability.absenceAdd")}
                  onPress={() => addAbsence.mutate()}
                  testID={conflictCount > 0 ? "absence-confirm" : "absence-add"}
                />
              </View>
            </Card>
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
