import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { EmptyState } from "../../src/components/domain/EmptyState";
import { MonthCalendar } from "../../src/components/domain/MonthCalendar";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { TimeSlotPicker } from "../../src/components/domain/TimeSlotPicker";
import type { TimeSlot } from "../../src/components/domain/TimeSlotPicker";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { Screen } from "../../src/components/ui/Screen";
import { rescheduleAppointment } from "../../src/features/appointments/lifecycle";
import { getAvailableSlotsQueryOptions } from "../../src/features/availability/query";
import type { AvailableSlot } from "../../src/features/availability/types";
import { errorMessage } from "../../src/i18n/errors";
import { formatInstantInShopTime } from "../../src/lib/dates/shop-time";
import { useSupabaseSession } from "../../src/providers/AppProviders";

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

// The barber's counterpart of the customer's reschedule screen: pick the day on the month calendar, then a time that day.
export default function MoveAppointmentScreen() {
  const params = useLocalSearchParams<{ appointmentId?: string; barberId?: string; barberServiceId?: string; customerName?: string; serviceName?: string; startsAt?: string }>();
  const appointmentId = param(params.appointmentId);
  const barberId = param(params.barberId);
  const barberServiceId = param(params.barberServiceId);
  const currentStart = param(params.startsAt);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { supabase } = useSupabaseSession();
  const today = formatInstantInShopTime(new Date()).localDate;
  const [localDate, setLocalDate] = useState(today);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const availability = useQuery({
    ...getAvailableSlotsQueryOptions(supabase, { barberId, barberServiceId, localDate }),
    enabled: Boolean(barberId && barberServiceId),
  });
  const slots: TimeSlot[] = (availability.data ?? []).map((slot: AvailableSlot) => ({
    status: slot.startsAt === startsAt ? "selected" : "free",
    time: slot.localTime.slice(0, 5),
  }));
  const current = currentStart ? formatInstantInShopTime(new Date(currentStart)) : null;

  const goToAgenda = (moved: boolean) =>
    router.navigate(moved ? { params: { moved: "1" }, pathname: "/my-agenda" } : "/my-agenda");

  const move = useMutation({
    mutationFn: (newStartsAt: string) => rescheduleAppointment(supabase, appointmentId, newStartsAt),
    onError: (caught) => {
      setError(errorMessage(caught, t, t("reschedule.error")));
      // The time may have just been taken: drop the stale choice and reload the day's times.
      setStartsAt(null);
      void queryClient.invalidateQueries({ queryKey: ["available-slots"] });
    },
    onSuccess: async () => {
      void queryClient.invalidateQueries({ queryKey: ["available-slots"] });
      void queryClient.invalidateQueries({ queryKey: ["barber-slots"] });
      void queryClient.invalidateQueries({ queryKey: ["barber-report"] });
      await queryClient.invalidateQueries({ queryKey: ["barber-agenda"] });
      goToAgenda(true);
    },
  });

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "bottom", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center gap-4 p-5">
          <Text accessibilityRole="header" className="w-full max-w-[420px] text-3xl font-display-bold text-ink">{t("reschedule.title")}</Text>
          <View className="w-full max-w-[420px] gap-2">
            <Text className="text-sm font-sans-medium text-neutral-600">{t("reschedule.current")}</Text>
            <Card testID="move-current">
              <View className="gap-1">
                <Text className="text-base font-sans-semibold text-ink">{param(params.customerName)} · {param(params.serviceName)}</Text>
                {current ? <Text className="text-sm font-sans text-neutral-600" style={{ fontVariant: ["tabular-nums"] }}>{current.localDate} {current.localTime}</Text> : null}
              </View>
            </Card>
          </View>
          <MonthCalendar
            onSelectDate={(date) => {
              setLocalDate(date);
              setStartsAt(null);
            }}
            selectedDate={localDate}
            today={today}
          />
          <View className="w-full max-w-[420px] gap-2">
            {availability.isLoading ? <SkeletonBlock height={56} width={320} /> : null}
            {availability.error ? <Text className="text-sm font-sans text-danger-500">{t("reschedule.loadError")}</Text> : null}
            {!availability.isLoading && !availability.error && slots.length === 0 ? <EmptyState title={t("reschedule.noTimes")} /> : null}
            {slots.length > 0 ? (
              <TimeSlotPicker
                onSelectSlot={(time) => setStartsAt(availability.data?.find((slot: AvailableSlot) => slot.localTime.slice(0, 5) === time)?.startsAt ?? null)}
                slots={slots}
              />
            ) : null}
          </View>
          <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
          <View className="w-full max-w-[420px] gap-2">
            <Button disabled={!startsAt || move.isPending} label={t("reschedule.confirm")} onPress={() => startsAt && move.mutate(startsAt)} size="lg" testID="move-confirm" />
            <Button label={t("reschedule.keep")} onPress={() => goToAgenda(false)} testID="move-keep" variant="ghost" />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
