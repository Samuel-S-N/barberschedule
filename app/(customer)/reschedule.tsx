import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { AppointmentCard } from "../../src/components/domain/AppointmentCard";
import { EmptyState } from "../../src/components/domain/EmptyState";
import { MonthCalendar } from "../../src/components/domain/MonthCalendar";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { TimeSlotPicker } from "../../src/components/domain/TimeSlotPicker";
import type { TimeSlot } from "../../src/components/domain/TimeSlotPicker";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { listMyAppointments, rescheduleAppointment } from "../../src/features/appointments/lifecycle";
import { useAppointmentCards } from "../../src/features/appointments/use-appointment-cards";
import { getAvailableSlotsQueryOptions } from "../../src/features/availability/query";
import type { AvailableSlot } from "../../src/features/availability/types";
import { errorMessage } from "../../src/i18n/errors";
import { formatInstantInShopTime } from "../../src/lib/dates/shop-time";
import { useSupabaseSession } from "../../src/providers/AppProviders";
import { Screen } from "../../src/components/ui/Screen";

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
  const { supabase } = useSupabaseSession();
  const today = formatInstantInShopTime(new Date()).localDate;
  const [localDate, setLocalDate] = useState(today);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upcoming = useQuery({ queryFn: () => listMyAppointments(supabase), queryKey: ["my-appointments", "upcoming"] });
  const current = upcoming.data?.find((appointment) => appointment.id === appointmentId);
  const toCardProps = useAppointmentCards(current ? [current] : []);
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
    onError: (caught) => {
      setError(errorMessage(caught, t as never, t("reschedule.error")));
      // The slot may have just been taken by someone else; drop the stale choice and refetch the list.
      setStartsAt(null);
      void queryClient.invalidateQueries({ queryKey: ["available-slots"] });
    },
    onSuccess: async () => {
      void queryClient.invalidateQueries({ queryKey: ["available-slots"] });
      await queryClient.invalidateQueries({ queryKey: ["my-appointments"] });
      // dismissTo pops back to the tabs already underneath; replace would mount a second tab navigator.
      router.dismissTo("/appointments");
    },
  });

  return (
    <Screen edges={["top", "bottom", "left", "right"]} className="flex-1 bg-canvas">
      <ScrollView className="flex-1">
        <View className="items-center gap-4 p-5">
          <Text accessibilityRole="header" className="w-full max-w-[420px] text-3xl font-display-bold text-ink">{t("reschedule.title")}</Text>
          {current ? (
            <View className="w-full max-w-[420px] gap-2">
              <Text className="text-sm font-sans-medium text-neutral-600">{t("reschedule.current")}</Text>
              <AppointmentCard {...toCardProps(current)} testID="reschedule-current" />
            </View>
          ) : null}
          <MonthCalendar
            onSelectDate={(date) => { setLocalDate(date); setStartsAt(null); }}
            selectedDate={localDate}
            today={today}
          />
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
