import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { CalendarStrip } from "../../src/components/domain/CalendarStrip";
import { EmptyState } from "../../src/components/domain/EmptyState";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { TimeSlotPicker } from "../../src/components/domain/TimeSlotPicker";
import type { TimeSlot } from "../../src/components/domain/TimeSlotPicker";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { rescheduleAppointment } from "../../src/features/appointments/lifecycle";
import { getAvailableSlotsQueryOptions } from "../../src/features/availability/query";
import type { AvailableSlot } from "../../src/features/availability/types";
import { errorMessage } from "../../src/i18n/errors";
import { useLanguage } from "../../src/i18n/use-language";
import { buildCalendarStripDays } from "../../src/lib/dates/calendar-strip-days";
import { useSupabaseSession } from "../../src/providers/AppProviders";
import { Screen } from "../../src/components/ui/Screen";

const DAYS_AHEAD = 14;

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default function RescheduleScreen() {
  const params = useLocalSearchParams<{ appointmentId?: string; barberId?: string; barberServiceId?: string }>();
  const appointmentId = param(params.appointmentId);
  const barberId = param(params.barberId);
  const barberServiceId = param(params.barberServiceId);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const language = useLanguage();
  const { supabase } = useSupabaseSession();
  const days = useMemo(() => buildCalendarStripDays(new Date(), DAYS_AHEAD, language), [language]);
  const [localDate, setLocalDate] = useState(days[0].date);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const availability = useQuery({
    ...getAvailableSlotsQueryOptions(supabase, { barberId, barberServiceId, localDate }),
    enabled: Boolean(barberId && barberServiceId),
  });
  const slots: TimeSlot[] = (availability.data ?? []).map((slot: AvailableSlot) => ({
    status: slot.startsAt === startsAt ? "selected" : "free",
    time: slot.localTime,
  }));

  const reschedule = useMutation({
    mutationFn: (newStartsAt: string) => rescheduleAppointment(supabase, appointmentId, newStartsAt),
    onError: (caught) => setError(errorMessage(caught, t as never, t("reschedule.error"))),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-appointments"] });
      router.replace("/appointments");
    },
  });

  return (
    <Screen edges={["top", "left", "right"]} className="flex-1 bg-canvas">
      <ScrollView className="flex-1">
        <View className="items-center gap-4 p-5">
          <Text accessibilityRole="header" className="w-full max-w-[420px] text-3xl font-display-bold text-ink">{t("reschedule.title")}</Text>
          <View className="w-full">
            <CalendarStrip
              days={days}
              onSelectDate={(date) => { setLocalDate(date); setStartsAt(null); }}
              selectedDate={localDate}
            />
          </View>
          <View className="w-full max-w-[420px] gap-2">
            {availability.isLoading ? <SkeletonBlock height={56} width={320} /> : null}
            {availability.error ? <Text className="text-sm font-sans text-danger-500">{t("reschedule.loadError")}</Text> : null}
            {!availability.isLoading && !availability.error && slots.length === 0 ? <EmptyState title={t("reschedule.noTimes")} /> : null}
            {slots.length > 0 ? (
              <TimeSlotPicker
                onSelectSlot={(time) => setStartsAt(availability.data?.find((slot: AvailableSlot) => slot.localTime === time)?.startsAt ?? null)}
                slots={slots}
              />
            ) : null}
          </View>
          <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
          <View className="w-full max-w-[420px] gap-2">
            <Button
              disabled={!startsAt || reschedule.isPending}
              label={t("reschedule.confirm")}
              onPress={() => startsAt && reschedule.mutate(startsAt)}
              size="lg"
              testID="reschedule-confirm"
            />
            <Button label={t("reschedule.keep")} onPress={() => router.back()} variant="ghost" />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
